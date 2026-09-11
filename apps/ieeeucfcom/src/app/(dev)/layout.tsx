import Link from 'next/link';
import { notFound } from 'next/navigation';
import { groupedMeta } from '@/dev/registry/meta';
import { GROUP_LABELS } from '@/dev/registry/types';

/**
 * Dev-only component gallery. Three gates:
 *  1. this check — off in production unless NEXT_PUBLIC_ENABLE_DEV_GALLERY=1
 *  2. src/middleware.ts adds `/dev` to the admin-only route list
 *  3. the route group inherits the root layout's providers (session, tRPC)
 */
const enabledInProd = process.env.NEXT_PUBLIC_ENABLE_DEV_GALLERY === '1';

export const metadata = { title: 'Component gallery', robots: { index: false, follow: false } };

export default function DevLayout({ children }: { children: React.ReactNode }) {
	if (process.env.NODE_ENV === 'production' && !enabledInProd) notFound();

	const groups = groupedMeta();

	return (
		<div className="flex min-h-dvh bg-background text-foreground">
			<aside className="w-64 shrink-0 overflow-y-auto border-r border-border p-4">
				<Link href="/dev" className="t-h5 block">
					Component gallery
				</Link>
				<p className="mt-1 text-xs text-muted-foreground">dev only · not in production</p>

				<nav className="mt-6 flex flex-col gap-6 text-sm">
					{groups.map(({ group, entries }) => (
						<div key={group}>
							<p className="t-eyebrow text-muted-foreground">{GROUP_LABELS[group]}</p>
							<ul className="mt-2 flex flex-col gap-0.5">
								{entries.map((e) => (
									<li key={e.slug}>
										<Link
											href={`/dev/${e.slug}`}
											className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-accent hover:text-accent-foreground"
										>
											<span>{e.name}</span>
											{e.status !== 'ok' && (
												<span className="text-[10px] text-muted-foreground uppercase">
													{e.status}
												</span>
											)}
										</Link>
									</li>
								))}
							</ul>
						</div>
					))}
				</nav>
			</aside>

			<main className="flex-1 overflow-y-auto p-8">{children}</main>
		</div>
	);
}
