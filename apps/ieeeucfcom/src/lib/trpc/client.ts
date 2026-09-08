import { createTRPCReact } from '@trpc/react-query';
import { type AppRouter } from '@watts/api';

export const trpc = createTRPCReact<AppRouter>();
