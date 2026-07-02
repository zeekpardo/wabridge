import { Resend } from "resend";

import { config } from "../config";
import type { SendEmailHandler } from "../types";

// Lazy: the Resend constructor throws when the key is missing, and this module is
// imported during `next build` (no RESEND_API_KEY present), so construct it only
// on first send — never at import time.
let client: Resend | null = null;

function getClient(): Resend {
	if (!client) {
		const apiKey = process.env.RESEND_API_KEY;
		if (!apiKey) {
			throw new Error("Missing RESEND_API_KEY — cannot send email.");
		}
		client = new Resend(apiKey);
	}
	return client;
}

export const send: SendEmailHandler = async ({
	to,
	from,
	subject,
	cc,
	bcc,
	replyTo,
	html,
	text,
}) => {
	await getClient().emails.send({
		from: from ?? config.mailFrom,
		to: [to],
		cc,
		bcc,
		replyTo,
		subject,
		html,
		text,
	});
};
