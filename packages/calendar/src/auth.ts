// Service-account auth. Turns the GOOGLE_SERVICE_ACCOUNT_JSON blob (raw or base64)
// into a JWT client that mints short-lived access tokens for the Calendar REST API.
// Ports the auth half of playground/Calendar Sync/service_account_manager.py.

import { JWT } from 'google-auth-library';

export const CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar'];

export interface ServiceAccountKey {
	client_email: string;
	private_key: string;
	[k: string]: unknown;
}

/**
 * Accepts raw JSON or base64-encoded JSON. Returns null when the input is missing
 * or does not look like a service-account key (so callers can fall back to no-op).
 */
export function parseServiceAccountKey(input: string | null | undefined): ServiceAccountKey | null {
	if (!input) return null;
	let text = input.trim();
	if (!text.startsWith('{')) {
		try {
			text = Buffer.from(text, 'base64').toString('utf8');
		} catch {
			return null;
		}
	}
	try {
		const obj = JSON.parse(text) as ServiceAccountKey;
		if (typeof obj.client_email !== 'string' || typeof obj.private_key !== 'string') return null;
		return obj;
	} catch {
		return null;
	}
}

export function createJwtClient(key: ServiceAccountKey): JWT {
	return new JWT({
		email: key.client_email,
		key: key.private_key,
		scopes: CALENDAR_SCOPES,
	});
}
