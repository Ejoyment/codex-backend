import { NextResponse } from 'next/server';

// Pre-launch gate: while the product is in its waitlist period, only the
// public marketing surface is reachable. Auth pages (/sign_in, /signup,
// OAuth callbacks, verification links) and every app page redirect to
// /waitlist. Flip PRELAUNCH_GATE to false (or delete this file) at launch.
//
// Static assets (_next/*, files with extensions, e.g. /buildrs.png and the
// google verification html) are excluded via `config.matcher` below.

const PRELAUNCH_GATE = true;

// Exact public paths (trailing slash is normalized before comparison).
const PUBLIC_PATHS = new Set([
  '/',
  '/waitlist',
  // marketing
  '/features',
  '/pricing',
  '/integrations',
  '/integrations-hub',
  '/blog',
  '/about',
  '/careers',
  '/changelog',
  '/contact',
  '/demo',
  '/docs',
  // legal
  '/privacy',
  '/terms',
]);

export function middleware(req) {
  if (!PRELAUNCH_GATE) return NextResponse.next();
  const { pathname } = req.nextUrl;
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (PUBLIC_PATHS.has(normalized)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = '/waitlist';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next internals and files with an extension (static assets).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
