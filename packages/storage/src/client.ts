// Browser-side upload helper. Hides the difference between the two providers:
//   local  → POST intent to /api/blob/upload, then PUT bytes to the presigned URL
//   vercel → @vercel/blob/client `upload()` token exchange
//
// Callers run the matching `storage.confirmResume` / `event.confirmPhoto` tRPC mutation
// afterwards (those need React context, so they stay in the component).

'use client';

const PROVIDER =
	process.env.NEXT_PUBLIC_STORAGE_PROVIDER === 'vercel' ? 'vercel' : 'local';

const UPLOAD_URL = '/api/blob/upload';

async function localPut(intent: Record<string, unknown>, file: Blob): Promise<{ key: string; photoId?: string }> {
	const res = await fetch(UPLOAD_URL, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(intent),
	});
	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new Error(body.error || `Upload authorization failed (${res.status})`);
	}
	const { uploadUrl, key, photoId } = await res.json();
	const put = await fetch(uploadUrl, {
		method: 'PUT',
		headers: { 'content-type': (file as File).type || 'application/octet-stream' },
		body: file,
	});
	if (!put.ok) throw new Error(`Upload failed (${put.status})`);
	return { key, photoId };
}

export async function uploadResumeFile(file: File): Promise<void> {
	const intent = {
		kind: 'resume' as const,
		contentType: file.type,
		byteSize: file.size,
		filename: file.name,
	};

	if (PROVIDER === 'vercel') {
		const { upload } = await import('@vercel/blob/client');
		// resume key is deterministic per user; the server recomputes + verifies it.
		const userId = await currentUserId();
		await upload(`resumes/${userId}.pdf`, file, {
			access: 'private',
			handleUploadUrl: UPLOAD_URL,
			clientPayload: JSON.stringify(intent),
		});
		return;
	}

	await localPut(intent, file);
}

export interface EventPhotoUploadResult {
	photoId: string;
	width: number;
	height: number;
	takenAt: string | null;
}

export async function uploadEventPhoto(
	eventId: string,
	original: File,
): Promise<EventPhotoUploadResult> {
	const { default: imageCompression } = await import('browser-image-compression');
	const exifr = await import('exifr');

	// Read EXIF DateTimeOriginal BEFORE re-encoding strips it.
	let takenAt: string | null = null;
	try {
		const parsed = await exifr.parse(original, ['DateTimeOriginal', 'CreateDate']);
		const d: Date | undefined = parsed?.DateTimeOriginal ?? parsed?.CreateDate;
		if (d instanceof Date && !Number.isNaN(d.getTime())) takenAt = d.toISOString();
	} catch {
		/* no EXIF — fine */
	}

	const web = await imageCompression(original, {
		maxWidthOrHeight: 1600,
		maxSizeMB: 1,
		useWebWorker: true,
		fileType: 'image/jpeg',
	});
	const { width, height } = await imageDimensions(web);

	const photoId = crypto.randomUUID();
	const intent = {
		kind: 'event-photo' as const,
		eventId,
		photoId,
		contentType: 'image/jpeg',
		byteSize: web.size,
		filename: original.name,
		width,
		height,
		takenAt,
	};

	if (PROVIDER === 'vercel') {
		const { upload } = await import('@vercel/blob/client');
		// Private store — served only through /api/files/event-photo/[id].
		await upload(`event-photos/${eventId}/${photoId}.jpg`, web, {
			access: 'private',
			handleUploadUrl: UPLOAD_URL,
			clientPayload: JSON.stringify(intent),
		});
	} else {
		await localPut(intent, web);
	}

	return { photoId, width, height, takenAt };
}

/**
 * Upload (or replace) an event's flyer. Public asset, one per event, keyed by
 * eventId; re-encoded to JPEG like event photos. Mirrors uploadEventPhoto: the
 * caller runs the `event.confirmFlyer` tRPC mutation afterwards, which validates
 * the landed bytes and writes `events.flyer_url`.
 */
export async function uploadEventFlyer(eventId: string, original: File): Promise<{ key: string }> {
	const { default: imageCompression } = await import('browser-image-compression');
	const web = await imageCompression(original, {
		maxWidthOrHeight: 2000,
		maxSizeMB: 2,
		useWebWorker: true,
		fileType: 'image/jpeg',
	});

	const intent = {
		kind: 'event-flyer' as const,
		eventId,
		contentType: 'image/jpeg',
		byteSize: web.size,
		filename: original.name,
	};

	if (PROVIDER === 'vercel') {
		const { upload } = await import('@vercel/blob/client');
		await upload(`event-flyers/${eventId}.jpg`, web, {
			access: 'public',
			handleUploadUrl: UPLOAD_URL,
			clientPayload: JSON.stringify(intent),
		});
		return { key: `event-flyers/${eventId}.jpg` };
	}

	const res = await fetch(UPLOAD_URL, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(intent),
	});
	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new Error(body.error || `Flyer upload authorization failed (${res.status})`);
	}
	const { uploadUrl, key } = await res.json();
	const put = await fetch(uploadUrl, {
		method: 'PUT',
		headers: { 'content-type': 'image/jpeg' },
		body: web,
	});
	if (!put.ok) throw new Error(`Flyer upload failed (${put.status})`);
	return { key };
}

/**
 * Upload a photo to a project's public gallery (`projects.photo_urls`). Many photos
 * per project, unlike the one-per-event flyer — mirrors uploadEventPhoto's
 * compression step but the bucket is public and there's no EXIF/caption metadata.
 */
export async function uploadProjectPhoto(projectId: string, original: File): Promise<{ photoId: string }> {
	const { default: imageCompression } = await import('browser-image-compression');
	const web = await imageCompression(original, {
		maxWidthOrHeight: 1600,
		maxSizeMB: 1,
		useWebWorker: true,
		fileType: 'image/jpeg',
	});

	const photoId = crypto.randomUUID();
	const intent = {
		kind: 'project-photo' as const,
		projectId,
		photoId,
		contentType: 'image/jpeg',
		byteSize: web.size,
		filename: original.name,
	};

	if (PROVIDER === 'vercel') {
		const { upload } = await import('@vercel/blob/client');
		await upload(`project-photos/${projectId}/${photoId}.jpg`, web, {
			access: 'public',
			handleUploadUrl: UPLOAD_URL,
			clientPayload: JSON.stringify(intent),
		});
	} else {
		await localPut(intent, web);
	}

	return { photoId };
}

export type SiteMediaKind = 'image' | 'animated' | 'document';

export interface SiteMediaUploadOptions {
	mediaKind: SiteMediaKind;
	/** Page the file belongs to; omit for site-wide media (slots, officers, sponsors). */
	scopeType?: 'global' | 'committee' | 'project';
	scopeId?: string | null;
	/** A linked officer uploading their own portrait. */
	purpose?: 'officer-portrait';
	officerProfileId?: string;
	alt?: string | null;
}

/** Everything the `siteContent.confirmMedia` mutation needs to finalize the upload. */
export interface SiteMediaConfirmInput extends SiteMediaUploadOptions {
	assetId: string;
	contentType: string;
	byteSize: number;
	filename: string;
	width: number | null;
	height: number | null;
}

// Mirrors keys.ts `siteMediaKey` (not imported: keys.ts pulls node:crypto).
function siteMediaPath(assetId: string, contentType: string): string {
	const ext =
		contentType === 'application/pdf'
			? 'pdf'
			: contentType === 'image/png'
				? 'png'
				: contentType === 'image/webp'
					? 'webp'
					: 'jpg';
	return `site-media/${assetId}.${ext}`;
}

/**
 * Upload a file to the CMS media library (PUBLIC bucket). Stills are re-encoded to
 * WebP (keeps transparency for logos) at ≤2400 px / ≤2 MB; animated WebP and PDFs are
 * uploaded as-is. The caller then runs `siteContent.confirmMedia` with the returned
 * input, which validates the bytes and creates the `media_assets` row. Uploading does
 * not change the site — the asset only appears once a revision that uses it goes live.
 */
export async function uploadSiteMedia(
	original: File,
	opts: SiteMediaUploadOptions,
): Promise<SiteMediaConfirmInput> {
	let file: Blob = original;
	let contentType = original.type;
	if (opts.mediaKind === 'image') {
		const { default: imageCompression } = await import('browser-image-compression');
		file = await imageCompression(original, {
			maxWidthOrHeight: 2400,
			maxSizeMB: 2,
			useWebWorker: true,
			fileType: 'image/webp',
		});
		contentType = 'image/webp';
	} else if (opts.mediaKind === 'animated' && contentType !== 'image/webp') {
		throw new Error('Animated media must be an animated WebP (convert GIFs first)');
	} else if (opts.mediaKind === 'document' && contentType !== 'application/pdf') {
		throw new Error('Documents must be a PDF');
	}

	const dims = opts.mediaKind === 'document' ? null : await imageDimensions(file);
	const assetId = crypto.randomUUID();
	const confirm: SiteMediaConfirmInput = {
		...opts,
		assetId,
		contentType,
		byteSize: file.size,
		filename: original.name,
		width: dims?.width ?? null,
		height: dims?.height ?? null,
	};
	const intent = {
		kind: 'site-media' as const,
		photoId: assetId,
		contentType,
		byteSize: file.size,
		filename: original.name,
		width: confirm.width,
		height: confirm.height,
		mediaKind: opts.mediaKind,
		scopeType: opts.scopeType ?? 'global',
		scopeId: opts.scopeId ?? null,
		purpose: opts.purpose,
		officerProfileId: opts.officerProfileId,
		alt: opts.alt ?? null,
	};

	if (PROVIDER === 'vercel') {
		const { upload } = await import('@vercel/blob/client');
		await upload(siteMediaPath(assetId, contentType), file, {
			access: 'public',
			contentType,
			handleUploadUrl: UPLOAD_URL,
			clientPayload: JSON.stringify(intent),
		});
	} else {
		await localPut(intent, file);
	}
	return confirm;
}

async function imageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
	const url = URL.createObjectURL(blob);
	try {
		const img = new Image();
		await new Promise<void>((resolve, reject) => {
			img.onload = () => resolve();
			img.onerror = () => reject(new Error('could not read image'));
			img.src = url;
		});
		return { width: img.naturalWidth, height: img.naturalHeight };
	} finally {
		URL.revokeObjectURL(url);
	}
}

async function currentUserId(): Promise<string> {
	const res = await fetch('/api/auth/session');
	const session = await res.json();
	const id = session?.user?.id;
	if (!id) throw new Error('Not signed in');
	return id as string;
}
