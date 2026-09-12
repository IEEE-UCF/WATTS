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
import { visibleNavGroups, type NavAuthStatus } from './nav-config';

interface DashboardShellViewProps {
	children: React.ReactNode;
	pathname: string;
	auth: (NavAuthStatus & { discordAvatar: string | null }) | undefined;
}

/** Presentational half — no data fetching, so the /dev gallery can render it with mock auth. */
export function DashboardShellView({ children, pathname, auth }: DashboardShellViewProps) {
	const groups = visibleNavGroups(auth);
	const crumbs = pathname.split('/').filter(Boolean);

	return (
		<SidebarProvider style={{ '--sidebar-width': '15rem' } as React.CSSProperties}>
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
							<AvatarMenu image={auth.discordAvatar} />
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
	const { data: auth } = trpc.auth.getAuthStatus.useQuery();
	const pathname = usePathname();

	return (
		<DashboardShellView pathname={pathname ?? ''} auth={auth}>
			{children}
		</DashboardShellView>
	);
}
