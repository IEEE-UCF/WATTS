import { TRPCError } from '@trpc/server';
import { isDomainError } from '@watts/core/errors';

/**
 * Turn a thrown @watts/core `DomainError` into the equivalent `TRPCError`
 * (its codes are a subset of TRPC_ERROR_CODE, so they pass straight through).
 * Anything else becomes an INTERNAL_SERVER_ERROR. Call from a router `catch`.
 *
 * Moves into @watts/api with the routers in Phase 6.
 */
export function mapDomainError(e: unknown): never {
	if (isDomainError(e)) {
		throw new TRPCError({ code: e.code, message: e.message });
	}
	throw new TRPCError({
		code: 'INTERNAL_SERVER_ERROR',
		message: e instanceof Error ? e.message : 'Unexpected error',
	});
}
