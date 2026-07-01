import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
	schema: "./prisma/schema.prisma",
	datasource: {
		// `prisma generate` (CI type-check, builds) never connects, so it must not
		// hard-fail when DATABASE_URL is absent. Fall back to a placeholder for
		// schema-only commands; real runtime/migrations use the actual env value.
		// Uses `||` (not `??`) so an empty-string DATABASE_URL — what an unset CI
		// secret expands to — also falls back instead of passing "" to Prisma.
		url:
			process.env.DATABASE_URL || "postgresql://placeholder:placeholder@localhost:5432/placeholder",
	},
});
