import { revalidateTag } from 'next/cache';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { getServerSession } from 'next-auth';
import { appRouter, createTRPCContext } from '@watts/api';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/database/client';
import { requestBotSync } from '@/lib/bot-sync';
import { createBotSignalSender } from '@/lib/bot-signals';

const handler = async (req: Request) => {
	const session = await getServerSession(authOptions);
	// One bot nudge per request, however many event mutations it batched.
	let botSyncRequested = false;
	// Website → bot signals for this request (batched into one webhook post).
	const botSignals = createBotSignalSender();

	return fetchRequestHandler({
		endpoint: '/api/trpc',
		req,
		router: appRouter,
		createContext: () =>
			createTRPCContext({
				db,
				session,
				headers: req.headers,
				// Published CMS changes refresh the statically rendered public pages.
				onContentChanged: (tag) => revalidateTag(tag),
				// Event changes the Discord bot mirrors → ask it to sync now (see bot-sync.ts).
				onEventsChanged: () => {
					if (botSyncRequested) return;
					botSyncRequested = true;
					requestBotSync();
				},
				botSignals,
			}),
		onError:
			process.env.NODE_ENV === 'development'
				? ({ path, error }) => {
						console.error(`tRPC failed on ${path ?? '<no-path>'}: ${error.message}`);
					}
				: undefined,
	});
};

export { handler as GET, handler as POST };
