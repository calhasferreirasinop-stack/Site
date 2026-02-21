import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../lib/supabase';
import { requireAuth } from '../lib/auth';
import bcrypt from 'bcryptjs';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'GET') {
        // GET /api/auth/check
        const cookieHeader = req.headers.cookie || '';
        const cookies = Object.fromEntries(
            cookieHeader.split(';').map(c => {
                const [k, ...v] = c.trim().split('=');
                return [k, decodeURIComponent(v.join('='))];
            })
        );
        return res.json({ authenticated: cookies['admin_session'] === 'authenticated' });
    }

    if (req.method === 'POST') {
        // POST /api/auth/change-password
        if (!requireAuth(req, res)) return;

        const { newPassword } = req.body || {};
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        const hashedPassword = bcrypt.hashSync(newPassword, 10);
        await supabase.from('users').update({ password: hashedPassword }).eq('username', 'admin');
        return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
}
