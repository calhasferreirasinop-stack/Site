import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../lib/supabase';
import { requireAuth } from '../lib/auth';
import { parseMultipart } from '../lib/multipart';
import { uploadToStorage, deleteFromStorage } from '../lib/storage';

export const config = { api: { bodyParser: false } };

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'GET') {
        const { serviceId } = req.query;
        let query = supabase.from('gallery').select('*').order('createdAt', { ascending: false });
        if (serviceId) query = query.eq('serviceId', serviceId);
        const { data } = await query;
        return res.json(data || []);
    }

    if (req.method === 'POST') {
        if (!requireAuth(req, res)) return;

        const contentType = req.headers['content-type'] || '';
        let description = '';
        let serviceId: number | null = null;
        const uploadedUrls: string[] = [];

        if (contentType.includes('multipart/form-data')) {
            const { fields, files } = await parseMultipart(req);
            description = fields.description || '';
            serviceId = fields.serviceId ? parseInt(String(fields.serviceId), 10) : null;

            // If bulk-delete comes as JSON body
            if (files.length === 0) {
                return res.status(400).json({ error: 'At least one image is required' });
            }

            for (const file of files) {
                const url = await uploadToStorage(file.buffer, file.originalname, file.mimetype);
                uploadedUrls.push(url);
            }
        } else {
            // JSON body (shouldn't happen but fallback)
            return res.status(400).json({ error: 'Multipart required for gallery upload' });
        }

        const items = uploadedUrls.map(imageUrl => ({
            imageUrl,
            description,
            serviceId,
        }));

        const { data, error } = await supabase.from('gallery').insert(items).select();
        if (error) return res.status(500).json({ error: error.message });
        return res.json(data);
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
}
