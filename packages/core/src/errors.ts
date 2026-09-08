// The single failure channel for the domain layer. A @watts/core function that
// hits a broken invariant throws a DomainError; the caller (a thin tRPC router, a
// bot command handler, a cron job) maps `.code` onto its own transport.
//
//   NOT_FOUND    — the referenced row does not exist
//   CONFLICT     — the operation collides with existing state (duplicate, etc.)
//   FORBIDDEN    — a domain rule forbids it (inactive, dues unpaid, self-lockout…)
//   BAD_REQUEST  — the arguments are internally inconsistent
//
// These codes are a deliberate subset of tRPC's TRPC_ERROR_CODE set so a router
// can pass `code` straight through (see @watts/api `mapDomainError`).

export type DomainErrorCode = 'NOT_FOUND' | 'CONFLICT' | 'FORBIDDEN' | 'BAD_REQUEST';

export class DomainError extends Error {
	readonly code: DomainErrorCode;

	constructor(code: DomainErrorCode, message: string) {
		super(message);
		this.name = 'DomainError';
		this.code = code;
	}
}

export function isDomainError(e: unknown): e is DomainError {
	return e instanceof DomainError;
}
