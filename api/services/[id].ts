import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../lib/supabase';
import { requireAuth } from '../../lib/auth';
import { deleteFromStorage } from '../../lib/storage';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const id = req.query.id as string;
    const numericId = parseInt(id);
    if (isNaN(numericId)) return res.status(400).json({ error: 'Invalid ID' });

    // Support both DELETE and POST (legacy)
    if (req.method === 'DELETE' || req.method === 'POST') {
        if (!requireAuth(req, res)) return;

        try {
            const { data: item } = await supabase
                .from('services').select('imageUrl').eq('id', numericId).single();
            if (item?.imageUrl) await deleteFromStorage(item.imageUrl);
            await supabase.from('services').delete().eq('id', numericId);
            return res.json({ success: true });
        } catch (error) {
            console.error('Service delete error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
}
