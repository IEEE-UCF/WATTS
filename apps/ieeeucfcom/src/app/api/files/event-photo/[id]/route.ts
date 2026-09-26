// Gated event-photo delivery.
//   visibility = 'public' (and approved)  → anyone, cacheable (the public event feed)
//   otherwise                             → officers / admins only, no-store
// Bytes always live in the private bucket; this route is the only way to read them.

import { eq } from 'drizzle-orm';
import { db } from '@/lib/database/client';
import { EventPhotos } from '@watts/db/schema';
import { getStorage } from '@watts/storage';
import { requireCapability } from '@/lib/auth-guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await params;

	const [photo] = await db
		.select({
			webKey: EventPhotos.webKey,
			contentType: EventPhotos.contentType,
			visibility: EventPhotos.visibility,
			approved: EventPhotos.approved,
		})
		.from(EventPhotos)
		.where(eq(EventPhotos.id, id))
		.limit(1);

	if (!photo) {
		return new Response('Not found', { status: 404 });
	}

	const isPublic = photo.visibility === 'public' && photo.approved;

	if (!isPublic) {
		const gate = await requireCapability('manage_event_photos');
		if (gate instanceof Response) return gate;
	}

	const storage = await getStorage();
	let stream;
	try {
		stream = await storage.getStream({ key: photo.webKey, bucket: 'private' });
	} catch {
		return new Response('Not found', { status: 404 });
	}

	const headers: Record<string, string> = {
		'Content-Type': photo.contentType || stream.contentType || 'image/jpeg',
		'X-Content-Type-Options': 'nosniff',
	};
	if (isPublic) {
		headers['Cache-Control'] = 'public, max-age=86400, immutable';
		// `max-age` only caches in the browser; Vercel's CDN caches function responses only
		// with `s-maxage` (or a CDN-specific header). This one is CDN-only (not sent to
		// browsers), so public photos stop invoking this function + a private Blob read on
		// every view. Trade-off: an un-approved / un-published photo can keep being served
		// from the CDN for up to a week, so shorten this (or purge by tag) if public posting
		// of people's photos goes live.
		headers['Vercel-CDN-Cache-Control'] = 'public, s-maxage=604800';
	} else {
		headers['Cache-Control'] = 'private, no-store, max-age=0';
		headers['X-Robots-Tag'] = 'noindex, nofollow';
	}
	if (stream.size) headers['Content-Length'] = String(stream.size);

	return new Response(stream.stream, { status: 200, headers });
}
