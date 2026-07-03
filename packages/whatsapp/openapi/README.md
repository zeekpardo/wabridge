# OpenWA typed client (OpenAPI-generated) — PROTOTYPE

A typed client for the OpenWA gateway, generated from the gateway's **own
OpenAPI spec**, wrapped behind the existing `OpenWaClient` interface. It's an
alternative to the hand-rolled `fetch` client in `../lib/openwa-client.ts`.

## Why generate from the spec (vs the `@rmyndharis/openwa` SDK)

- **Version-locked to the gateway you run.** The published SDK versions
  independently and can drift; a spec pulled from *your* deployment can't.
- **Zero third-party trust surface** — no external SDK dependency.
- **Type-checked paths, params, and bodies** against reality. It already caught
  bugs (below) that the stringly-typed `fetch` client swallows silently.

## Files

- `openwa-openapi.json` — the spec, pulled from the gateway (`GET /api/docs-json`).
- `openwa-schema.ts` — generated types (do not edit by hand).
- `../lib/openwa-client.openapi.ts` — the client, implements `OpenWaClient`.

## Regenerate (when the gateway version changes)

```bash
# refresh the spec from a running gateway
curl -s https://openwa.wagoat.com/api/docs-json -o packages/whatsapp/openapi/openwa-openapi.json
# regenerate types
pnpm --filter @repo/whatsapp generate:openwa-types
```

## Spec bugs this prototype surfaced (worth fixing upstream in OpenWA)

The type-checker flagged three real gateway-spec problems. Each is marked with a
`NOTE` + cast in `openwa-client.openapi.ts`; fix them in OpenWA and the casts go away:

1. **`GET /sessions/{id}/chats` and `.../messages/{chatId}/history`** — no
   response schema documented (data typed `undefined`). Annotate the responses.
2. **Webhook `events`** — typed as a single enum value; it's an **array** at
   runtime (and per the webhooks guide). Should be `type: array`.
3. **Webhook `filters`** — over-constrained vs the runtime `Record<string, unknown>`.

Every other endpoint is fully typed with **no casts**.

## Adopting it (follow-up, not done here)

Swap `createOpenWaClient` internals to return `createOpenWaOpenApiClient(...)`.
The interface is identical, so no caller changes. Ideally also derive
`OpenWaWebhookEvent` and the webhook payload types FROM the spec so inbound
parsing (`webhook-handler.ts`) is typed too.
