import 'server-only';

import { getServerSession } from 'next-auth';
import { appRouter, createCallerFactory, createTRPCContext } from '@watts/api';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/database/client';

const createCaller = createCallerFactory(appRouter);

export const serverTrpc = async () => {
	const session = await getServerSession(authOptions);

	return createCaller(createTRPCContext({ db, session, headers: new Headers() }));
};
