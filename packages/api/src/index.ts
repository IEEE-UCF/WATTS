import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from './root';

export * from './trpc';
export { appRouter, createCaller, type AppRouter } from './root';
export { mapDomainError, mapUploadError } from './map-domain-error';

export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
