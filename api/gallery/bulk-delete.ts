import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../lib/supabase';
import { requireAuth } from '../../lib/auth';
import { deleteFromStorage } from '../../lib/storage';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    if (!requireAuth(req, res)) return;

    try {
        const { ids } = req.body || {};
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'IDs array is required' });
        }

        const numericIds = ids.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id));

        const { data: items } = await supabase
            .from('gallery').select('imageUrl').in('id', numericIds);
        for (const item of items || []) {
            if (item.imageUrl) await deleteFromStorage(item.imageUrl);
        }

        await supabase.from('gallery').delete().in('id', numericIds);
        return res.json({ success: true });
    } catch (error) {
        console.error('Error in bulk delete:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
