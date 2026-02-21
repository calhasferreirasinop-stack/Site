import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../lib/supabase';
import { requireAuth } from '../lib/auth';
import { parseMultipart } from '../lib/multipart';
import { uploadToStorage, deleteFromStorage } from '../lib/storage';

export const config = { api: { bodyParser: false } };

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'GET') {
        const { data } = await supabase.from('services').select('*');
        return res.json(data || []);
    }

    if (req.method === 'POST') {
        if (!requireAuth(req, res)) return;

        const contentType = req.headers['content-type'] || '';
        if (contentType.includes('multipart/form-data')) {
            const { fields, files } = await parseMultipart(req);
            const imageFile = files.find(f => f.fieldname === 'image');
            const imageUrl = imageFile
                ? await uploadToStorage(imageFile.buffer, imageFile.originalname, imageFile.mimetype)
                : null;

            const { data, error } = await supabase
                .from('services')
                .insert({ title: fields.title, description: fields.description, imageUrl })
                .select().single();
            if (error) return res.status(500).json({ error: error.message });
            return res.json(data);
        }

        // JSON body (no image)
        const { title, description, imageUrl } = req.body || {};
        const { data, error } = await supabase
            .from('services')
            .insert({ title, description, imageUrl: imageUrl || null })
            .select().single();
        if (error) return res.status(500).json({ error: error.message });
        return res.json(data);
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
}
