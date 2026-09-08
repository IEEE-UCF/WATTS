import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { getServerSession } from "next-auth";
import { appRouter, createTRPCContext } from "@watts/api";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/database/client";

const handler = async (req: Request) => {
	const session = await getServerSession(authOptions);

	return fetchRequestHandler({
		endpoint: "/api/trpc",
		req,
		router: appRouter,
		createContext: () =>
			createTRPCContext({
				db,
				session,
				headers: req.headers,
			}),
		onError:
      process.env.NODE_ENV === "development"
      	? ({ path, error }) => {
      		console.error(
      			`tRPC failed on ${path ?? "<no-path>"}: ${error.message}`,
      		);
      	}
      	: undefined,
	});
};

export { handler as GET, handler as POST };
