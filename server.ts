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

// Supabase client (uses service_role key for full access on the backend)
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve uploaded files statically
app.use('/uploads', express.static(uploadsDir));

// --- Seed helper (runs once at startup) ---
async function seedDatabase() {
  // Admin user — always upsert so it's always present
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const hashedPassword = bcrypt.hashSync(adminPassword, 10);
  const { error: userErr } = await supabase
    .from('users')
    .upsert({ username: 'admin', password: hashedPassword }, { onConflict: 'username' });
  if (userErr) {
    console.error('❌ Error upserting admin user:', userErr.message);
  } else {
    console.log('Admin user upserted');
  }

  // Settings
  const { data: settings } = await supabase.from('settings').select('key').limit(1);
  if (!settings || settings.length === 0) {
    await supabase.from('settings').insert([
      { key: 'companyName', value: 'Ferreira Calhas' },
      { key: 'whatsapp', value: '5566996172808' },
      { key: 'address', value: 'Avenida Jose Goncalves, 931, Sinop - MT, Brasil' },
      { key: 'aboutText', value: 'Especialistas em fabricação e instalação de calhas, rufos e pingadeiras em Sinop e região. Qualidade e compromisso com o seu projeto.' },
      { key: 'heroTitle', value: 'Proteção e Estética para o seu Telhado' },
      { key: 'heroSubtitle', value: 'Fabricação própria de calhas e rufos com a qualidade que sua obra merece.' },
      { key: 'logoUrl', value: '/uploads/logo_ferreira.png' },
    ]);
  }

  // Testimonials
  const { data: testimonials } = await supabase.from('testimonials').select('id').limit(1);
  if (!testimonials || testimonials.length === 0) {
    await supabase.from('testimonials').insert([
      { author: 'Ricardo Silva', content: 'Serviço de excelente qualidade. As calhas ficaram perfeitas e o atendimento foi muito profissional.', rating: 5 },
      { author: 'Maria Oliveira', content: 'Fiquei muito satisfeita com o trabalho da Ferreira Calhas. Recomendo a todos em Sinop.', rating: 5 },
      { author: 'João Pereira', content: 'Preço justo e entrega no prazo. Nota 10!', rating: 5 },
    ]);
  }

  // Services + Gallery
  const { data: services } = await supabase.from('services').select('id').limit(1);
  if (!services || services.length === 0) {
    const { data: insertedServices } = await supabase.from('services').insert([
      { title: 'Calhas', description: 'Instalação de calhas sob medida para residências e comércios, garantindo o escoamento perfeito da água da chuva.', imageUrl: 'https://images.unsplash.com/photo-1635424710928-0544e8512eae?q=80&w=800' },
      { title: 'Rufos', description: 'Proteção metálica essencial para evitar infiltrações nos encontros entre telhados e paredes.', imageUrl: 'https://picsum.photos/seed/rufo/800/600' },
      { title: 'Pingadeiras', description: 'Acabamento superior para muros que protege a pintura e evita manchas causadas pela água.', imageUrl: 'https://picsum.photos/seed/pingadeira/800/600' },
      { title: 'Fabricação Própria', description: 'Contamos com maquinário moderno para dobrar chapas sob medida, garantindo rapidez e precisão.', imageUrl: 'https://picsum.photos/seed/fabricacao/800/600' },
      { title: 'Equipe e Obras', description: 'Nossa equipe em ação e registros de obras concluídas com excelência.', imageUrl: 'https://picsum.photos/seed/equipe/800/600' },
    ]).select();

    if (insertedServices && insertedServices.length === 5) {
      const [s1, s2, s3, s4, s5] = insertedServices;
      const galleryItems: { imageUrl: string; description: string; serviceId: number }[] = [];

      [1, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 36, 58, 59, 60].forEach(n =>
        galleryItems.push({ imageUrl: `https://picsum.photos/seed/${n}/800/600`, description: `Calha Projeto ${n}`, serviceId: s1.id }));
      [2, 3, 4, 5, 6, 7, 8, 56].forEach(n =>
        galleryItems.push({ imageUrl: `https://picsum.photos/seed/${n}/800/600`, description: `Rufo Projeto ${n}`, serviceId: s2.id }));
      [10, 11, 12, 13, 14, 15, 16, 17, 18, 19].forEach(n =>
        galleryItems.push({ imageUrl: `https://picsum.photos/seed/${n}/800/600`, description: `Pingadeira Projeto ${n}`, serviceId: s3.id }));
      [38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53].forEach(n =>
        galleryItems.push({ imageUrl: `https://picsum.photos/seed/${n}/800/600`, description: `Fabricação Própria ${n}`, serviceId: s4.id }));
      [9, 34, 35, 37, 54, 55, 57].forEach(n =>
        galleryItems.push({ imageUrl: `https://picsum.photos/seed/${n}/800/600`, description: `Equipe e Obras ${n}`, serviceId: s5.id }));

      await supabase.from('gallery').insert(galleryItems);
    }
  }

  console.log('✅ Database seeded successfully');
}

// Setup Multer for file uploads
const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (_req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// --- Auth Middleware ---
const authenticate = (req: any, res: any, next: any) => {
  const session = req.cookies.admin_session;
  if (session === 'authenticated') {
    next();
  } else {
    console.warn(`Unauthorized access attempt: ${req.path}`);
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// --- API Routes ---

// Auth
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const { data: users } = await supabase.from('users').select('*').eq('username', username).limit(1);
  const user = users?.[0];

  if (user && bcrypt.compareSync(password, user.password)) {
    res.cookie('admin_session', 'authenticated', {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.post('/api/logout', (_req, res) => {
  res.clearCookie('admin_session');
  res.json({ success: true });
});

app.get('/api/auth/check', (req, res) => {
  const session = req.cookies.admin_session;
  res.json({ authenticated: session === 'authenticated' });
});

app.post('/api/auth/change-password', authenticate, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  await supabase.from('users').update({ password: hashedPassword }).eq('username', 'admin');
  res.json({ success: true });
});

// Settings – Combined admin data endpoint
app.get('/api/admin/data', authenticate, async (_req, res) => {
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

    res.json({
      settings,
      services: servicesRes.data || [],
      posts: postsRes.data || [],
      gallery: galleryRes.data || [],
      testimonials: testimonialsRes.data || [],
    });
  } catch (error) {
    console.error('Error fetching admin data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/settings', async (_req, res) => {
  const { data } = await supabase.from('settings').select('*');
  const settingsObj = (data || []).reduce((acc: any, curr: any) => ({ ...acc, [curr.key]: curr.value }), {});
  res.json(settingsObj);
});

app.post('/api/settings', authenticate, upload.single('logo'), async (req, res) => {
  const settings = req.body;
  const logoUrl = req.file ? `/uploads/${req.file.filename}` : null;

  const upserts = Object.entries(settings).map(([key, value]) => ({ key, value: String(value) }));
  if (logoUrl) upserts.push({ key: 'logoUrl', value: logoUrl });

  await supabase.from('settings').upsert(upserts, { onConflict: 'key' });
  res.json({ success: true, logoUrl });
});

// Services
app.get('/api/services', async (_req, res) => {
  const { data } = await supabase.from('services').select('*');
  res.json(data || []);
});

app.post('/api/services', authenticate, upload.single('image'), async (req, res) => {
  const { title, description } = req.body;
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
  const { data, error } = await supabase.from('services').insert({ title, description, imageUrl }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/services/delete/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const { data: item } = await supabase.from('services').select('imageUrl').eq('id', id).single();
    if (item?.imageUrl?.startsWith('/uploads/')) {
      const filePath = path.join(process.cwd(), item.imageUrl);
      if (fs.existsSync(filePath)) try { fs.unlinkSync(filePath); } catch (_) { }
    }

    await supabase.from('services').delete().eq('id', id);
    res.json({ success: true });
  } catch (error) {
    console.error('Service delete error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/services/:id', authenticate, async (req, res) => {
  await supabase.from('services').delete().eq('id', req.params.id);
  res.json({ success: true });
});

// Posts
app.get('/api/posts', async (_req, res) => {
  const { data } = await supabase.from('posts').select('*').order('createdAt', { ascending: false });
  res.json(data || []);
});

app.post('/api/posts', authenticate, upload.single('image'), async (req, res) => {
  const { title, content } = req.body;
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
  const { data, error } = await supabase.from('posts').insert({ title, content, imageUrl }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/posts/delete/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const { data: item } = await supabase.from('posts').select('imageUrl').eq('id', id).single();
    if (item?.imageUrl?.startsWith('/uploads/')) {
      const filePath = path.join(process.cwd(), item.imageUrl);
      if (fs.existsSync(filePath)) try { fs.unlinkSync(filePath); } catch (_) { }
    }

    await supabase.from('posts').delete().eq('id', id);
    res.json({ success: true });
  } catch (error) {
    console.error('Post delete error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/posts/:id', authenticate, async (req, res) => {
  await supabase.from('posts').delete().eq('id', req.params.id);
  res.json({ success: true });
});

// Gallery
app.get('/api/gallery', async (req, res) => {
  const { serviceId } = req.query;
  let query = supabase.from('gallery').select('*').order('createdAt', { ascending: false });
  if (serviceId) query = query.eq('serviceId', serviceId);
  const { data } = await query;
  res.json(data || []);
});

app.post('/api/gallery', authenticate, upload.array('images'), async (req, res) => {
  const { description, serviceId } = req.body;
  const files = req.files as Express.Multer.File[];

  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'At least one image is required' });
  }

  // serviceId comes as string from FormData - parse to integer for BIGINT column
  const parsedServiceId = serviceId ? parseInt(String(serviceId), 10) : null;

  const items = files.map(file => ({
    imageUrl: `/uploads/${file.filename}`,
    description: description || '',
    serviceId: parsedServiceId,
  }));

  const { data, error } = await supabase.from('gallery').insert(items).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/gallery/delete/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const { data: item } = await supabase.from('gallery').select('imageUrl').eq('id', id).single();
    if (item?.imageUrl?.startsWith('/uploads/')) {
      const filePath = path.join(process.cwd(), item.imageUrl);
      if (fs.existsSync(filePath)) try { fs.unlinkSync(filePath); } catch (_) { }
    }

    const { error } = await supabase.from('gallery').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (error) {
    console.error('Gallery delete error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/gallery/:id', authenticate, async (req, res) => {
  const { data: item } = await supabase.from('gallery').select('imageUrl').eq('id', req.params.id).single();
  if (item?.imageUrl?.startsWith('/uploads/')) {
    const filePath = path.join(process.cwd(), item.imageUrl);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  await supabase.from('gallery').delete().eq('id', req.params.id);
  res.json({ success: true });
});

app.post('/api/gallery/bulk-delete', authenticate, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'IDs array is required' });
    }

    const numericIds = ids.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id));

    // Delete physical files
    const { data: items } = await supabase.from('gallery').select('imageUrl').in('id', numericIds);
    for (const item of items || []) {
      if (item.imageUrl?.startsWith('/uploads/')) {
        const filePath = path.join(process.cwd(), item.imageUrl);
        if (fs.existsSync(filePath)) try { fs.unlinkSync(filePath); } catch (_) { }
      }
    }

    await supabase.from('gallery').delete().in('id', numericIds);
    res.json({ success: true });
  } catch (error) {
    console.error('Error in bulk delete:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Testimonials
app.get('/api/testimonials', async (_req, res) => {
  const { data } = await supabase.from('testimonials').select('*').order('createdAt', { ascending: false });
  res.json(data || []);
});

app.post('/api/testimonials', authenticate, async (req, res) => {
  const { author, content, rating } = req.body;
  const { data, error } = await supabase.from('testimonials').insert({ author, content, rating: rating || 5 }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/testimonials/delete/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    await supabase.from('testimonials').delete().eq('id', id);
    res.json({ success: true });
  } catch (error) {
    console.error('Testimonial delete error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/testimonials/:id', authenticate, async (req, res) => {
  await supabase.from('testimonials').delete().eq('id', req.params.id);
  res.json({ success: true });
});

// --- Vite Middleware ---
async function startServer() {
  // Seed data on startup
  await seedDatabase();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  startServer();
}

export default app;
