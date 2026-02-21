import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Parses cookies from the request header into a key-value map.
 */
function parseCookies(req: VercelRequest): Record<string, string> {
    const cookieHeader = req.headers.cookie || '';
    return Object.fromEntries(
        cookieHeader.split(';').map(c => {
            const [k, ...v] = c.trim().split('=');
            return [k, decodeURIComponent(v.join('='))];
        })
    );
}

/**
 * Returns true if the request has a valid admin session cookie.
 */
export function isAuthenticated(req: VercelRequest): boolean {
    const cookies = parseCookies(req);
    return cookies['admin_session'] === 'authenticated';
}

/**
 * Middleware helper: sends 401 if not authenticated. Returns true if auth passed.
 */
export function requireAuth(req: VercelRequest, res: VercelResponse): boolean {
    if (!isAuthenticated(req)) {
        res.status(401).json({ error: 'Unauthorized' });
        return false;
    }
    return true;
}

/**
 * Returns a Set-Cookie header string for the admin session.
 */
export function buildSessionCookie(value: string, maxAge?: number): string {
    const age = maxAge ?? 30 * 24 * 60 * 60;
    return `admin_session=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=None; Max-Age=${age}; Path=/`;
}

/**
 * Returns a Set-Cookie header string that clears the admin session.
 */
export function clearSessionCookie(): string {
    return `admin_session=; HttpOnly; Secure; SameSite=None; Max-Age=0; Path=/`;
}
