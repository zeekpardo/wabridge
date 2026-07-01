# Deployment — WABridge on Railway

Production runbook. Two repos deploy as two services in **one Railway project**:

- **`saas`** — this repo (Next.js app + Hono `/api` + embedded chat UI + GHL wiring).
  Docker standalone image; **public** domain.
- **`openwa`** — the OpenWA repo (unofficial WhatsApp API, port 2785). Its own
  Dockerfile + a **persistent Volume**; **private** only.

Plus two plugins: **Postgres** and **Redis**.

```
Railway project "wabridge"
├── saas      Dockerfile + Next standalone      app.<domain>   (public)
├── openwa    OpenWA Dockerfile + Volume /app/data             (private)
├── Postgres  plugin        internal → saas ; public → migrate:deploy
└── Redis     plugin        internal → saas
   external: GoHighLevel cloud (OAuth, SSO, Delivery URL) → saas public domain
```

Pattern is copied from the manuscript project (also a supastarter monorepo whose
app is named `saas`): **Docker → Next standalone, migrations run out of band,
`NEXT_PUBLIC_*` are build args.**

---

## Phase 0 — Repo prerequisites (DO FIRST)

These files/settings must exist in this repo before Railway can build. Status:

| Item | State |
| --- | --- |
| `apps/saas/next.config.ts` → `output: "standalone"` | **TODO** |
| `Dockerfile` (multi-stage standalone) | **TODO** |
| `.dockerignore` | **TODO** |
| `railway.toml` (`builder = "dockerfile"`) | **TODO** |
| `packages/database` → `migrate:deploy` script | **TODO** |
| Prisma migrations baselined (currently on `db push`) | **TODO** |
| `pnpm-workspace.yaml` `allowBuilds` incl. `prisma-zod-generator` | partial |
| OpenWA repo `Dockerfile` | present |

`railway.toml` start command (identical to manuscript — app is also `saas`):

```toml
[build]
builder = "dockerfile"
dockerfilePath = "Dockerfile"

[deploy]
startCommand = "node apps/saas/.next/standalone/apps/saas/server.js"
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

Verify the image locally before pushing:

```bash
docker build \
  --build-arg NEXT_PUBLIC_SAAS_URL=http://localhost:3000 \
  -t wabridge:verify .
```

### Migrations (the one real task)

We've iterated with `prisma db push`; production must be migration-managed.
Baseline once from the current schema, then deploy migrations out of band (the
runtime image ships only standalone output — no Prisma CLI inside it):

```bash
# one-time baseline (creates prisma/migrations/0_init)
cd packages/database
pnpm prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/0_init/migration.sql   # then `migrate resolve --applied 0_init`

# every deploy, against the Railway Postgres PUBLIC url:
DATABASE_URL=<public> DIRECT_URL=<public> SHADOW_DATABASE_URL=<distinct> \
  pnpm --filter @repo/database migrate:deploy
```

`migrate deploy` never touches the shadow DB, but `prisma.config.ts` resolves
`SHADOW_DATABASE_URL` on every CLI call, so it must be set and distinct.

---

## Phase 1 — Provision Railway services

1. **New project** → connect this GitHub repo.
2. **Postgres** → New → Database → PostgreSQL. Note both URLs: internal
   (`postgres.railway.internal:5432`) and public (`...proxy.rlwy.net`).
3. **Redis** → New → Database → Redis. Note `REDIS_URL`.
4. **saas** → deploys from the repo; Railway auto-detects `railway.toml` +
   `Dockerfile`. Under **Settings → Build**, add the build arg
   `NEXT_PUBLIC_SAAS_URL` (public URLs are inlined at build time). Add a public
   domain (`app.<domain>`). Raise build memory if it OOMs:
   `NODE_OPTIONS=--max-old-space-size=4096` (already baked into the Dockerfile).
5. **openwa** → New service → deploy the **OpenWA repo** (Docker auto-detected).
   - **Attach a Volume mounted at `/app/data`** — Baileys stores WhatsApp auth
     creds here. Without it, every redeploy re-QRs every number. Non-negotiable.
   - **No public domain** — keep it private.
   - Do **not** scale past 1 replica (a session lives in one process).

---

## Phase 2 — Environment variables

### `saas` service

```bash
# data plane (private)
DATABASE_URL=${{Postgres.DATABASE_URL}}
DIRECT_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}

# OpenWA (private network + shared key)
OPENWA_BASE_URL=http://${{openwa.RAILWAY_PRIVATE_DOMAIN}}:2785
OPENWA_API_KEY=<shared-secret>              # same value on openwa
WEBHOOK_BASE_URL=http://${{saas.RAILWAY_PRIVATE_DOMAIN}}:3000

# app
NEXT_PUBLIC_SAAS_URL=https://app.<domain>   # public; drives OAuth/SSO redirects
BETTER_AUTH_SECRET=<random 32+ bytes>
INTEGRATION_ENCRYPTION_KEY=<64 hex chars>   # AES-256 for GHL token storage
EMBEDDED_JWT_SECRET=<random>                 # embedded-session tokens (falls back to BETTER_AUTH_SECRET)
CRON_SECRET=<random>                         # guards the reconcile cron

# GoHighLevel (once the marketplace app exists — see Phase 4)
GOHIGHLEVEL_CLIENT_ID=
GOHIGHLEVEL_CLIENT_SECRET=
GOHIGHLEVEL_REDIRECT_URI=https://app.<domain>/oauth/callback
GOHIGHLEVEL_CONVERSATION_PROVIDER_ID=        # WhatsApp custom-channel provider (Option A)
GOHIGHLEVEL_WEBHOOK_PUBLIC_KEY=              # Ed25519 key for Delivery URL verification
GHL_SSO_KEY=                                 # decrypts the embedded Custom Page payload
GHL_FRAME_ANCESTORS=https://app.gohighlevel.com https://*.leadconnectorhq.com
```

### `openwa` service

```bash
OPENWA_API_KEY=<shared-secret>               # must match saas
SSRF_ALLOWED_HOSTS=${{saas.RAILWAY_PRIVATE_DOMAIN}},localhost
```

---

## Phase 3 — Post-deploy wiring

1. **Run migrations** (Phase 0) against the Postgres **public** URL.
2. **Reconcile cron** — schedule a POST every 1–2 min so sessions dropped by an
   OpenWA restart are re-started (reconnecting without QR because the Volume
   kept the creds):
   ```
   curl -X POST https://app.<domain>/api/cron/whatsapp-reconcile \
     -H "Authorization: Bearer $CRON_SECRET"
   ```
   Use a small Railway cron service or an external scheduler.
3. **Smoke test** — sign in, connect a number (QR), send a test message, confirm
   inbound webhooks land (OpenWA → saas private).

---

## Phase 4 — GoHighLevel go-live

The GHL code is env-gated; it returns `501`/`404` until configured.

1. Create the **marketplace app** (marketplace.gohighlevel.com): scopes
   `conversations.write`, `conversations/message.write`, `conversations/message.readonly`,
   `contacts.readonly`, `contacts.write`, `conversations.readonly`. Redirect URI =
   `https://app.<domain>/oauth/callback`. Set the client id/secret + SSO key
   + webhook public key in the `saas` env.
2. **SMS provider (Option B — takeover):** create a Conversation Provider, Type
   `SMS`, **do not** check "Is this a Custom Conversation Provider", Delivery URL =
   `https://app.<domain>/api/providers/sms/outbound`. Store its id as the
   subaccount's `smsProviderId`. Enable per sub-account:
   Settings → Phone Numbers → Advanced → SMS Provider.
3. **Custom Page:** point the embedded page at
   `https://app.<domain>/embedded/<orgSlug>/whatsapp/<subaccountId>`.

Once installed, `/api/ghl/oauth/authorize` → callback provisions/links the
subaccount, the Delivery URL feeds `fanOutMessage`, and inbound WhatsApp mirrors
back into the GHL SMS thread.

---

## Operational notes

- **OpenWA is stateful** — one replica, persistent `/app/data` Volume. The
  `workerBaseUrl` field on `WhatsAppSession` is the seam for multi-worker routing
  later.
- **`saas` is stateless** — scale replicas freely.
- **Storage** — chat media is inline base64 (no bucket needed). Only supastarter
  avatar upload wants S3; point it at Cloudflare R2 when needed.
- **Private vs public** — OpenWA↔saas and DB/Redis stay on the private network;
  only GHL-cloud-initiated calls (OAuth callback, SSO, Delivery URL) use the
  public domain.
