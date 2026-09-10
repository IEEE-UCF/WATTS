import { redirect } from 'next/navigation';
import { Navbar } from '@/components/navbar';
import { EventManager } from '@/components/admin/event-manager';
import { getSessionRoles } from '@/lib/auth-guards';
import { hasCapability } from '@watts/permissions';

// admin/layout.tsx requires admin-or-officer; this page needs manage_events.
export default async function AdminEventsPage() {
	const { roles } = await getSessionRoles();
	if (!hasCapability(roles, 'manage_events')) redirect('/dashboard');

	return (
		<div className="flex min-h-screen flex-col bg-black">
			<div className="w-full px-5">
				<Navbar />
			</div>
			<main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
				<h1 className="mb-6 text-3xl font-[heading-font] text-[var(--ieee-dark-yellow)]">
					EVENT MANAGEMENT
				</h1>
				<p className="mb-6 text-sm text-gray-400">
					Events created here are the source of truth. Each one mirrors to the chapter Google
					Calendar; tick <span className="text-gray-200">Global</span> to also publish a Discord
					scheduled event.
				</p>
				<EventManager />
			</main>
		</div>
	);
}
