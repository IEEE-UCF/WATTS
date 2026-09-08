import { TRPCError } from '@trpc/server';
import { isDomainError } from '@watts/core/errors';
import { UploadError, uploadErrorTRPCCode } from '@watts/storage/finalize';

/**
 * Turn a thrown @watts/core `DomainError` into the equivalent `TRPCError`
 * (its codes are a subset of TRPC_ERROR_CODE, so they pass straight through).
 * Anything else becomes an INTERNAL_SERVER_ERROR. Call from a router `catch`.
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

/**
 * Same idea for the upload path's `UploadError` (`@watts/storage`), which is a
 * separate error type from `DomainError`. One mapping, shared by the storage router
 * and `event.confirmPhoto`. Anything else becomes an INTERNAL_SERVER_ERROR.
 */
export function mapUploadError(e: unknown): never {
	if (e instanceof UploadError) {
		throw new TRPCError({ code: uploadErrorTRPCCode(e.code), message: e.message });
	}
	throw new TRPCError({
		code: 'INTERNAL_SERVER_ERROR',
		message: e instanceof Error ? e.message : 'Upload finalize failed',
	});
}
