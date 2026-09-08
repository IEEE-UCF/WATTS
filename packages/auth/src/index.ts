import type { NextAuthOptions } from 'next-auth';
import DiscordProvider from 'next-auth/providers/discord';
import type { DiscordProfile } from 'next-auth/providers/discord';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { eq } from 'drizzle-orm';
import type { WattsDb } from '@watts/db';
import { Accounts, Users, Sessions } from '@watts/db/schema';
import { resolveMemberRoles } from '@watts/core/members';

/**
 * Build the NextAuth v4 options for WATTS against a given Drizzle client.
 *
 * `db` is injected (no singleton import) so the app owns the one instance and a
 * test can pass a throwaway handle. Discord OAuth + database sessions; the session
 * callback enriches `session.user` from @watts/core/members `resolveMemberRoles`
 * (the same resolver the tRPC gates use).
 *
 * Reads NEXTAUTH_SECRET / DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET from the
 * environment at call time — the caller must have loaded the root .env first.
 */
export function buildAuthOptions(db: WattsDb): NextAuthOptions {
	return {
		adapter: DrizzleAdapter(db, {
			usersTable: Users,
			accountsTable: Accounts,
			sessionsTable: Sessions,
		}),
		secret: process.env.NEXTAUTH_SECRET,
		providers: [
			DiscordProvider({
				clientId: process.env.DISCORD_CLIENT_ID!,
				clientSecret: process.env.DISCORD_CLIENT_SECRET!,
				authorization: 'https://discord.com/api/oauth2/authorize?scope=identify+email',
				profile: (profile: DiscordProfile) => {
					return {
						id: profile.id,
						name: profile.username,
						email: profile.email,
						image: profile.avatar
							? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
							: null,
					};
				},
			}),
		],
		session: {
			strategy: 'database',
			maxAge: 10 * 24 * 60 * 60, // 10 days
		},
		pages: {
			signIn: '/auth/signin',
		},
		callbacks: {
			async session({ session, user }) {
				if (!user) {
					return session;
				}

				try {
					const [account] = await db
						.select()
						.from(Accounts)
						.where(eq(Accounts.userId, user.id)) // u.id is the providerAccountId
						.limit(1);

					// member row flags + active (non-expired) capability grants — one shared
					// resolver, also used by the tRPC procedure gates.
					const roles = await resolveMemberRoles(db, user.id);

					return {
						...session,
						user: {
							...session.user,
							id: user.id,
							discordId: account?.providerAccountId || null,
							memberId: roles?.memberId || null,
							officerStatus: roles?.officerStatus || false,
							officerRole: roles?.officerRole || null,
							administrator: roles?.administrator || false,
							permissions: roles?.permissions ?? [],
						},
					};
				} catch (error) {
					console.error('Session callback error:', error);
					return session;
				}
			},

			async redirect({ url, baseUrl }) {
				if (url.startsWith('/')) return `${baseUrl}${url}`;
				if (url.startsWith(baseUrl)) return url;
				return baseUrl;
			},
		},
		debug: process.env.NODE_ENV === 'development',
	};
}
