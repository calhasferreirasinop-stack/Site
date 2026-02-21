import type { VercelRequest, VercelResponse } from '@vercel/node';
import { clearSessionCookie } from './lib/auth';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
    res.setHeader('Set-Cookie', clearSessionCookie());
    return res.json({ success: true });
}
