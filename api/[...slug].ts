import express from 'express';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import busboy from 'busboy';
import path from 'path';

// ---------------------------------------------------------------------------
// Supabase client
// ---------------------------------------------------------------------------
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const BUCKET = 'uploads';

function parseCookies(req: express.Request): Record<string, string> {
    const header = req.headers.cookie || '';
    return Object.fromEntries(
        header.split(';').map(c => {
            const [k, ...v] = c.trim().split('=');
            return [k, decodeURIComponent(v.join('='))];
        }),
    );
}

function isAuthenticated(req: express.Request): boolean {
    return parseCookies(req)['admin_session'] === 'authenticated';
}

function authenticate(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (isAuthenticated(req)) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

async function uploadToStorage(buffer: Buffer, originalName: string, mimeType: string): Promise<string> {
    const ext = path.extname(originalName) || '.bin';
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(filename, buffer, {
        contentType: mimeType,
        upsert: false,
    });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
    return data.publicUrl;
}

async function deleteFromStorage(publicUrl: string): Promise<void> {
    try {
        const marker = `/object/public/${BUCKET}/`;
        const idx = publicUrl.indexOf(marker);
        if (idx === -1) return;
        const filePath = publicUrl.slice(idx + marker.length);
        await supabase.storage.from(BUCKET).remove([filePath]);
    } catch (_) { }
}

function parseMultipart(req: express.Request): Promise<{
    fields: Record<string, string>;
    files: Array<{ buffer: Buffer; originalname: string; mimetype: string; fieldname: string }>;
}> {
    return new Promise((resolve, reject) => {
        const bb = busboy({ headers: req.headers as Record<string, string> });
        const fields: Record<string, string> = {};
        const files: Array<{ buffer: Buffer; originalname: string; mimetype: string; fieldname: string }> = [];

        bb.on('field', (name, value) => { fields[name] = value; });
        bb.on('file', (fieldname, stream, info) => {
            const chunks: Buffer[] = [];
            stream.on('data', (chunk: Buffer) => chunks.push(chunk));
            stream.on('end', () => {
                files.push({ buffer: Buffer.concat(chunks), originalname: info.filename, mimetype: info.mimeType, fieldname });
            });
        });
        bb.on('finish', () => resolve({ fields, files }));
        bb.on('error', reject);
        req.pipe(bb);
    });
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --- Auth ---
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body || {};
    const { data: users } = await supabase.from('users').select('*').eq('username', username).limit(1);
    const user = users?.[0];
    if (user && bcrypt.compareSync(password, user.password)) {
        res.setHeader('Set-Cookie', `admin_session=authenticated; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}; Path=/`);
        return res.json({ success: true });
    }
    return res.status(401).json({ error: 'Invalid credentials' });
});

app.post('/api/logout', (_req, res) => {
    res.setHeader('Set-Cookie', 'admin_session=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/');
    res.json({ success: true });
});

app.get('/api/auth/check', (req, res) => {
    res.json({ authenticated: isAuthenticated(req) });
});

app.post('/api/auth/change-password', authenticate, async (req, res) => {
    const { newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    await supabase.from('users').update({ password: hashedPassword }).eq('username', 'admin');
    return res.json({ success: true });
});

// --- Settings ---
app.get('/api/settings', async (_req, res) => {
    const { data } = await supabase.from('settings').select('*');
    const obj = (data || []).reduce((acc: any, cur: any) => ({ ...acc, [cur.key]: cur.value }), {});
    res.json(obj);
});

app.post('/api/settings', authenticate, async (req, res) => {
    const ct = req.headers['content-type'] || '';
    let upserts: { key: string; value: string }[] = [];
    let logoUrl: string | null = null;

    if (ct.includes('multipart/form-data')) {
        const { fields, files } = await parseMultipart(req);
        upserts = Object.entries(fields).map(([key, value]) => ({ key, value: String(value) }));
        const logoFile = files.find(f => f.fieldname === 'logo');
        if (logoFile) {
            logoUrl = await uploadToStorage(logoFile.buffer, logoFile.originalname, logoFile.mimetype);
            upserts.push({ key: 'logoUrl', value: logoUrl });
        }
    } else {
        upserts = Object.entries(req.body || {}).map(([key, value]) => ({ key, value: String(value) }));
    }

    await supabase.from('settings').upsert(upserts, { onConflict: 'key' });
    res.json({ success: true, logoUrl });
});

// --- Admin data ---
app.get('/api/admin/data', authenticate, async (_req, res) => {
    try {
        const [settingsRes, servicesRes, postsRes, galleryRes, testimonialsRes] = await Promise.all([
            supabase.from('settings').select('*'),
            supabase.from('services').select('*'),
            supabase.from('posts').select('*').order('createdAt', { ascending: false }),
            supabase.from('gallery').select('*').order('createdAt', { ascending: false }),
            supabase.from('testimonials').select('*').order('createdAt', { ascending: false }),
        ]);
        const settings = (settingsRes.data || []).reduce((acc: any, cur: any) => { acc[cur.key] = cur.value; return acc; }, {});
        res.json({ settings, services: servicesRes.data || [], posts: postsRes.data || [], gallery: galleryRes.data || [], testimonials: testimonialsRes.data || [] });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Services ---
app.get('/api/services', async (_req, res) => {
    const { data } = await supabase.from('services').select('*');
    res.json(data || []);
});

app.post('/api/services', authenticate, async (req, res) => {
    const ct = req.headers['content-type'] || '';
    let title: string, description: string, imageUrl: string | null = null;

    if (ct.includes('multipart/form-data')) {
        const { fields, files } = await parseMultipart(req);
        title = fields.title; description = fields.description;
        const imgFile = files.find(f => f.fieldname === 'image');
        if (imgFile) imageUrl = await uploadToStorage(imgFile.buffer, imgFile.originalname, imgFile.mimetype);
    } else {
        ({ title, description, imageUrl } = req.body || {});
    }

    const { data, error } = await supabase.from('services').insert({ title, description, imageUrl }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

async function deleteService(id: number, res: express.Response) {
    const { data: item } = await supabase.from('services').select('imageUrl').eq('id', id).single();
    if (item?.imageUrl) await deleteFromStorage(item.imageUrl);
    await supabase.from('services').delete().eq('id', id);
    res.json({ success: true });
}

app.post('/api/services/delete/:id', authenticate, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    try { await deleteService(id, res); } catch { res.status(500).json({ error: 'Internal server error' }); }
});

app.delete('/api/services/:id', authenticate, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    try { await deleteService(id, res); } catch { res.status(500).json({ error: 'Internal server error' }); }
});

// --- Posts ---
app.get('/api/posts', async (_req, res) => {
    const { data } = await supabase.from('posts').select('*').order('createdAt', { ascending: false });
    res.json(data || []);
});

app.post('/api/posts', authenticate, async (req, res) => {
    const ct = req.headers['content-type'] || '';
    let title: string, content: string, imageUrl: string | null = null;

    if (ct.includes('multipart/form-data')) {
        const { fields, files } = await parseMultipart(req);
        title = fields.title; content = fields.content;
        const imgFile = files.find(f => f.fieldname === 'image');
        if (imgFile) imageUrl = await uploadToStorage(imgFile.buffer, imgFile.originalname, imgFile.mimetype);
    } else {
        ({ title, content, imageUrl } = req.body || {});
    }

    const { data, error } = await supabase.from('posts').insert({ title, content, imageUrl }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

async function deletePost(id: number, res: express.Response) {
    const { data: item } = await supabase.from('posts').select('imageUrl').eq('id', id).single();
    if (item?.imageUrl) await deleteFromStorage(item.imageUrl);
    await supabase.from('posts').delete().eq('id', id);
    res.json({ success: true });
}

app.post('/api/posts/delete/:id', authenticate, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    try { await deletePost(id, res); } catch { res.status(500).json({ error: 'Internal server error' }); }
});

app.delete('/api/posts/:id', authenticate, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    try { await deletePost(id, res); } catch { res.status(500).json({ error: 'Internal server error' }); }
});

// --- Gallery ---
app.get('/api/gallery', async (req, res) => {
    const { serviceId } = req.query;
    let query = supabase.from('gallery').select('*').order('createdAt', { ascending: false });
    if (serviceId) query = query.eq('serviceId', serviceId);
    const { data } = await query;
    res.json(data || []);
});

app.post('/api/gallery/bulk-delete', authenticate, async (req, res) => {
    try {
        const { ids } = req.body || {};
        if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'IDs array is required' });
        const numericIds = ids.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id));
        const { data: items } = await supabase.from('gallery').select('imageUrl').in('id', numericIds);
        for (const item of items || []) { if (item.imageUrl) await deleteFromStorage(item.imageUrl); }
        await supabase.from('gallery').delete().in('id', numericIds);
        res.json({ success: true });
    } catch { res.status(500).json({ error: 'Internal server error' }); }
});

app.post('/api/gallery', authenticate, async (req, res) => {
    const ct = req.headers['content-type'] || '';
    if (!ct.includes('multipart/form-data')) return res.status(400).json({ error: 'Multipart required' });

    const { fields, files } = await parseMultipart(req);
    if (!files.length) return res.status(400).json({ error: 'At least one image is required' });

    const serviceId = fields.serviceId ? parseInt(String(fields.serviceId), 10) : null;
    const uploadedUrls: string[] = [];
    for (const file of files) {
        uploadedUrls.push(await uploadToStorage(file.buffer, file.originalname, file.mimetype));
    }

    const items = uploadedUrls.map(imageUrl => ({ imageUrl, description: fields.description || '', serviceId }));
    const { data, error } = await supabase.from('gallery').insert(items).select();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

async function deleteGalleryItem(id: number, res: express.Response) {
    const { data: item } = await supabase.from('gallery').select('imageUrl').eq('id', id).single();
    if (item?.imageUrl) await deleteFromStorage(item.imageUrl);
    const { error } = await supabase.from('gallery').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
}

app.post('/api/gallery/delete/:id', authenticate, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    try { await deleteGalleryItem(id, res); } catch { res.status(500).json({ error: 'Internal server error' }); }
});

app.delete('/api/gallery/:id', authenticate, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    try { await deleteGalleryItem(id, res); } catch { res.status(500).json({ error: 'Internal server error' }); }
});

// --- Testimonials ---
app.get('/api/testimonials', async (_req, res) => {
    const { data } = await supabase.from('testimonials').select('*').order('createdAt', { ascending: false });
    res.json(data || []);
});

app.post('/api/testimonials', authenticate, async (req, res) => {
    const { author, content, rating } = req.body || {};
    const { data, error } = await supabase.from('testimonials').insert({ author, content, rating: rating || 5 }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post('/api/testimonials/delete/:id', authenticate, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    try {
        await supabase.from('testimonials').delete().eq('id', id);
        res.json({ success: true });
    } catch { res.status(500).json({ error: 'Internal server error' }); }
});

app.delete('/api/testimonials/:id', authenticate, async (req, res) => {
    await supabase.from('testimonials').delete().eq('id', req.params.id);
    res.json({ success: true });
});

// --- Seed ---
app.post('/api/seed', async (req, res) => {
    const { token } = req.body || {};
    if (token !== process.env.ADMIN_PASSWORD) return res.status(403).json({ error: 'Forbidden' });

    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const hashedPassword = bcrypt.hashSync(adminPassword, 10);
    await supabase.from('users').upsert({ username: 'admin', password: hashedPassword }, { onConflict: 'username' });

    const { data: settings } = await supabase.from('settings').select('key').limit(1);
    if (!settings || settings.length === 0) {
        await supabase.from('settings').insert([
            { key: 'companyName', value: 'Ferreira Calhas' },
            { key: 'whatsapp', value: '5566996172808' },
            { key: 'address', value: 'Avenida Jose Goncalves, 931, Sinop - MT, Brasil' },
            { key: 'aboutText', value: 'Especialistas em fabricação e instalação de calhas, rufos e pingadeiras em Sinop e região.' },
            { key: 'heroTitle', value: 'Proteção e Estética para o seu Telhado' },
            { key: 'heroSubtitle', value: 'Fabricação própria de calhas e rufos com a qualidade que sua obra merece.' },
            { key: 'logoUrl', value: '' },
        ]);
    }

    const { data: testimonials } = await supabase.from('testimonials').select('id').limit(1);
    if (!testimonials || testimonials.length === 0) {
        await supabase.from('testimonials').insert([
            { author: 'Ricardo Silva', content: 'Serviço de excelente qualidade. As calhas ficaram perfeitas.', rating: 5 },
            { author: 'Maria Oliveira', content: 'Fiquei muito satisfeita com o trabalho. Recomendo!', rating: 5 },
            { author: 'João Pereira', content: 'Preço justo e entrega no prazo. Nota 10!', rating: 5 },
        ]);
    }

    const { data: services } = await supabase.from('services').select('id').limit(1);
    if (!services || services.length === 0) {
        const { data: inserted } = await supabase.from('services').insert([
            { title: 'Calhas', description: 'Instalação de calhas sob medida para residências e comércios.', imageUrl: 'https://images.unsplash.com/photo-1635424710928-0544e8512eae?q=80&w=800' },
            { title: 'Rufos', description: 'Proteção metálica essencial para evitar infiltrações.', imageUrl: 'https://picsum.photos/seed/rufo/800/600' },
            { title: 'Pingadeiras', description: 'Acabamento superior para muros que protege a pintura.', imageUrl: 'https://picsum.photos/seed/pingadeira/800/600' },
            { title: 'Fabricação Própria', description: 'Maquinário moderno para dobrar chapas sob medida.', imageUrl: 'https://picsum.photos/seed/fabricacao/800/600' },
            { title: 'Equipe e Obras', description: 'Nossa equipe em ação e registros de obras concluídas.', imageUrl: 'https://picsum.photos/seed/equipe/800/600' },
        ]).select();

        if (inserted && inserted.length === 5) {
            const [s1, s2, s3, s4, s5] = inserted;
            const galleryItems: { imageUrl: string; description: string; serviceId: number }[] = [];
            [1, 20, 21, 22, 23].forEach(n => galleryItems.push({ imageUrl: `https://picsum.photos/seed/${n}/800/600`, description: `Calha ${n}`, serviceId: s1.id }));
            [2, 3, 4, 5].forEach(n => galleryItems.push({ imageUrl: `https://picsum.photos/seed/${n}/800/600`, description: `Rufo ${n}`, serviceId: s2.id }));
            [10, 11, 12].forEach(n => galleryItems.push({ imageUrl: `https://picsum.photos/seed/${n}/800/600`, description: `Pingadeira ${n}`, serviceId: s3.id }));
            [38, 39, 40].forEach(n => galleryItems.push({ imageUrl: `https://picsum.photos/seed/${n}/800/600`, description: `Fabricação ${n}`, serviceId: s4.id }));
            [9, 34, 35].forEach(n => galleryItems.push({ imageUrl: `https://picsum.photos/seed/${n}/800/600`, description: `Equipe ${n}`, serviceId: s5.id }));
            await supabase.from('gallery').insert(galleryItems);
        }
    }

    res.json({ success: true, message: 'Database seeded successfully' });
});

// ---------------------------------------------------------------------------
// Vercel handler
// ---------------------------------------------------------------------------
export default function handler(req: VercelRequest, res: VercelResponse) {
    return app(req as any, res as any);
}
