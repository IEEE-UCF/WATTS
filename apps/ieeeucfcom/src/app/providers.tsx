'use client';

import { SessionProvider } from 'next-auth/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { trpc } from '@/lib/trpc/client';
import { useState } from 'react';
import superjson from 'superjson';

export function Providers({ children }: { children: React.ReactNode }) {
	// React Query's defaults (staleTime 0 + refetch on every window focus) re-run every
	// mounted tRPC query — each a session check + DB queries — whenever a tab regains
	// focus. A short staleTime keeps focus refetches but drops the redundant ones;
	// mutations still invalidate what they change immediately.
	const [queryClient] = useState(
		() => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } }),
	);
	const [trpcClient] = useState(() =>
		trpc.createClient({
			links: [
				httpBatchLink({
					url: '/api/trpc',
					transformer: superjson,
				}),
			],
		}),
	);

	return (
		// Don't re-fetch /api/auth/session (several DB queries) on every tab focus; gated
		// routes are re-validated server-side by middleware on navigation anyway.
		<SessionProvider refetchOnWindowFocus={false}>
			<trpc.Provider client={trpcClient} queryClient={queryClient}>
				<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
			</trpc.Provider>
		</SessionProvider>
	);
}
