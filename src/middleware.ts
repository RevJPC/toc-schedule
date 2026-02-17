import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that require authentication
const PROTECTED_ROUTES = [
  '/api/drivers',
  '/api/markets',
  '/api/shifts',
  '/api/templates',
  '/api/settings',
  '/api/capacity-overrides',
  '/api/schedules',
];

// Routes that require admin authentication
const ADMIN_ROUTES = [
  '/api/settings',
];

// Routes that are public (no auth required)
const PUBLIC_ROUTES = [
  '/api/slack/post-schedule', // Protected by CRON_SECRET instead
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip non-API routes
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Skip public routes
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Check if route is protected
  const isProtected = PROTECTED_ROUTES.some(route => pathname.startsWith(route));
  if (!isProtected) {
    return NextResponse.next();
  }

  // Get API key from environment
  const apiKey = process.env.API_KEY;
  
  // In development without API_KEY set, allow all requests
  if (!apiKey && process.env.NODE_ENV === 'development') {
    return NextResponse.next();
  }

  // In production, require API_KEY to be set
  if (!apiKey) {
    console.error('[Middleware] API_KEY environment variable not set in production');
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }

  // Validate API key
  const providedKey = request.headers.get('x-api-key');
  if (!providedKey || providedKey !== apiKey) {
    return NextResponse.json(
      { error: 'Invalid or missing API key' },
      { status: 401 }
    );
  }

  // Check admin routes
  const isAdminRoute = ADMIN_ROUTES.some(route => pathname.startsWith(route));
  if (isAdminRoute) {
    const adminKey = process.env.ADMIN_KEY;
    
    // In development without ADMIN_KEY set, allow all requests
    if (!adminKey && process.env.NODE_ENV === 'development') {
      return NextResponse.next();
    }

    if (!adminKey) {
      console.error('[Middleware] ADMIN_KEY environment variable not set');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const providedAdminKey = request.headers.get('x-admin-key');
    if (!providedAdminKey || providedAdminKey !== adminKey) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
