'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn } from '@watts/ui/cn';
import {
	Sidebar,
	SidebarContent,
	SidebarHeader,
	SidebarProvider,
	SidebarTrigger,
} from '@watts/ui/sidebar';
import { trpc } from '@/lib/trpc/client';
import { AvatarMenu } from '@/components/avatarmenu';
import { Navbar } from '@/components/navbar';
import { visibleNavGroups, type NavAuthStatus } from './nav-config';

/**
 * Hotswap flag — the sidebar shell below is built, wired, and verified, but temporarily
 * switched off in favor of the old per-page Navbar while it's evaluated further. Every
 * consumer (admin/layout.tsx, /dashboard, /staff, /settings) already renders
 * `<DashboardShell>` and nothing else — flipping this back to `true` is the entire
 * swap-back, no consumer needs to change.
 */
const USE_SIDEBAR_SHELL = false;

/** The pre-shell look: just the marketing Navbar on top of the page content, no sidebar.
 * Matches what every one of these pages rendered individually before the shell existed. */
function LegacyShell({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex min-h-screen flex-col bg-black">
			<div className="w-full px-5">
				<Navbar />
			</div>
			<main className="flex-1">{children}</main>
		</div>
	);
}

interface AvatarInfo {
	discordAvatar: string | null;
	name: string;
	email: string | null;
	role: string | null;
}

interface DashboardShellViewProps {
	children: React.ReactNode;
	pathname: string;
	auth: (NavAuthStatus & AvatarInfo) | undefined;
}

/** Presentational half — no data fetching, so the /dev gallery can render it with mock auth. */
export function DashboardShellView({ children, pathname, auth }: DashboardShellViewProps) {
	const groups = visibleNavGroups(auth);
	const crumbs = pathname.split('/').filter(Boolean);

	return (
		<SidebarProvider
			defaultOpen={false}
			style={{ '--sidebar-width': '15rem' } as React.CSSProperties}
		>
			<Sidebar>
				<SidebarHeader>
					<Link href="/" className="flex items-center gap-2 border-b border-border pb-4">
						<Image
							src="/iconography/ieeeucficon.png"
							alt=""
							width={26}
							height={26}
							className="object-contain"
						/>
						<span className="font-heading text-sm tracking-wide text-sidebar-foreground">
							WATTS
						</span>
					</Link>
				</SidebarHeader>
				<SidebarContent>
					{groups.map((group) => (
						<div key={group.label}>
							<div className="mb-1.5 px-2 font-mono text-[10px] tracking-[0.14em] text-muted-foreground-dim uppercase">
								{group.label}
							</div>
							<nav className="flex flex-col gap-0.5">
								{group.items.map((item) => {
									const active =
										pathname === item.href ||
										pathname.startsWith(`${item.href}/`);
									return (
										<Link
											key={item.href}
											href={item.href}
											className={cn(
												'rounded-md px-2 py-1.5 text-sm transition-colors',
												active
													? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
													: 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
											)}
										>
											{item.label}
										</Link>
									);
								})}
							</nav>
						</div>
					))}
				</SidebarContent>
			</Sidebar>

			<div className="flex min-w-0 flex-1 flex-col bg-background">
				<header className="flex items-center gap-3 border-b border-border px-4 py-3.5 lg:px-6">
					<SidebarTrigger className="text-muted-foreground" />
					<span className="font-mono text-xs text-muted-foreground-dim">
						watts
						{crumbs.map((crumb, i) => (
							<span key={i}>
								{' / '}
								<span
									className={
										i === crumbs.length - 1
											? 'text-muted-foreground'
											: undefined
									}
								>
									{crumb}
								</span>
							</span>
						))}
					</span>
					<div className="ml-auto flex items-center gap-3">
						{auth?.isMember && auth.discordAvatar ? (
							<AvatarMenu
								image={auth.discordAvatar}
								name={auth.name}
								email={auth.email}
								role={auth.role}
								navAuth={auth}
							/>
						) : (
							<Link
								href="/auth/signin"
								className="text-sm text-ieee-dark-yellow hover:underline"
							>
								Sign in
							</Link>
						)}
					</div>
				</header>
				<main className="min-w-0 flex-1 px-4 py-6 lg:px-8">{children}</main>
			</div>
		</SidebarProvider>
	);
}

/** Wraps a member/staff/admin page: fetches the viewer's role facts once via the same
 * `getAuthStatus` call the navbar already uses, and filters the sidebar accordingly. */
export function DashboardShell({ children }: { children: React.ReactNode }) {
	// Hooks stay unconditional even in the legacy branch below (Rules of Hooks) — no real
	// waste, since <Navbar> inside LegacyShell calls this same query itself and React Query
	// dedupes identical queries, same as before the shell existed.
	const { data } = trpc.auth.getAuthStatus.useQuery();
	const pathname = usePathname();

	if (!USE_SIDEBAR_SHELL) {
		return <LegacyShell>{children}</LegacyShell>;
	}

	// Read once, ahead of any narrowing on `data.member` below — avoids TS collapsing
	// `data.user`'s type to `never` in the branch where `data.member` is falsy.
	const memberFirstName = data?.member?.firstName;
	const memberLastName = data?.member?.lastName;
	const memberEmail = data?.member?.ucfEmail;
	const sessionUserName = data?.user?.name;
	const sessionUserEmail = data?.user?.email;

	const auth = data
		? {
				isMember: data.isMember,
				isOfficer: data.isOfficer,
				isAdmin: data.isAdmin,
				hasStaffAccess: data.hasStaffAccess,
				permissions: data.permissions,
				discordAvatar: data.discordAvatar,
				name: memberFirstName
					? `${memberFirstName} ${memberLastName}`
					: (sessionUserName ?? 'Member'),
				email: memberEmail ?? sessionUserEmail ?? null,
				role: data.isAdmin
					? 'Administrator'
					: data.isOfficer
						? data.officerRole
							? `Officer · ${data.officerRole}`
							: 'Officer'
						: null,
			}
		: undefined;

	return (
		<DashboardShellView pathname={pathname ?? ''} auth={auth}>
			{children}
		</DashboardShellView>
	);
}
