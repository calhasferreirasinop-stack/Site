import express from 'express';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import busboy from 'busboy';
import path from 'path';

// ---------------------------------------------------------------------------
// Supabase client
// ---------------------------------------------------------------------------
const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
);

const BUCKET = 'uploads';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parseCookies(req: express.Request): Record<string, string> {
    const header = req.headers.cookie || '';
    return Object.fromEntries(
        header.split(';').map(c => {
            const [k, ...v] = c.trim().split('=');
            return [k.trim(), decodeURIComponent(v.join('='))];
        })
    );
}

async function parseSession(req: express.Request): Promise<any | null> {
    const cookies = parseCookies(req);
    const session = cookies['session'];
    if (!session) return null;
    try {
        const decoded = JSON.parse(Buffer.from(session, 'base64').toString('utf8'));
        const { data: user } = await supabase
            .from('users')
            .select('id,username,name,email,role,active')
            .eq('id', decoded.userId)
            .eq('active', true)
            .single();
        return user || null;
    } catch { return null; }
}

function setSessionCookie(res: express.Response, userId: number) {
    const data = Buffer.from(JSON.stringify({ userId })).toString('base64');
    res.setHeader('Set-Cookie',
        `session=${data}; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 3600}; Path=/`
    );
}

async function authenticate(req: express.Request, res: express.Response, next: express.NextFunction) {
    const user = await parseSession(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    (req as any).user = user;
    next();
}

async function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
    const user = await parseSession(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (user.role !== 'admin' && user.role !== 'master') return res.status(403).json({ error: 'Forbidden' });
    (req as any).user = user;
    next();
}

async function requireMaster(req: express.Request, res: express.Response, next: express.NextFunction) {
    const user = await parseSession(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (user.role !== 'master') return res.status(403).json({ error: 'Forbidden - Master only' });
    (req as any).user = user;
    next();
}

async function uploadToStorage(buffer: Buffer, originalName: string, mimeType: string): Promise<string> {
    const ext = path.extname(originalName) || '.bin';
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(filename, buffer, { contentType: mimeType, upsert: false });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
    return supabase.storage.from(BUCKET).getPublicUrl(filename).data.publicUrl;
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
            stream.on('end', () => files.push({ buffer: Buffer.concat(chunks), originalname: info.filename, mimetype: info.mimeType, fieldname }));
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

// ── AUTH ────────────────────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body || {};
    const { data: users } = await supabase.from('users')
        .select('*').eq('username', username).eq('active', true).limit(1);
    const user = users?.[0];
    if (user && bcrypt.compareSync(password, user.password)) {
        setSessionCookie(res, user.id);
        // Also clear old cookie
        res.setHeader('Set-Cookie', [
            `session=${Buffer.from(JSON.stringify({ userId: user.id })).toString('base64')}; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 3600}; Path=/`,
            'admin_session=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/',
        ]);
        return res.json({ success: true, role: user.role, name: user.name || user.username });
    }
    return res.status(401).json({ error: 'Credenciais inválidas' });
});

app.post('/api/logout', (_req, res) => {
    res.setHeader('Set-Cookie', [
        'session=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/',
        'admin_session=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/',
    ]);
    res.json({ success: true });
});

app.get('/api/auth/check', async (req, res) => {
    const user = await parseSession(req);
    if (user) return res.json({ authenticated: true, role: user.role, name: user.name || user.username, id: user.id });
    // Legacy fallback
    const cookies = parseCookies(req as any);
    if (cookies['admin_session'] === 'authenticated') {
        const { data: adminUser } = await supabase.from('users').select('id,username,role,name').eq('username', 'admin').single();
        if (adminUser) return res.json({ authenticated: true, role: adminUser.role, name: adminUser.name || adminUser.username, id: adminUser.id });
    }
    return res.json({ authenticated: false });
});

app.get('/api/auth/me', authenticate as any, (req: any, res) => res.json(req.user));

app.post('/api/auth/change-password', authenticate as any, async (req: any, res) => {
    const { newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Mínimo 6 caracteres' });
    await supabase.from('users').update({ password: bcrypt.hashSync(newPassword, 10) }).eq('id', req.user.id);
    res.json({ success: true });
});

// ── USERS ───────────────────────────────────────────────────────────────────
app.get('/api/users', requireAdmin as any, async (_req, res) => {
    const { data } = await supabase.from('users').select('id,username,name,email,phone,role,active,"createdAt"').order('createdAt', { ascending: false });
    res.json(data || []);
});

app.post('/api/users', requireAdmin as any, async (req: any, res) => {
    const { username, password, name, email, phone, role } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Username e senha obrigatórios' });
    if ((role === 'admin' || role === 'master') && req.user.role !== 'master')
        return res.status(403).json({ error: 'Apenas master pode criar admins' });
    const { data, error } = await supabase.from('users').insert({
        username, password: bcrypt.hashSync(password, 10), name, email, phone, role: role || 'user', active: true
    }).select('id,username,name,email,phone,role,active').single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.put('/api/users/:id', requireAdmin as any, async (req: any, res) => {
    const id = parseInt(req.params.id);
    const { name, email, phone, active, role, password } = req.body || {};
    const updateData: any = { name, email, phone, active };
    if (role !== undefined && req.user.role === 'master') updateData.role = role;
    if (password) updateData.password = bcrypt.hashSync(password, 10);
    const { data, error } = await supabase.from('users').update(updateData).eq('id', id).select('id,username,name,email,phone,role,active').single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.delete('/api/users/:id', requireAdmin as any, async (req: any, res) => {
    const id = parseInt(req.params.id);
    if (id === req.user.id) return res.status(400).json({ error: 'Não pode excluir a si mesmo' });
    await supabase.from('users').delete().eq('id', id);
    res.json({ success: true });
});

app.post('/api/admin/users/bulk-admin', requireAdmin as any, async (req: any, res) => {
    const { userIds, isAdmin } = req.body || {};
    if (!Array.isArray(userIds) || userIds.length === 0) return res.status(400).json({ error: 'userIds obrigatório' });
    await supabase.from('users').update({ role: isAdmin ? 'admin' : 'user' }).in('id', userIds);
    res.json({ success: true });
});

// ── SETTINGS ─────────────────────────────────────────────────────────────────
app.get('/api/settings', async (_req, res) => {
    const { data } = await supabase.from('settings').select('*');
    res.json((data || []).reduce((acc: any, c: any) => ({ ...acc, [c.key]: c.value }), {}));
});

app.post('/api/settings', requireMaster as any, async (req, res) => {
    const ct = req.headers['content-type'] || '';
    let upserts: { key: string; value: string }[] = [];
    if (ct.includes('multipart/form-data')) {
        const { fields, files } = await parseMultipart(req);
        upserts = Object.entries(fields).map(([key, value]) => ({ key, value: String(value) }));
        for (const [field, settKey] of [['logo', 'logoUrl'], ['heroImage', 'heroImageUrl'], ['pixQrCode', 'pixQrCodeUrl']]) {
            const f = files.find(x => x.fieldname === field);
            if (f) upserts.push({ key: settKey, value: await uploadToStorage(f.buffer, f.originalname, f.mimetype) });
        }
    } else {
        upserts = Object.entries(req.body || {}).map(([key, value]) => ({ key, value: String(value) }));
    }
    await supabase.from('settings').upsert(upserts, { onConflict: 'key' });
    res.json({ success: true });
});

// ── ADMIN DATA ───────────────────────────────────────────────────────────────
app.get('/api/admin/data', requireAdmin as any, async (req: any, res) => {
    try {
        const [settingsRes, servicesRes, postsRes, galleryRes, testimonialsRes, quotesRes, inventoryRes] = await Promise.all([
            supabase.from('settings').select('*'),
            supabase.from('services').select('*'),
            supabase.from('posts').select('*').order('createdAt', { ascending: false }),
            supabase.from('gallery').select('*').order('createdAt', { ascending: false }),
            supabase.from('testimonials').select('*').order('createdAt', { ascending: false }),
            supabase.from('quotes').select('*').order('createdAt', { ascending: false }),
            supabase.from('inventory').select('*').order('purchasedAt', { ascending: false }),
        ]);
        const usersRes = await supabase.from('users').select('id,username,name,email,phone,role,active,"createdAt"').order('createdAt', { ascending: false });
        const settings = (settingsRes.data || []).reduce((acc: any, c: any) => ({ ...acc, [c.key]: c.value }), {});
        res.json({
            settings,
            services: servicesRes.data || [],
            posts: postsRes.data || [],
            gallery: galleryRes.data || [],
            testimonials: testimonialsRes.data || [],
            quotes: quotesRes.data || [],
            inventory: inventoryRes.data || [],
            users: usersRes.data || [],
            currentUser: req.user,
        });
    } catch (e) { res.status(500).json({ error: 'Internal server error' }); }
});

// ── SERVICES ─────────────────────────────────────────────────────────────────
app.get('/api/services', async (_req, res) => {
    const { data } = await supabase.from('services').select('*');
    res.json(data || []);
});
app.post('/api/services', requireAdmin as any, async (req, res) => {
    const ct = req.headers['content-type'] || '';
    let title: string, description: string, imageUrl: string | null = null;
    if (ct.includes('multipart/form-data')) {
        const { fields, files } = await parseMultipart(req);
        title = fields.title; description = fields.description;
        const f = files.find(x => x.fieldname === 'image');
        if (f) imageUrl = await uploadToStorage(f.buffer, f.originalname, f.mimetype);
    } else ({ title, description, imageUrl } = req.body || {});
    const { data, error } = await supabase.from('services').insert({ title, description, imageUrl }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});
app.post('/api/services/delete/:id', requireAdmin as any, async (req, res) => {
    await supabase.from('services').delete().eq('id', parseInt(req.params.id));
    res.json({ success: true });
});
app.post('/api/services/:id/home-image', requireAdmin as any, async (req, res) => {
    const { files } = await parseMultipart(req);
    const f = files.find(x => x.fieldname === 'homeImage');
    if (!f) return res.status(400).json({ error: 'No file' });
    const homeImageUrl = await uploadToStorage(f.buffer, f.originalname, f.mimetype);
    await supabase.from('services').update({ homeImageUrl }).eq('id', parseInt(req.params.id));
    res.json({ success: true, homeImageUrl });
});

// ── POSTS ─────────────────────────────────────────────────────────────────────
app.get('/api/posts', async (_req, res) => {
    const { data } = await supabase.from('posts').select('*').order('createdAt', { ascending: false });
    res.json(data || []);
});
app.post('/api/posts', requireAdmin as any, async (req, res) => {
    const ct = req.headers['content-type'] || '';
    let title: string, content: string, imageUrl: string | null = null;
    if (ct.includes('multipart/form-data')) {
        const { fields, files } = await parseMultipart(req);
        title = fields.title; content = fields.content;
        const f = files.find(x => x.fieldname === 'image');
        if (f) imageUrl = await uploadToStorage(f.buffer, f.originalname, f.mimetype);
    } else ({ title, content, imageUrl } = req.body || {});
    const { data, error } = await supabase.from('posts').insert({ title, content, imageUrl }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});
app.post('/api/posts/delete/:id', requireAdmin as any, async (req, res) => {
    await supabase.from('posts').delete().eq('id', parseInt(req.params.id));
    res.json({ success: true });
});

// ── GALLERY ───────────────────────────────────────────────────────────────────
app.get('/api/gallery', async (req, res) => {
    const { serviceId } = req.query;
    let q = supabase.from('gallery').select('*').order('createdAt', { ascending: false });
    if (serviceId) q = q.eq('serviceId', serviceId);
    const { data } = await q;
    res.json(data || []);
});
app.post('/api/gallery', requireAdmin as any, async (req, res) => {
    const { fields, files } = await parseMultipart(req);
    if (!files.length) return res.status(400).json({ error: 'At least one image required' });
    const serviceId = fields.serviceId ? parseInt(fields.serviceId) : null;
    const items = [];
    for (const f of files) {
        const url = await uploadToStorage(f.buffer, f.originalname, f.mimetype);
        items.push({ imageUrl: url, description: fields.description || '', serviceId });
    }
    const { data, error } = await supabase.from('gallery').insert(items).select();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});
app.post('/api/gallery/bulk-delete', requireAdmin as any, async (req, res) => {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids required' });
    await supabase.from('gallery').delete().in('id', ids.map(Number));
    res.json({ success: true });
});
app.post('/api/gallery/delete/:id', requireAdmin as any, async (req, res) => {
    await supabase.from('gallery').delete().eq('id', parseInt(req.params.id));
    res.json({ success: true });
});

// ── TESTIMONIALS ──────────────────────────────────────────────────────────────
app.get('/api/testimonials', async (_req, res) => {
    const { data } = await supabase.from('testimonials').select('*').order('createdAt', { ascending: false });
    res.json(data || []);
});
app.post('/api/testimonials', requireAdmin as any, async (req, res) => {
    const { author, content, rating } = req.body || {};
    const { data, error } = await supabase.from('testimonials').insert({ author, content, rating: rating || 5 }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});
app.post('/api/testimonials/delete/:id', requireAdmin as any, async (req, res) => {
    await supabase.from('testimonials').delete().eq('id', parseInt(req.params.id));
    res.json({ success: true });
});

// ── QUOTES ────────────────────────────────────────────────────────────────────
app.get('/api/quotes/pending-count', requireAdmin as any, async (_req, res) => {
    const { count } = await supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('status', 'pending');
    res.json({ count: count || 0 });
});

app.get('/api/quotes', authenticate as any, async (req: any, res) => {
    let q = supabase.from('quotes').select('*').order('createdAt', { ascending: false });
    if (req.user.role === 'user') q = q.eq('clientId', req.user.id);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
});

app.post('/api/quotes', authenticate as any, async (req: any, res) => {
    const { clientName, bends, notes, totalValue: passedTotal, adminCreated } = req.body || {};
    let totalM2 = 0;
    if (Array.isArray(bends)) {
        for (const b of bends) totalM2 += parseFloat(b.m2 || 0);
    }
    const { data: settRows } = await supabase.from('settings').select('*');
    const sett = (settRows || []).reduce((a: any, s: any) => ({ ...a, [s.key]: s.value }), {});
    const pricePerM2 = parseFloat(sett.pricePerM2 || '50');
    const totalValue = adminCreated && passedTotal ? parseFloat(passedTotal) : totalM2 * pricePerM2;

    const { data: quote, error } = await supabase.from('quotes').insert({
        clientId: req.user.id,
        clientName: clientName || req.user.name || req.user.username,
        createdBy: req.user.id,
        totalM2, totalValue, finalValue: totalValue, notes, status: 'pending',
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });

    if (Array.isArray(bends) && bends.length > 0) {
        await supabase.from('quote_bends').insert(
            bends.map((b: any, i: number) => ({
                quoteId: quote.id, bendOrder: i + 1,
                risks: b.risks, totalWidthCm: b.totalWidthCm,
                roundedWidthCm: b.roundedWidthCm, lengths: b.lengths,
                totalLengthM: b.totalLengthM, m2: b.m2,
                svgDataUrl: b.svgDataUrl || null, // save the visual preview
            }))
        );
    }

    // WhatsApp notification log
    const phone = sett.whatsappMaster || sett.whatsapp;
    if (phone) console.log(`📱 Novo orçamento #${quote.id} - ${quote.clientName} - R$ ${totalValue.toFixed(2)}`);

    res.json(quote);
});

app.put('/api/quotes/:id/status', authenticate as any, async (req: any, res) => {
    const id = parseInt(req.params.id);
    const { status, finalValue, notes } = req.body || {};
    const isAdminOrMaster = req.user.role === 'admin' || req.user.role === 'master';

    // Get current quote to check ownership and current status
    const { data: current } = await supabase.from('quotes').select('*').eq('id', id).single();
    if (!current) return res.status(404).json({ error: 'Orçamento não encontrado' });

    // Regular users can only cancel their own unpaid quotes
    if (req.user.role === 'user') {
        if (current.clientId !== req.user.id) return res.status(403).json({ error: 'Acesso negado' });
        if (status !== 'cancelled') return res.status(403).json({ error: 'Usuários comuns só podem cancelar' });
        if (current.status === 'paid') return res.status(403).json({ error: 'Orçamento já pago não pode ser cancelado' });
    }

    const updateData: any = { status, updatedAt: new Date().toISOString() };
    if (finalValue !== undefined && isAdminOrMaster) updateData.finalValue = parseFloat(finalValue);
    if (notes !== undefined) updateData.notes = notes;
    if (status === 'paid') { updateData.paidAt = new Date().toISOString(); updateData.paidBy = req.user.id; }

    const { data: quote, error } = await supabase.from('quotes').update(updateData).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });

    // Financial record: trigger on 'in_production' (not on paid)
    if (status === 'in_production' && quote) {
        const { data: existing } = await supabase.from('financial_records').select('id').eq('quoteId', id).single();
        if (!existing) {
            await supabase.from('financial_records').insert({
                quoteId: id, clientName: quote.clientName,
                grossValue: quote.totalValue, discountValue: quote.discountValue || 0,
                netValue: quote.finalValue || quote.totalValue, paymentMethod: 'pix',
                status: 'aguardando_pagamento',
                createdAt: new Date().toISOString(), confirmedBy: req.user.id,
            });
        }
    }

    // Inventory deduction on production
    if (status === 'in_production' && quote?.totalM2) {
        const { data: inventories } = await supabase.from('inventory').select('*').gt('availableM2', 0).order('purchasedAt', { ascending: true });
        let remaining = parseFloat(quote.totalM2);
        for (const inv of inventories || []) {
            if (remaining <= 0) break;
            const debit = Math.min(remaining, parseFloat(inv.availableM2));
            await supabase.from('inventory').update({ availableM2: parseFloat(inv.availableM2) - debit }).eq('id', inv.id);
            await supabase.from('inventory_transactions').insert({ inventoryId: inv.id, quoteId: id, type: 'consumption', m2Amount: debit, createdBy: req.user.id });
            remaining -= debit;
        }
    }
    res.json(quote);
});

app.get('/api/quotes/:id/bends', authenticate as any, async (req: any, res) => {
    const id = parseInt(req.params.id);
    // Check access: user can only see their own quotes' bends
    const { data: quote } = await supabase.from('quotes').select('clientId').eq('id', id).single();
    if (!quote) return res.status(404).json({ error: 'Not found' });
    if (req.user.role === 'user' && quote.clientId !== req.user.id) return res.status(403).json({ error: 'Acesso negado' });
    const { data, error } = await supabase.from('quote_bends').select('*').eq('quoteId', id).order('bendOrder', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
});

app.post('/api/quotes/:id/discount', requireMaster as any, async (req: any, res) => {
    const id = parseInt(req.params.id);
    const { discountValue, reason } = req.body || {};
    const { data: quote } = await supabase.from('quotes').select('*').eq('id', id).single();
    if (!quote) return res.status(404).json({ error: 'Not found' });
    const finalValue = Math.max(0, (quote.totalValue || 0) - (discountValue || 0));
    await supabase.from('quotes').update({ discountValue, finalValue, updatedAt: new Date().toISOString() }).eq('id', id);
    await supabase.from('discount_audit').insert({ quoteId: id, originalValue: quote.totalValue, discountedValue: finalValue, appliedBy: req.user.id, reason });
    res.json({ success: true, finalValue });
});

app.post('/api/quotes/:id/proof', authenticate as any, async (req: any, res) => {
    const id = parseInt(req.params.id);
    const { data: quote } = await supabase.from('quotes').select('clientId').eq('id', id).single();
    if (!quote) return res.status(404).json({ error: 'Not found' });
    if (req.user.role === 'user' && quote.clientId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    const { files } = await parseMultipart(req);
    const f = files[0];
    if (!f) return res.status(400).json({ error: 'File required' });
    const pixProofUrl = await uploadToStorage(f.buffer, f.originalname, f.mimetype);
    await supabase.from('quotes').update({ pixProofUrl, updatedAt: new Date().toISOString() }).eq('id', id);
    res.json({ success: true, pixProofUrl });
});

// ── INVENTORY ────────────────────────────────────────────────────────────────
app.get('/api/inventory', requireAdmin as any, async (_req, res) => {
    const { data } = await supabase.from('inventory').select('*').order('purchasedAt', { ascending: false });
    res.json(data || []);
});
app.post('/api/inventory', requireAdmin as any, async (req: any, res) => {
    const { description, widthM, lengthM, costPerUnit, notes, lowStockThresholdM2 } = req.body || {};
    const wM = parseFloat(widthM) || 1.20;
    const lM = parseFloat(lengthM) || 33;
    const totalM2 = wM * lM;
    const { data, error } = await supabase.from('inventory').insert({
        description, widthM: wM, lengthM: lM, availableM2: totalM2,
        costPerUnit, notes, lowStockThresholdM2: parseFloat(lowStockThresholdM2) || 5,
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    await supabase.from('inventory_transactions').insert({ inventoryId: data.id, type: 'purchase', m2Amount: totalM2, createdBy: req.user.id });
    res.json(data);
});
app.put('/api/inventory/:id', requireAdmin as any, async (req, res) => {
    const { description, notes, lowStockThresholdM2, availableM2 } = req.body || {};
    const { data, error } = await supabase.from('inventory').update({ description, notes, lowStockThresholdM2, availableM2 }).eq('id', req.params.id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});
app.delete('/api/inventory/:id', requireAdmin as any, async (req, res) => {
    await supabase.from('inventory').delete().eq('id', req.params.id);
    res.json({ success: true });
});
app.get('/api/inventory/summary', requireAdmin as any, async (_req, res) => {
    const { data: settings } = await supabase.from('settings').select('*');
    const sett = (settings || []).reduce((a: any, s: any) => ({ ...a, [s.key]: s.value }), {});
    const threshold = parseFloat(sett.lowStockAlertM2 || '10');
    const { data: inv } = await supabase.from('inventory').select('availableM2');
    const total = (inv || []).reduce((s, i) => s + parseFloat(i.availableM2 || 0), 0);
    res.json({ totalAvailableM2: total, lowStock: total < threshold, threshold });
});

// ── FINANCIAL ────────────────────────────────────────────────────────────────
app.get('/api/financial', requireAdmin as any, async (req, res) => {
    const { from, to, method } = req.query;
    let q = supabase.from('financial_records').select('*').order('paidAt', { ascending: false });
    if (from) q = q.gte('paidAt', from as string);
    if (to) q = q.lte('paidAt', to as string);
    if (method) q = q.eq('paymentMethod', method as string);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
});
app.get('/api/financial/summary', requireAdmin as any, async (_req, res) => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const [all, today, month] = await Promise.all([
        supabase.from('financial_records').select('netValue'),
        supabase.from('financial_records').select('netValue').gte('paidAt', todayStart),
        supabase.from('financial_records').select('netValue').gte('paidAt', monthStart),
    ]);
    const sum = (rows: any[]) => rows.reduce((a, r) => a + parseFloat(r.netValue || 0), 0);
    const allD = all.data || []; const todD = today.data || []; const monD = month.data || [];
    res.json({
        totalAll: sum(allD), totalToday: sum(todD), totalMonth: sum(monD),
        countAll: allD.length, countToday: todD.length, countMonth: monD.length,
        ticketAverage: allD.length > 0 ? sum(allD) / allD.length : 0,
    });
});

// ── SEED (initial setup) ─────────────────────────────────────────────────────
app.post('/api/seed', async (req, res) => {
    const { token } = req.body || {};
    if (token !== process.env.ADMIN_PASSWORD) return res.status(403).json({ error: 'Forbidden' });
    const hashed = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);
    await supabase.from('users').upsert(
        { username: 'admin', password: hashed, role: 'master', name: 'Administrador', active: true },
        { onConflict: 'username' }
    );
    const { data: settings } = await supabase.from('settings').select('key').limit(1);
    if (!settings?.length) {
        await supabase.from('settings').insert([
            { key: 'companyName', value: 'Ferreira Calhas' },
            { key: 'whatsapp', value: '5566996172808' },
            { key: 'whatsappMaster', value: '5566996172808' },
            { key: 'address', value: 'Avenida Jose Goncalves, 931, Sinop - MT, Brasil' },
            { key: 'aboutText', value: 'Especialistas em fabricação e instalação de calhas, rufos e pingadeiras em Sinop e região.' },
            { key: 'heroTitle', value: 'Proteção e Estética para o seu Telhado' },
            { key: 'heroSubtitle', value: 'Fabricação própria de calhas e rufos com a qualidade que sua obra merece.' },
            { key: 'pricePerM2', value: '50' },
            { key: 'pixKey', value: '' },
            { key: 'pixQrCodeUrl', value: '' },
            { key: 'lowStockAlertM2', value: '10' },
            { key: 'email', value: '' },
        ]);
    }
    res.json({ success: true, message: 'Seeded successfully' });
});

// ---------------------------------------------------------------------------
// Vercel handler
// ---------------------------------------------------------------------------
export default function handler(req: VercelRequest, res: VercelResponse) {
    return app(req as any, res as any);
}
