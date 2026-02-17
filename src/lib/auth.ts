import { NextRequest, NextResponse } from 'next/server';

// Authentication configuration
const AUTH_HEADER = 'x-api-key';
const ADMIN_HEADER = 'x-admin-key';

/**
 * Validates API key authentication for protected routes
 * Returns null if authenticated, or a NextResponse error if not
 */
export function validateApiKey(request: NextRequest): NextResponse | null {
  // Skip auth in development if no API key is configured
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === 'development') {
      return null; // Allow in development without key
    }
    // In production, require API key to be set
    console.error('[Auth] API_KEY environment variable not set');
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }

  const providedKey = request.headers.get(AUTH_HEADER);
  
  if (!providedKey) {
    return NextResponse.json(
      { error: 'API key required. Provide it via x-api-key header.' },
      { status: 401 }
    );
  }

  if (providedKey !== apiKey) {
    return NextResponse.json(
      { error: 'Invalid API key' },
      { status: 403 }
    );
  }

  return null; // Authenticated
}

/**
 * Validates admin authentication for sensitive operations
 * Requires both API key and admin key
 */
export function validateAdminKey(request: NextRequest): NextResponse | null {
  // First validate basic API key
  const apiKeyError = validateApiKey(request);
  if (apiKeyError) {
    return apiKeyError;
  }

  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) {
    if (process.env.NODE_ENV === 'development') {
      return null; // Allow in development without key
    }
    console.error('[Auth] ADMIN_KEY environment variable not set');
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }

  const providedAdminKey = request.headers.get(ADMIN_HEADER);
  
  if (!providedAdminKey) {
    return NextResponse.json(
      { error: 'Admin key required for this operation' },
      { status: 401 }
    );
  }

  if (providedAdminKey !== adminKey) {
    return NextResponse.json(
      { error: 'Invalid admin key' },
      { status: 403 }
    );
  }

  return null; // Admin authenticated
}

/**
 * Helper to wrap route handlers with authentication
 * Use this to protect individual routes
 */
export function withAuth<T extends unknown[]>(
  handler: (request: NextRequest, ...args: T) => Promise<NextResponse>,
  requireAdmin = false
) {
  return async (request: NextRequest, ...args: T): Promise<NextResponse> => {
    const authError = requireAdmin 
      ? validateAdminKey(request)
      : validateApiKey(request);
    
    if (authError) {
      return authError;
    }

    return handler(request, ...args);
  };
}

/**
 * Check if request is from an authenticated source
 * Useful for conditional logic without blocking
 */
export function isAuthenticated(request: NextRequest): boolean {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    return process.env.NODE_ENV === 'development';
  }
  
  const providedKey = request.headers.get(AUTH_HEADER);
  return providedKey === apiKey;
}

/**
 * Check if request has admin privileges
 */
export function isAdmin(request: NextRequest): boolean {
  if (!isAuthenticated(request)) {
    return false;
  }

  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) {
    return process.env.NODE_ENV === 'development';
  }
  
  const providedAdminKey = request.headers.get(ADMIN_HEADER);
  return providedAdminKey === adminKey;
}
