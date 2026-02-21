import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from './lib/supabase';
import bcrypt from 'bcryptjs';
import { buildSessionCookie } from './lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { username, password } = req.body || {};
    const { data: users } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .limit(1);

    const user = users?.[0];
    if (user && bcrypt.compareSync(password, user.password)) {
        res.setHeader('Set-Cookie', buildSessionCookie('authenticated'));
        return res.json({ success: true });
    }

    return res.status(401).json({ error: 'Invalid credentials' });
}
