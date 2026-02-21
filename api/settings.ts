import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../lib/supabase';
import { requireAuth } from '../lib/auth';
import { parseMultipart } from '../lib/multipart';
import { uploadToStorage } from '../lib/storage';

export const config = { api: { bodyParser: false } };

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'GET') {
        const { data } = await supabase.from('settings').select('*');
        const settingsObj = (data || []).reduce((acc: any, curr: any) => ({
            ...acc,
            [curr.key]: curr.value,
        }), {});
        return res.json(settingsObj);
    }

    if (req.method === 'POST') {
        if (!requireAuth(req, res)) return;

        const { fields, files } = await parseMultipart(req);
        const logoFile = files.find(f => f.fieldname === 'logo');

        const upserts = Object.entries(fields).map(([key, value]) => ({ key, value: String(value) }));

        if (logoFile) {
            const logoUrl = await uploadToStorage(logoFile.buffer, logoFile.originalname, logoFile.mimetype);
            upserts.push({ key: 'logoUrl', value: logoUrl });
            await supabase.from('settings').upsert(upserts, { onConflict: 'key' });
            return res.json({ success: true, logoUrl });
        }

        await supabase.from('settings').upsert(upserts, { onConflict: 'key' });
        return res.json({ success: true, logoUrl: null });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
}
