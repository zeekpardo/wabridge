import type { AuthConfig } from "./types";

export const config = {
	enableSignup: true,
	enableMagicLink: true,
	enableSocialLogin: false,
	enablePasskeys: false,
	enablePasswordLogin: true,
	enableTwoFactor: true,
	sessionCookieMaxAge: 60 * 60 * 24 * 30,
	users: {
		enableOnboarding: true,
	},
	organizations: {
		enable: true,
		hideOrganization: false,
		// Org-only: every user works inside an organization (no personal account),
		// and end users can't spin up new orgs (provisioned by an admin/invite).
		enableUsersToCreateOrganizations: false,
		requireOrganization: true,
		forbiddenOrganizationSlugs: [
			"new-organization",
			"admin",
			"settings",
			"ai-demo",
			"organization-invitation",
			"chatbot",
		],
	},
} as const satisfies AuthConfig;
