import { redirect } from 'next/navigation';
import { EventPhotoManager } from '@/components/admin/event-photo-manager';
import { getSessionRoles } from '@/lib/auth-guards';
import { hasCapability } from '@watts/permissions';

// admin/layout.tsx requires admin-or-officer; this page needs manage_event_photos.
export default async function AdminPhotosPage() {
	const { roles } = await getSessionRoles();
	if (!hasCapability(roles, 'manage_event_photos')) redirect('/dashboard');

	return (
		<div className="mx-auto w-full max-w-6xl">
			<h1 className="mb-6 font-heading text-3xl text-ieee-dark-yellow">EVENT PHOTOS</h1>
			<EventPhotoManager />
		</div>
	);
}
