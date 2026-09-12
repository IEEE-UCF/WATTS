import Link from 'next/link';
import { redirect } from 'next/navigation';
import { EventList } from '@/components/dashboard/event-list';
import { Card, CardHeader } from '@watts/ui/card';
import { QREventScanner } from '@/components/admin/qr_event_scanner';
import { getSessionRoles } from '@/lib/auth-guards';

const ADMIN_TOOLS = [
	{
		href: '/admin/events',
		title: 'Events',
		desc: 'Create & edit events, categories, flyers, Google Calendar sync',
	},
	{ href: '/admin/members', title: 'Members', desc: 'Grant admin / officer status & roles' },
	{ href: '/admin/photos', title: 'Event Photos', desc: 'Upload & manage photos per event' },
	{ href: '/admin/resumes', title: 'Résumés', desc: 'Browse member résumés' },
];

export default async function Dashboard() {
	// admin/layout.tsx already required admin-or-officer; this page is admin-only.
	const { roles } = await getSessionRoles();
	if (!roles?.administrator) redirect('/dashboard');

	return (
		<div className="mx-auto max-w-6xl">
			<div className="pt-2">
				<h2 className="mb-3 text-lg font-semibold text-foreground lg:text-xl">
					Admin Tools
				</h2>
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{ADMIN_TOOLS.map((tool) => (
						<Link
							key={tool.href}
							href={tool.href}
							className="rounded-xl border border-border bg-card/60 p-4 shadow-lg shadow-black/40 transition-colors hover:border-ieee-dark-yellow hover:bg-card"
						>
							<div className="text-base font-semibold text-foreground">
								{tool.title}
							</div>
							<div className="mt-1 text-sm text-muted-foreground">{tool.desc}</div>
						</Link>
					))}
				</div>
			</div>

			<div className="flex flex-col gap-6 py-6 lg:flex-row">
				{/* Left Panel – QR Scanner */}
				<section className="flex-1 rounded-xl border border-border bg-card/60 p-4 shadow-lg shadow-black/40 lg:p-6">
					<h2 className="mb-4 text-lg font-semibold text-foreground lg:text-xl">
						Event Check-In
					</h2>
					<div className="flex justify-center">
						<QREventScanner />
					</div>
				</section>

				<Card>
					<CardHeader></CardHeader>
					Event Check-In
				</Card>

				{/* Right Panel – Event Management */}
				<section className="flex-1 rounded-xl border border-border bg-card/60 p-4 shadow-lg shadow-black/40 lg:max-w-md lg:p-6">
					<div className="space-y-6">
						<div>
							<h2 className="mb-3 text-lg font-semibold text-foreground lg:text-xl">
								Events
							</h2>
							<Link
								href="/admin/events"
								className="inline-block rounded-md bg-ieee-dark-yellow px-4 py-2 text-sm font-semibold text-black"
							>
								Open event manager →
							</Link>
							<p className="mt-2 text-sm text-muted-foreground">
								Create &amp; edit events, pick a category, upload a flyer. Syncs to
								Google Calendar.
							</p>
						</div>
						<div className="border-t border-border pt-5">
							<h2 className="mb-3 text-lg font-semibold text-foreground lg:text-xl">
								Upcoming Events
							</h2>
							<EventList />
						</div>
					</div>
				</section>
			</div>
		</div>
	);
}
