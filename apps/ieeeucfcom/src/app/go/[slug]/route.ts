// /go/<slug> — officer short links (made in /admin/links). The branded QR codes encode
// this address with ?s=qr, so scans and plain clicks are counted apart. Link-preview
// bots and prefetches are redirected without counting.
//
// 302, never 308: the destination can change after a QR is printed, so browsers must
// not cache it.

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/database/client';
import { resolveShortLink } from '@watts/core/short-links';
import { isCountableHit } from '@watts/core/short-link-rules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = {
	'Cache-Control': 'no-store',
	'X-Robots-Tag': 'noindex, nofollow',
};

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
	const { slug } = await params;
	const countable = isCountableHit(
		request.headers.get('user-agent'),
		request.headers.get('sec-purpose') ?? request.headers.get('purpose'),
	);
	const source = !countable
		? null
		: request.nextUrl.searchParams.get('s') === 'qr'
			? 'qr'
			: 'link';

	const result = await resolveShortLink(db, slug, source);

	if (result.status === 'ok') {
		return NextResponse.redirect(result.targetUrl, { status: 302, headers: NO_STORE });
	}
	const retired = new URL('/link-retired', request.url);
	if (result.status === 'not_found') retired.searchParams.set('reason', 'missing');
	return NextResponse.redirect(retired, { status: 302, headers: NO_STORE });
}
