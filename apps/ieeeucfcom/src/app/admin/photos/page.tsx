import { redirect } from 'next/navigation';
import { Navbar } from '@/components/navbar';
import { EventPhotoManager } from '@/components/admin/event-photo-manager';
import { getSessionRoles } from '@/lib/auth-guards';
import { hasCapability } from '@watts/permissions';

// admin/layout.tsx requires admin-or-officer; this page needs manage_event_photos.
export default async function AdminPhotosPage() {
	const { roles } = await getSessionRoles();
	if (!hasCapability(roles, 'manage_event_photos')) redirect('/dashboard');

	return (
		<div className="flex min-h-screen flex-col bg-black">
			<div className="w-full px-5">
				<Navbar />
			</div>
			<main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
				<h1 className="mb-6 text-3xl font-[heading-font] text-[var(--ieee-dark-yellow)]">
					EVENT PHOTOS
				</h1>
				<EventPhotoManager />
			</main>
		</div>
	);
}
