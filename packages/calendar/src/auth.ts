// Service-account auth. Turns the configured key (raw JSON, base64 JSON, or a
// path to the key file) into a JWT client that mints short-lived access tokens
// for the Calendar REST API. Ports the auth half of
// playground/Calendar Sync/service_account_manager.py.

import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { JWT } from 'google-auth-library';
import { findRepoRoot } from '@watts/config/load-env';

export const CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar'];

export interface ServiceAccountKey {
	client_email: string;
	private_key: string;
	[k: string]: unknown;
}

function parseKeyJson(text: string): ServiceAccountKey | null {
	try {
		const obj = JSON.parse(text) as ServiceAccountKey;
		if (typeof obj.client_email !== 'string' || typeof obj.private_key !== 'string') return null;
		return obj;
	} catch {
		return null;
	}
}

function readKeyFile(pathish: string): ServiceAccountKey | null {
	const candidates = isAbsolute(pathish)
		? [pathish]
		: [resolve(process.cwd(), pathish), resolve(findRepoRoot() ?? process.cwd(), pathish)];
	for (const p of candidates) {
		if (existsSync(p)) {
			try {
				return parseKeyJson(readFileSync(p, 'utf8'));
			} catch {
				return null;
			}
		}
	}
	return null;
}

/**
 * Resolve a service-account key from any of: raw JSON, base64-encoded JSON, or a
 * filesystem path (absolute, or relative to cwd / the repo root). `filePath` is a
 * lower-priority explicit fallback (GOOGLE_SERVICE_ACCOUNT_FILE). Returns null
 * when nothing resolves to a usable key.
 */
export function resolveServiceAccountKey(
	value: string | null | undefined,
	filePath?: string | null,
): ServiceAccountKey | null {
	const raw = value?.trim();
	if (raw) {
		if (raw.startsWith('{')) {
			const k = parseKeyJson(raw);
			if (k) return k;
		} else {
			// base64 JSON?
			try {
				const decoded = Buffer.from(raw, 'base64').toString('utf8');
				if (decoded.trim().startsWith('{')) {
					const k = parseKeyJson(decoded);
					if (k) return k;
				}
			} catch {
				/* not base64 — fall through to path */
			}
			// a path?
			const k = readKeyFile(raw);
			if (k) return k;
		}
	}
	if (filePath) return readKeyFile(filePath);
	return null;
}

export function createJwtClient(key: ServiceAccountKey): JWT {
	return new JWT({
		email: key.client_email,
		key: key.private_key,
		scopes: CALENDAR_SCOPES,
	});
}
