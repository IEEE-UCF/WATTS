// Gated resume download. PII — never public, never cached, never indexed.
// Access: the owner, or any officer / administrator.

import { eq } from 'drizzle-orm';
import { db } from '@/lib/database/client';
import { Members } from '@watts/db/schema';
import { getStorage } from '@watts/storage';
import { sanitizeFilename } from '@watts/storage/keys';
import { resolveMemberRoles } from '@watts/core/members';
import { hasCapability } from '@watts/permissions';
import { requireSession } from '@/lib/auth-guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ memberId: string }> },
): Promise<Response> {
	const { memberId } = await params;

	const gate = await requireSession();
	if (gate instanceof Response) return gate;
	const session = gate;

	const [member] = await db
		.select({
			id: Members.id,
			userId: Members.userId,
			resumeKey: Members.resumeKey,
			resumeFileName: Members.resumeFileName,
		})
		.from(Members)
		.where(eq(Members.id, memberId))
		.limit(1);

	if (!member?.resumeKey) {
		return new Response('Not found', { status: 404 });
	}

	const isOwner = member.userId === session.user.id;
	if (!isOwner) {
		// Staff access: resolve capabilities from the DB, not the session token, so a
		// revoked `review_resumes` grant blocks the next request (PII — worth the query).
		const roles = await resolveMemberRoles(db, session.user.id);
		if (!hasCapability(roles, 'review_resumes')) {
			return new Response('Forbidden', { status: 403 });
		}
	}

	const storage = await getStorage();
	let stream;
	try {
		stream = await storage.getStream({ key: member.resumeKey, bucket: 'private' });
	} catch {
		return new Response('Not found', { status: 404 });
	}

	const filename = sanitizeFilename(member.resumeFileName ?? 'resume.pdf');
	return new Response(stream.stream, {
		status: 200,
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `inline; filename="${filename}"`,
			'X-Content-Type-Options': 'nosniff',
			'X-Robots-Tag': 'noindex, nofollow',
			'Cache-Control': 'private, no-store, max-age=0',
			...(stream.size ? { 'Content-Length': String(stream.size) } : {}),
		},
	});
}
