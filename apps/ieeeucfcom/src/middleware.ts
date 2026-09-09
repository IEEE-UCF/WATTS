import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { hasStaffCapability } from '@watts/permissions';

export async function middleware(request: NextRequest) {
	const { pathname } = request.nextUrl;

	// Routes that just require a valid logged-in session (no role needed).
	const protectedRoutes = ['/dashboard', '/settings', '/scan-qr'];
	const isProtectedRoute = protectedRoutes.some((route) => pathname.startsWith(route));

	// Capability-gated routes: reachable by admins, officers, or a member holding the
	// named granular permission. Checked before the admin routes (more specific).
	const capabilityRoutes: { prefix: string; capability: string }[] = [
		{ prefix: '/admin/events', capability: 'manage_events' },
		{ prefix: '/admin/photos', capability: 'manage_event_photos' },
		{ prefix: '/admin/resumes', capability: 'review_resumes' },
	];
	const capabilityRoute = capabilityRoutes.find((r) => pathname.startsWith(r.prefix));

	// /staff hub — reachable by admins, officers, or anyone with ≥1 granted capability.
	const isStaffRoute = pathname.startsWith('/staff');

	// Reachable by admins OR officers (no single capability gates it). Officers get a
	// read-only view + can toggle admin-delegated capabilities for regular members.
	const officerAdminRoutes = ['/admin/members'];
	const isOfficerAdminRoute = officerAdminRoutes.some((route) => pathname.startsWith(route));

	// Admin-only routes (everything else under /admin, plus /test)
	const adminRoutes = ['/admin', '/test'];
	const isAdminRoute =
		!capabilityRoute &&
		!isOfficerAdminRoute &&
		adminRoutes.some((route) => pathname.startsWith(route));

	const needsAuthz = Boolean(capabilityRoute) || isAdminRoute || isStaffRoute || isOfficerAdminRoute;
	if (!isProtectedRoute && !needsAuthz) {
		return NextResponse.next();
	}

	const signIn = new URL('/auth/signin', request.url);
	signIn.searchParams.set('callbackUrl', pathname);
	// Signed in but not authorised → their own dashboard, not the marketing home.
	const noAccess = new URL('/dashboard', request.url);

	const sessionCookie =
		request.cookies.get('next-auth.session-token') ||
		request.cookies.get('__Secure-next-auth.session-token');
	if (!sessionCookie) {
		return NextResponse.redirect(signIn);
	}

	// Validate the session for EVERY gated route (protected + authz'd) — a cookie can
	// be present but stale/forged. The pages behind `protectedRoutes` are client
	// components that trust this check, so it has to be real here.
	let user: {
		administrator?: boolean;
		officerStatus?: boolean;
		permissions?: unknown;
	} | null = null;
	try {
		const response = await fetch(new URL('/api/auth/session', request.url), {
			headers: { cookie: request.headers.get('cookie') || '' },
		});
		if (response.ok) {
			const session = await response.json();
			user = session?.user ?? null;
		}
	} catch (error) {
		console.error('Middleware session check failed:', error);
		// Fail closed: gated route + can't verify → bounce to sign-in.
		return NextResponse.redirect(signIn);
	}

	if (!user) {
		return NextResponse.redirect(signIn);
	}

	if (!needsAuthz) {
		// Valid session is all this route needs.
		return NextResponse.next();
	}

	const perms: string[] = Array.isArray(user.permissions) ? (user.permissions as string[]) : [];
	let allowed: boolean;
	if (capabilityRoute) {
		allowed = Boolean(
			user.administrator || user.officerStatus || perms.includes(capabilityRoute.capability),
		);
	} else if (isStaffRoute) {
		allowed = Boolean(user.administrator || user.officerStatus || hasStaffCapability(perms));
	} else if (isOfficerAdminRoute) {
		allowed = Boolean(user.administrator || user.officerStatus);
	} else {
		allowed = Boolean(user.administrator);
	}

	if (!allowed) {
		return NextResponse.redirect(noAccess);
	}

	return NextResponse.next();
}

export const config = {
	// Skip Next internals, static assets, and /api (the middleware no-ops on API
	// routes anyway, and this avoids re-invoking it for the /api/auth/session fetch).
	matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
