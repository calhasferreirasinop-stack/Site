import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../lib/supabase';
import { requireAuth } from '../lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'GET') {
        const { data } = await supabase
            .from('testimonials').select('*').order('createdAt', { ascending: false });
        return res.json(data || []);
    }

    if (req.method === 'POST') {
        if (!requireAuth(req, res)) return;

        const { author, content, rating } = req.body || {};
        const { data, error } = await supabase
            .from('testimonials')
            .insert({ author, content, rating: rating || 5 })
            .select().single();
        if (error) return res.status(500).json({ error: error.message });
        return res.json(data);
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
}
