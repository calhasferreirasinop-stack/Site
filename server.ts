import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// --- Seed ---
async function seedDatabase() {
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const hashedPassword = bcrypt.hashSync(adminPassword, 10);
  await supabase.from('users').upsert(
    { username: 'admin', password: hashedPassword, role: 'master', name: 'Administrador', active: true },
    { onConflict: 'username' }
  );

  const { data: settings } = await supabase.from('settings').select('key').limit(1);
  if (!settings || settings.length === 0) {
    await supabase.from('settings').insert([
      { key: 'companyName', value: 'Ferreira Calhas' },
      { key: 'whatsapp', value: '5566996172808' },
      { key: 'address', value: 'Avenida Jose Goncalves, 931, Sinop - MT, Brasil' },
      { key: 'aboutText', value: 'Especialistas em fabricação e instalação de calhas, rufos e pingadeiras em Sinop e região.' },
      { key: 'heroTitle', value: 'Proteção e Estética para o seu Telhado' },
      { key: 'heroSubtitle', value: 'Fabricação própria de calhas e rufos com a qualidade que sua obra merece.' },
      { key: 'logoUrl', value: '/uploads/logo_ferreira.png' },
      { key: 'pricePerM2', value: '50' },
      { key: 'pixKey', value: '' },
      { key: 'pixQrCodeUrl', value: '' },
      { key: 'lowStockAlertM2', value: '10' },
      { key: 'whatsappMaster', value: '5566996172808' },
    ]);
  } else {
    // Ensure new settings exist
    const newSettings = [
      { key: 'pricePerM2', value: '50' },
      { key: 'pixKey', value: '' },
      { key: 'pixQrCodeUrl', value: '' },
      { key: 'lowStockAlertM2', value: '10' },
      { key: 'whatsappMaster', value: '5566996172808' },
      { key: 'email', value: '' },
    ];
    for (const s of newSettings) {
      const { data } = await supabase.from('settings').select('key').eq('key', s.key).single();
      if (!data) await supabase.from('settings').insert(s);
    }
  }

  const { data: testimonials } = await supabase.from('testimonials').select('id').limit(1);
  if (!testimonials || testimonials.length === 0) {
    await supabase.from('testimonials').insert([
      { author: 'Ricardo Silva', content: 'Serviço de excelente qualidade. As calhas ficaram perfeitas.', rating: 5 },
      { author: 'Maria Oliveira', content: 'Fiquei muito satisfeita com o trabalho da Ferreira Calhas.', rating: 5 },
      { author: 'João Pereira', content: 'Preço justo e entrega no prazo. Nota 10!', rating: 5 },
    ]);
  }

  const { data: services } = await supabase.from('services').select('id').limit(1);
  if (!services || services.length === 0) {
    const { data: insertedServices } = await supabase.from('services').insert([
      { title: 'Calhas', description: 'Instalação de calhas sob medida para residências e comércios.', imageUrl: 'https://images.unsplash.com/photo-1635424710928-0544e8512eae?q=80&w=800' },
      { title: 'Rufos', description: 'Proteção metálica essencial para evitar infiltrações.', imageUrl: 'https://picsum.photos/seed/rufo/800/600' },
      { title: 'Pingadeiras', description: 'Acabamento superior para muros.', imageUrl: 'https://picsum.photos/seed/pingadeira/800/600' },
      { title: 'Fabricação Própria', description: 'Contamos com maquinário moderno para dobrar chapas sob medida.', imageUrl: 'https://picsum.photos/seed/fabricacao/800/600' },
      { title: 'Equipe e Obras', description: 'Nossa equipe em ação e registros de obras concluídas.', imageUrl: 'https://picsum.photos/seed/equipe/800/600' },
    ]).select();

    if (insertedServices && insertedServices.length === 5) {
      const [s1, s2, s3, s4, s5] = insertedServices;
      const galleryItems: { imageUrl: string; description: string; serviceId: number }[] = [];
      [1, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 36, 58, 59, 60].forEach(n =>
        galleryItems.push({ imageUrl: `https://picsum.photos/seed/${n}/800/600`, description: `Calha ${n}`, serviceId: s1.id }));
      [2, 3, 4, 5, 6, 7, 8, 56].forEach(n =>
        galleryItems.push({ imageUrl: `https://picsum.photos/seed/${n}/800/600`, description: `Rufo ${n}`, serviceId: s2.id }));
      [10, 11, 12, 13, 14, 15, 16, 17, 18, 19].forEach(n =>
        galleryItems.push({ imageUrl: `https://picsum.photos/seed/${n}/800/600`, description: `Pingadeira ${n}`, serviceId: s3.id }));
      [38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53].forEach(n =>
        galleryItems.push({ imageUrl: `https://picsum.photos/seed/${n}/800/600`, description: `Fabricação ${n}`, serviceId: s4.id }));
      [9, 34, 35, 37, 54, 55, 57].forEach(n =>
        galleryItems.push({ imageUrl: `https://picsum.photos/seed/${n}/800/600`, description: `Obra ${n}`, serviceId: s5.id }));
      await supabase.from('gallery').insert(galleryItems);
    }
  }

  console.log('✅ Database seeded');
}

// Multer
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname)),
});
const upload = multer({ storage });

// --- Auth Middleware ---
interface AuthUser { id: number; username: string; role: 'user' | 'admin' | 'master'; name?: string; }

const parseSession = async (req: any): Promise<AuthUser | null> => {
  const session = req.cookies.session;
  if (!session) return null;
  try {
    const decoded = Buffer.from(session, 'base64').toString('utf8');
    const { userId } = JSON.parse(decoded);
    const { data: user } = await supabase.from('users').select('id,username,role,name,active').eq('id', userId).single();
    if (!user || !user.active) return null;
    return user as AuthUser;
  } catch { return null; }
};

const authenticate = async (req: any, res: any, next: any) => {
  const user = await parseSession(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.user = user;
  next();
};

const requireAdmin = async (req: any, res: any, next: any) => {
  const user = await parseSession(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (user.role !== 'admin' && user.role !== 'master') return res.status(403).json({ error: 'Forbidden' });
  req.user = user;
  next();
};

const requireMaster = async (req: any, res: any, next: any) => {
  const user = await parseSession(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (user.role !== 'master') return res.status(403).json({ error: 'Forbidden - Master only' });
  req.user = user;
  next();
};

// =====================
// AUTH Routes
// =====================
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const { data: users } = await supabase.from('users').select('*').eq('username', username).eq('active', true).limit(1);
  const user = users?.[0];
  if (user && bcrypt.compareSync(password, user.password)) {
    const sessionData = Buffer.from(JSON.stringify({ userId: user.id })).toString('base64');
    res.cookie('session', sessionData, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });
    // Clear old cookie
    res.clearCookie('admin_session');
    res.json({ success: true, role: user.role, name: user.name || user.username });
  } else {
    res.status(401).json({ error: 'Credenciais inválidas' });
  }
});

app.post('/api/logout', (_req, res) => {
  res.clearCookie('session');
  res.clearCookie('admin_session');
  res.json({ success: true });
});

app.get('/api/auth/check', async (req, res) => {
  const user = await parseSession(req);
  // Also support legacy cookie
  const legacyCookie = req.cookies.admin_session;
  if (user) {
    res.json({ authenticated: true, role: user.role, name: user.name || user.username, id: user.id });
  } else if (legacyCookie === 'authenticated') {
    // Legacy support: get admin user
    const { data: adminUser } = await supabase.from('users').select('id,username,role,name').eq('username', 'admin').single();
    if (adminUser) {
      res.json({ authenticated: true, role: adminUser.role, name: adminUser.name || adminUser.username, id: adminUser.id });
    } else {
      res.json({ authenticated: false });
    }
  } else {
    res.json({ authenticated: false });
  }
});

app.get('/api/auth/me', authenticate, (req: any, res) => {
  res.json(req.user);
});

app.post('/api/auth/change-password', authenticate, async (req: any, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Mínimo 6 caracteres' });
  const hashed = bcrypt.hashSync(newPassword, 10);
  await supabase.from('users').update({ password: hashed }).eq('id', req.user.id);
  res.json({ success: true });
});

// =====================
// USERS Routes (Admin+)
// =====================
app.get('/api/users', requireAdmin, async (_req, res) => {
  const { data, error } = await supabase.from('users').select('id,username,name,email,phone,role,active,"createdAt"').order('createdAt', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.post('/api/users', requireAdmin, async (req: any, res) => {
  const { username, password, name, email, phone, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username e senha obrigatórios' });

  // Only master can create admin/master
  if ((role === 'admin' || role === 'master') && req.user.role !== 'master') {
    return res.status(403).json({ error: 'Apenas master pode criar admins' });
  }

  const hashed = bcrypt.hashSync(password, 10);
  const { data, error } = await supabase.from('users').insert({
    username, password: hashed, name, email, phone,
    role: role || 'user', active: true
  }).select('id,username,name,email,phone,role,active').single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put('/api/users/:id', requireAdmin, async (req: any, res) => {
  const id = parseInt(req.params.id);
  const { name, email, phone, active, role, password } = req.body;

  // Only master can change roles
  const updateData: any = { name, email, phone, active };
  if (role !== undefined && req.user.role === 'master') updateData.role = role;
  if (password) updateData.password = bcrypt.hashSync(password, 10);

  const { data, error } = await supabase.from('users').update(updateData).eq('id', id)
    .select('id,username,name,email,phone,role,active').single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/users/:id', requireAdmin, async (req: any, res) => {
  const id = parseInt(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'Não pode excluir a si mesmo' });
  await supabase.from('users').delete().eq('id', id);
  res.json({ success: true });
});

// =====================
// SETTINGS Routes
// =====================
app.get('/api/settings', async (_req, res) => {
  const { data } = await supabase.from('settings').select('*');
  const obj = (data || []).reduce((acc: any, curr: any) => ({ ...acc, [curr.key]: curr.value }), {});
  res.json(obj);
});

app.post('/api/settings', requireAdmin, upload.fields([{ name: 'logo' }, { name: 'heroImage' }, { name: 'pixQrCode' }]), async (req, res) => {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };
  const settings = req.body;

  const upserts: { key: string; value: string }[] = Object.entries(settings)
    .filter(([k]) => !['logoUrl', 'heroImageUrl', 'pixQrCodeUrl'].includes(k))
    .map(([key, value]) => ({ key, value: String(value) }));

  if (files?.logo?.[0]) upserts.push({ key: 'logoUrl', value: `/uploads/${files.logo[0].filename}` });
  if (files?.heroImage?.[0]) upserts.push({ key: 'heroImageUrl', value: `/uploads/${files.heroImage[0].filename}` });
  if (files?.pixQrCode?.[0]) upserts.push({ key: 'pixQrCodeUrl', value: `/uploads/${files.pixQrCode[0].filename}` });

  await supabase.from('settings').upsert(upserts, { onConflict: 'key' });
  res.json({ success: true });
});

// =====================
// ADMIN DATA Route
// =====================
app.get('/api/admin/data', requireAdmin, async (req: any, res) => {
  try {
    const [settingsRes, servicesRes, postsRes, galleryRes, testimonialsRes, quotesRes, inventoryRes] = await Promise.all([
      supabase.from('settings').select('*').then(r => r),
      supabase.from('services').select('*').then(r => r),
      supabase.from('posts').select('*').order('createdAt', { ascending: false }).then(r => r),
      supabase.from('gallery').select('*').order('createdAt', { ascending: false }).then(r => r),
      supabase.from('testimonials').select('*').order('createdAt', { ascending: false }).then(r => r),
      supabase.from('quotes').select('*').order('createdAt', { ascending: false }).then(r => r),
      supabase.from('inventory').select('*').order('purchasedAt', { ascending: false }).then(r => r),
    ]);

    let usersRes: any = null;
    if (req.user.role === 'master' || req.user.role === 'admin') {
      usersRes = await supabase.from('users').select('id,username,name,email,phone,role,active,"createdAt"').order('createdAt', { ascending: false }).then(r => r);
    }

    const settings = (settingsRes.data || []).reduce((acc: any, curr: any) => {
      acc[curr.key] = curr.value; return acc;
    }, {});

    res.json({
      settings,
      services: servicesRes.data || [],
      posts: postsRes.data || [],
      gallery: galleryRes.data || [],
      testimonials: testimonialsRes.data || [],
      quotes: quotesRes.data || [],
      inventory: inventoryRes.data || [],
      users: usersRes?.data || [],
      currentUser: req.user,
    });
  } catch (error) {
    console.error('Error fetching admin data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =====================
// SERVICES Routes
// =====================
app.get('/api/services', async (_req, res) => {
  const { data } = await supabase.from('services').select('*');
  res.json(data || []);
});

app.post('/api/services', requireAdmin, upload.single('image'), async (req, res) => {
  const { title, description } = req.body;
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
  const { data, error } = await supabase.from('services').insert({ title, description, imageUrl }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/services/delete/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  const { data: item } = await supabase.from('services').select('imageUrl').eq('id', id).single();
  if (item?.imageUrl?.startsWith('/uploads/')) {
    const fp = path.join(process.cwd(), item.imageUrl);
    if (fs.existsSync(fp)) try { fs.unlinkSync(fp); } catch (_) { }
  }
  await supabase.from('services').delete().eq('id', id);
  res.json({ success: true });
});

app.post('/api/services/:id/home-image', requireAdmin, upload.single('homeImage'), async (req, res) => {
  const id = parseInt(req.params.id);
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const homeImageUrl = `/uploads/${req.file.filename}`;
  await supabase.from('services').update({ homeImageUrl }).eq('id', id);
  res.json({ success: true, homeImageUrl });
});

// =====================
// POSTS Routes
// =====================
app.get('/api/posts', async (_req, res) => {
  const { data } = await supabase.from('posts').select('*').order('createdAt', { ascending: false });
  res.json(data || []);
});

app.post('/api/posts', requireAdmin, upload.single('image'), async (req, res) => {
  const { title, content } = req.body;
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
  const { data, error } = await supabase.from('posts').insert({ title, content, imageUrl }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/posts/delete/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  const { data: item } = await supabase.from('posts').select('imageUrl').eq('id', id).single();
  if (item?.imageUrl?.startsWith('/uploads/')) {
    const fp = path.join(process.cwd(), item.imageUrl);
    if (fs.existsSync(fp)) try { fs.unlinkSync(fp); } catch (_) { }
  }
  await supabase.from('posts').delete().eq('id', id);
  res.json({ success: true });
});

// =====================
// GALLERY Routes
// =====================
app.get('/api/gallery', async (req, res) => {
  const { serviceId } = req.query;
  let query = supabase.from('gallery').select('*').order('createdAt', { ascending: false });
  if (serviceId) query = query.eq('serviceId', serviceId);
  const { data } = await query;
  res.json(data || []);
});

app.post('/api/gallery', requireAdmin, upload.array('images'), async (req, res) => {
  const { description, serviceId } = req.body;
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) return res.status(400).json({ error: 'Pelo menos uma imagem é necessária' });
  const parsedServiceId = serviceId ? parseInt(String(serviceId), 10) : null;
  const items = files.map(file => ({ imageUrl: `/uploads/${file.filename}`, description: description || '', serviceId: parsedServiceId }));
  const { data, error } = await supabase.from('gallery').insert(items).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/gallery/delete/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  const { data: item } = await supabase.from('gallery').select('imageUrl').eq('id', id).single();
  if (item?.imageUrl?.startsWith('/uploads/')) {
    const fp = path.join(process.cwd(), item.imageUrl);
    if (fs.existsSync(fp)) try { fs.unlinkSync(fp); } catch (_) { }
  }
  await supabase.from('gallery').delete().eq('id', id);
  res.json({ success: true });
});

app.post('/api/gallery/bulk-delete', requireAdmin, async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'IDs obrigatórios' });
  const numericIds = ids.map((id: any) => parseInt(id)).filter(id => !isNaN(id));
  const { data: items } = await supabase.from('gallery').select('imageUrl').in('id', numericIds);
  for (const item of items || []) {
    if (item.imageUrl?.startsWith('/uploads/')) {
      const fp = path.join(process.cwd(), item.imageUrl);
      if (fs.existsSync(fp)) try { fs.unlinkSync(fp); } catch (_) { }
    }
  }
  await supabase.from('gallery').delete().in('id', numericIds);
  res.json({ success: true });
});

// =====================
// TESTIMONIALS Routes
// =====================
app.get('/api/testimonials', async (_req, res) => {
  const { data } = await supabase.from('testimonials').select('*').order('createdAt', { ascending: false });
  res.json(data || []);
});

app.post('/api/testimonials', requireAdmin, async (req, res) => {
  const { author, content, rating } = req.body;
  const { data, error } = await supabase.from('testimonials').insert({ author, content, rating: rating || 5 }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/testimonials/delete/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  await supabase.from('testimonials').delete().eq('id', id);
  res.json({ success: true });
});

// =====================
// QUOTES Routes
// =====================
app.get('/api/quotes', authenticate, async (req: any, res) => {
  let query = supabase.from('quotes').select('*').order('createdAt', { ascending: false });
  // Regular users only see their own quotes
  if (req.user.role === 'user') query = query.eq('clientId', req.user.id);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.post('/api/quotes', authenticate, async (req: any, res) => {
  const { clientName, bends, notes } = req.body;

  // Calculate totals from bends
  let totalM2 = 0;
  if (bends && Array.isArray(bends)) {
    for (const bend of bends) {
      totalM2 += parseFloat(bend.m2 || 0);
    }
  }

  const { data: settings } = await supabase.from('settings').select('*');
  const settingsObj = (settings || []).reduce((acc: any, s: any) => ({ ...acc, [s.key]: s.value }), {});
  const pricePerM2 = parseFloat(settingsObj.pricePerM2 || '50');
  const totalValue = totalM2 * pricePerM2;

  const { data: quote, error: qError } = await supabase.from('quotes').insert({
    clientId: req.user.id,
    clientName: clientName || req.user.name || req.user.username,
    createdBy: req.user.id,
    totalM2,
    totalValue,
    finalValue: totalValue,
    notes,
    status: 'pending',
  }).select().single();

  if (qError) return res.status(500).json({ error: qError.message });

  // Insert bends
  if (bends && Array.isArray(bends) && bends.length > 0) {
    const bendRows = bends.map((b: any, i: number) => ({
      quoteId: quote.id,
      bendOrder: i + 1,
      risks: b.risks,
      totalWidthCm: b.totalWidthCm,
      roundedWidthCm: b.roundedWidthCm,
      lengths: b.lengths,
      totalLengthM: b.totalLengthM,
      m2: b.m2,
    }));
    await supabase.from('quote_bends').insert(bendRows);
  }

  // Send WhatsApp notification
  try {
    const phone = settingsObj.whatsappMaster || settingsObj.whatsapp;
    if (phone) {
      // Store notification in quote notes - WhatsApp link is generated on frontend
      console.log(`📱 Novo orçamento #${quote.id} criado por ${quote.clientName} - Valor: R$ ${totalValue.toFixed(2)}`);
    }
  } catch (_) { }

  res.json(quote);
});

app.get('/api/quotes/:id', authenticate, async (req: any, res) => {
  const id = parseInt(req.params.id);
  const { data: quote, error } = await supabase.from('quotes').select('*').eq('id', id).single();
  if (error || !quote) return res.status(404).json({ error: 'Orçamento não encontrado' });

  // Users can only see their own
  if (req.user.role === 'user' && quote.clientId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

  const { data: quoteWithBends } = await supabase.from('quote_bends').select('*').eq('quoteId', id).order('bendOrder');
  res.json({ ...quote, bends: quoteWithBends || [] });
});

app.put('/api/quotes/:id/status', requireAdmin, async (req: any, res) => {
  const id = parseInt(req.params.id);
  const { status } = req.body;

  const updateData: any = { status, updatedAt: new Date().toISOString() };
  if (status === 'paid') {
    updateData.paidAt = new Date().toISOString();
    updateData.paidBy = req.user.id;
  }

  const { data: quote, error } = await supabase.from('quotes').update(updateData).eq('id', id).select().single();
  if (error) return res.status(500).json({ error: error.message });

  // Create financial record on payment
  if (status === 'paid' && quote) {
    const { data: existing } = await supabase.from('financial_records').select('id').eq('quoteId', id).single();
    if (!existing) {
      await supabase.from('financial_records').insert({
        quoteId: id,
        clientName: quote.clientName,
        grossValue: quote.totalValue,
        discountValue: quote.discountValue || 0,
        netValue: quote.finalValue,
        paymentMethod: 'pix',
        paidAt: quote.paidAt,
        confirmedBy: req.user.id,
      });
    }

    // Debit inventory if moving to production
    if (status === 'in_production' && quote.totalM2) {
      await debitInventory(id, quote.totalM2, req.user.id);
    }
  }

  // Debit inventory when moving to production
  if (status === 'in_production' && quote?.totalM2) {
    await debitInventory(id, quote.totalM2, req.user.id);
  }

  res.json(quote);
});

async function debitInventory(quoteId: number, m2Needed: number, userId: number) {
  const { data: inventories } = await supabase.from('inventory').select('*').gt('availableM2', 0).order('purchasedAt', { ascending: true });
  let remaining = m2Needed;
  for (const inv of inventories || []) {
    if (remaining <= 0) break;
    const debit = Math.min(remaining, inv.availableM2);
    await supabase.from('inventory').update({ availableM2: inv.availableM2 - debit }).eq('id', inv.id);
    await supabase.from('inventory_transactions').insert({
      inventoryId: inv.id, quoteId, type: 'consumption', m2Amount: debit, createdBy: userId,
    });
    remaining -= debit;
  }
}

app.post('/api/quotes/:id/discount', requireMaster, async (req: any, res) => {
  const id = parseInt(req.params.id);
  const { discountValue, reason } = req.body;

  const { data: quote } = await supabase.from('quotes').select('*').eq('id', id).single();
  if (!quote) return res.status(404).json({ error: 'Orçamento não encontrado' });

  const finalValue = Math.max(0, (quote.totalValue || 0) - (discountValue || 0));

  await supabase.from('quotes').update({ discountValue, finalValue, updatedAt: new Date().toISOString() }).eq('id', id);
  await supabase.from('discount_audit').insert({
    quoteId: id,
    originalValue: quote.totalValue,
    discountedValue: finalValue,
    appliedBy: req.user.id,
    reason,
  });

  res.json({ success: true, finalValue });
});

app.post('/api/quotes/:id/proof', authenticate, upload.single('proof'), async (req: any, res) => {
  const id = parseInt(req.params.id);
  const { data: quote } = await supabase.from('quotes').select('clientId').eq('id', id).single();
  if (!quote) return res.status(404).json({ error: 'Orçamento não encontrado' });
  if (req.user.role === 'user' && quote.clientId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  if (!req.file) return res.status(400).json({ error: 'Arquivo obrigatório' });

  const pixProofUrl = `/uploads/${req.file.filename}`;
  await supabase.from('quotes').update({ pixProofUrl, updatedAt: new Date().toISOString() }).eq('id', id);
  res.json({ success: true, pixProofUrl });
});

// =====================
// INVENTORY Routes
// =====================
app.get('/api/inventory', requireAdmin, async (_req, res) => {
  const { data, error } = await supabase.from('inventory').select('*').order('purchasedAt', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.post('/api/inventory', requireAdmin, async (req: any, res) => {
  const { description, widthM, lengthM, costPerUnit, notes, lowStockThresholdM2 } = req.body;
  const wM = parseFloat(widthM) || 1.20;
  const lM = parseFloat(lengthM) || 33;
  const totalM2 = wM * lM;

  const { data, error } = await supabase.from('inventory').insert({
    description, widthM: wM, lengthM: lM, availableM2: totalM2,
    costPerUnit, notes, lowStockThresholdM2: parseFloat(lowStockThresholdM2) || 5,
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  await supabase.from('inventory_transactions').insert({
    inventoryId: data.id, type: 'purchase', m2Amount: totalM2, createdBy: req.user.id,
  });
  res.json(data);
});

app.put('/api/inventory/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { description, notes, lowStockThresholdM2, availableM2 } = req.body;
  const { data, error } = await supabase.from('inventory').update({ description, notes, lowStockThresholdM2, availableM2 }).eq('id', id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/inventory/:id', requireAdmin, async (req, res) => {
  await supabase.from('inventory').delete().eq('id', req.params.id);
  res.json({ success: true });
});

app.get('/api/inventory/summary', requireAdmin, async (_req, res) => {
  const { data: settings } = await supabase.from('settings').select('*');
  const settingsObj = (settings || []).reduce((acc: any, s: any) => ({ ...acc, [s.key]: s.value }), {});
  const threshold = parseFloat(settingsObj.lowStockAlertM2 || '10');

  const { data: inventory } = await supabase.from('inventory').select('availableM2');
  const totalAvailable = (inventory || []).reduce((sum, inv) => sum + parseFloat(inv.availableM2 || 0), 0);
  const lowStock = totalAvailable < threshold;

  res.json({ totalAvailableM2: totalAvailable, lowStock, threshold });
});

// =====================
// FINANCIAL Routes (Admin+)
// =====================
app.get('/api/financial', requireAdmin, async (req, res) => {
  const { from, to, method } = req.query;
  let query = supabase.from('financial_records').select('*').order('paidAt', { ascending: false });
  if (from) query = query.gte('paidAt', from as string);
  if (to) query = query.lte('paidAt', to as string);
  if (method) query = query.eq('paymentMethod', method);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.get('/api/financial/summary', requireAdmin, async (_req, res) => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [allRes, todayRes, monthRes] = await Promise.all([
    supabase.from('financial_records').select('netValue'),
    supabase.from('financial_records').select('netValue').gte('paidAt', todayStart),
    supabase.from('financial_records').select('netValue').gte('paidAt', monthStart),
  ]);

  const sum = (rows: any[]) => rows.reduce((acc, r) => acc + parseFloat(r.netValue || 0), 0);
  const allData = allRes.data || [];
  const todayData = todayRes.data || [];
  const monthData = monthRes.data || [];

  res.json({
    totalAll: sum(allData),
    totalToday: sum(todayData),
    totalMonth: sum(monthData),
    countAll: allData.length,
    ticketAverage: allData.length > 0 ? sum(allData) / allData.length : 0,
    countToday: todayData.length,
    countMonth: monthData.length,
  });
});

// =====================
// Vite + Server Start
// =====================
async function startServer() {
  await seedDatabase();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => res.sendFile(path.resolve(__dirname, 'dist', 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server on http://localhost:${PORT}`));
}

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  startServer();
}

export default app;
