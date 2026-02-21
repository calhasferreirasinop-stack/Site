import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../lib/supabase';
import { requireAuth } from '../lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
    if (!requireAuth(req, res)) return;

    try {
        const [settingsRes, servicesRes, postsRes, galleryRes, testimonialsRes] = await Promise.all([
            supabase.from('settings').select('*'),
            supabase.from('services').select('*'),
            supabase.from('posts').select('*').order('createdAt', { ascending: false }),
            supabase.from('gallery').select('*').order('createdAt', { ascending: false }),
            supabase.from('testimonials').select('*').order('createdAt', { ascending: false }),
        ]);

        const settings = (settingsRes.data || []).reduce((acc: any, curr: any) => {
            acc[curr.key] = curr.value;
            return acc;
        }, {});

        return res.json({
            settings,
            services: servicesRes.data || [],
            posts: postsRes.data || [],
            gallery: galleryRes.data || [],
            testimonials: testimonialsRes.data || [],
        });
    } catch (error) {
        console.error('Error fetching admin data:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
