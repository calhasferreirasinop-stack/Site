import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();


const app = express();
const PORT = 3000;



app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.url}`);
  next();
});


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

// --- Seed (Disabled in V2 - Handled by Migration 005) ---
async function seedDatabase() {
  console.log('ℹ️ Seed skip (Handled by Migration 005 and Auth Triggers)');
}


// Multer
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname)),
});
const upload = multer({ storage });
// --- Security Helpers ---
const rateLimitMap = new Map<string, { count: number, reset: number }>();
const checkRateLimit = (ip: string, limit = 50, windowMs = 60000) => {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, reset: now + windowMs };
  if (now > entry.reset) {
    entry.count = 1;
    entry.reset = now + windowMs;
  } else {
    entry.count++;
  }
  rateLimitMap.set(ip, entry);
  return entry.count <= limit;
};

const sanitize = (data: any) => {
  if (!data) return data;
  const sensitiveKeys = ['password', 'token', 'session', 'cookie', 'secret', 'key'];
  const sanitized = { ...data };
  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object') {
      sanitized[sanitized] = sanitize(sanitized[key]);
    }
  }
  return sanitized;
};

// --- Auth Middleware (SaaS V2) ---
interface AuthUser {
  id: string;      // supabase auth.uid()
  companyId: string;
  role: string;
  name?: string;
  username?: string;
}


const parseSession = async (req: any): Promise<AuthUser | null> => {
  const session = req.cookies.session;
  if (!session) return null;

  try {
    const decoded = Buffer.from(session, 'base64').toString('utf8');
    let userId;
    try {
      const parsed = JSON.parse(decoded);
      userId = parsed.userId;
    } catch (e) {
      console.warn(`[AUTH_WARN] Malformed session cookie from IP: ${req.ip}`);
      return null;
    }

    if (!userId) return null;

    // SaaS V2: Fetch profile and company association
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, company_id, role, name')
      .eq('id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        console.error(`[AUTH_ERROR] User: ${userId} | Reason: Profile missing in database`);
      } else {
        console.error(`[AUTH_ERROR] User: ${userId} | Reason: Database error | Details: ${error.message}`);
      }
      return null;
    }

    if (!profile || !profile.company_id) {
      console.error(`[AUTH_ERROR] User: ${userId} | Reason: Company association missing`);
      return null;
    }

    // Success log (sanitized implicitly by not logging req.headers/cookies)
    console.log(`[AUTH_SUCCESS] User: ${userId} | Company: ${profile.company_id} | Role: ${profile.role}`);

    return {
      id: profile.id,
      companyId: profile.company_id,
      role: profile.role,
      name: profile.name,
      username: profile.name
    } as AuthUser;

  } catch (err) {
    console.error('[AUTH_EXCEPTION] Unexpected failure in parseSession:', err);
    return null;
  }
};

const authenticate = async (req: any, res: any, next: any) => {
  const user = await parseSession(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida ou perfil não encontrado' });
  req.user = user;
  next();
};

const requireAdmin = async (req: any, res: any, next: any) => {
  const user = await parseSession(req);
  if (!user) return res.status(401).json({ error: 'Não autorizado' });
  if (user.role !== 'admin' && user.role !== 'master') return res.status(403).json({ error: 'Acesso negado' });
  req.user = user;
  next();
};

const requireMaster = async (req: any, res: any, next: any) => {
  const user = await parseSession(req);
  if (!user) return res.status(401).json({ error: 'Não autorizado' });
  if (user.role !== 'master') return res.status(403).json({ error: 'Acesso Master necessário' });
  req.user = user;
  next();
};

// =====================
// AUTH Routes
// =====================
app.post('/api/login', async (req, res) => {
  if (!checkRateLimit(req.ip, 10)) {
    console.warn(`[SECURITY] Login rate limit exceeded for IP: ${req.ip}`);
    return res.status(429).json({ error: 'Muitas tentativas. Tente novamente em 1 minuto.' });
  }

  const { username, password } = req.body;
  console.log(`[AUTH_LOGIN_ATTEMPT] User: ${username} | IP: ${req.ip}`);
  // Para manter compatibilidade com o frontend atual, buscamos o profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, name, company_id')
    .eq('name', username) // Nome usado como login temporário
    .single();

  if (profile) {

    // Simulamos a sessão com o ID do perfil (auth.uid)
    const sessionData = Buffer.from(JSON.stringify({ userId: profile.id })).toString('base64');
    res.cookie('session', sessionData, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });
    res.json({ success: true, role: profile.role, name: profile.name, companyId: profile.company_id });
  } else {
    res.status(401).json({ error: 'Usuário não encontrado' });
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
// CLIENTS Routes (SaaS V2 Map: /api/clients -> clients table)
// =====================
app.get('/api/clients', authenticate, async (req: any, res) => {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('company_id', req.user.companyId)
    .order('name', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.post('/api/clients', authenticate, async (req: any, res) => {
  const { name, email, phone, document, address } = req.body;
  const { data, error } = await supabase.from('clients').insert({
    company_id: req.user.companyId,
    name, email, phone, document, address
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put('/api/clients/:id', authenticate, async (req: any, res) => {
  const { name, email, phone, document, address } = req.body;
  const { data, error } = await supabase.from('clients')
    .update({ name, email, phone, document, address, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('company_id', req.user.companyId)
    .select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/clients/:id', authenticate, async (req: any, res) => {
  await supabase.from('clients').delete().eq('id', req.params.id).eq('company_id', req.user.companyId);
  res.json({ success: true });
});


// =====================
// HARNESS ALIASES (Compatibility for Test Harness UI)
// =====================
// Redirects to map the Harness names to existing logic
app.get('/api/products', requireAdmin, (req, res) => res.redirect(307, '/api/inventory'));
app.post('/api/products', requireAdmin, (req, res) => res.redirect(307, '/api/inventory'));

app.get('/api/estimates', authenticate, (req, res) => res.redirect(307, '/api/quotes'));
app.post('/api/estimates', authenticate, (req, res) => res.redirect(307, '/api/quotes'));

app.get('/api/payments', requireAdmin, (req, res) => res.redirect(307, '/api/financial'));
// Manual payment registration handled via existing /api/quotes/:id/status or specific financial flows

// =====================
// PROFILES Routes (SaaS V2: Scoped to Company)
// =====================
app.get('/api/users', requireAdmin, async (req: any, res) => {
  const { data, error } = await supabase.from('profiles')
    .select('*')
    .eq('company_id', req.user.companyId)
    .order('createdAt', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.post('/api/users', requireAdmin, async (req: any, res) => {
  if (!checkRateLimit(req.ip, 20)) return res.status(429).json({ error: 'Rate limit exceeded' });

  const { email, password, name, role, phone } = req.body;

  // Security: Only master can assign master role
  if (role === 'master' && req.user.role !== 'master') {
    return res.status(403).json({ error: 'Apenas master pode criar outros masters' });
  }

  // Security: Derived company_id (ignore any sent from frontend)
  const companyId = req.user.companyId;

  try {
    // 1. Create User in Supabase Auth (Onboarding trigger handles profile/company creation)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name,
        company_id: companyId, // Passed to trigger if needed, though usually companies are associated differently
        role: role || 'user'
      }
    });

    if (authError) {
      console.error(`[USER_CREATE_ERROR] Auth failure: ${authError.message}`);
      return res.status(400).json({ error: authError.message });
    }

    const newUser = authData.user!;

    // 2. The profile should be created by the SQL trigger 'on_auth_user_created'
    // We update it with optional fields (phone, name) to ensure consistency
    // Note: We don't manually insert to profiles to avoid double creation/constraint errors
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .update({
        name: name || email,
        phone: phone || null,
        role: role || 'user'
      })
      .eq('id', newUser.id)
      .select()
      .single();

    if (profileError) {
      console.error(`[USER_CREATE_ERROR] Profile sync failure: ${profileError.message}`);
      // Not failing the whole request as the user IS created, but logging it
    }

    res.json(profile || { id: newUser.id, email: newUser.email });

  } catch (err) {
    console.error('[USER_CREATE_EXCEPTION]', err);
    res.status(500).json({ error: 'Erro interno ao criar usuário' });
  }
});

app.delete('/api/users/:id', requireMaster, async (req: any, res) => {
  const id = req.params.id;
  if (id === req.user.id) return res.status(400).json({ error: 'Não pode excluir a si mesmo' });

  await supabase.from('profiles').delete().eq('id', id).eq('company_id', req.user.companyId);
  res.json({ success: true });
});


// =====================
// SETTINGS Routes (SaaS V2: Scoped to Company)
// =====================
// =====================
// SETTINGS Routes (SaaS V2)
// =====================
app.get('/api/settings', async (req: any, res) => {
  console.log('[DEBUG] Request to /api/settings hit');
  // Publicly accessible - tries to find company from session, otherwise uses first company

  let companyId: string | null = null;
  const user = await parseSession(req);
  if (user) {
    companyId = user.companyId;
  } else {
    // Default to the first company in the system for public visitors
    const { data: firstCompany } = await supabase.from('companies').select('id').limit(1).single();
    if (firstCompany) companyId = firstCompany.id;
  }

  if (!companyId) return res.json({}); // Return empty object if no company exists yet

  const { data: company, error } = await supabase
    .from('companies')
    .select('settings')
    .eq('id', companyId)
    .single();

  if (error || !company) return res.json({});
  res.json(company.settings || {});
});


app.post('/api/settings', requireMaster, upload.fields([{ name: 'logo' }, { name: 'heroImage' }, { name: 'pixQrCode' }]), async (req: any, res) => {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };
  const newSettings = req.body;

  const { data: company } = await supabase
    .from('companies')
    .select('settings')
    .eq('id', req.user.companyId)
    .single();

  const currentSettings = company?.settings || {};
  const updatedSettings = { ...currentSettings, ...newSettings };

  if (files?.logo?.[0]) updatedSettings.logoUrl = `/uploads/${files.logo[0].filename}`;
  if (files?.heroImage?.[0]) updatedSettings.heroImageUrl = `/uploads/${files.heroImage[0].filename}`;
  if (files?.pixQrCode?.[0]) updatedSettings.pixQrCodeUrl = `/uploads/${files.pixQrCode[0].filename}`;

  await supabase.from('companies').update({ settings: updatedSettings }).eq('id', req.user.companyId);
  res.json({ success: true });
});

// =====================
// ADMIN DATA Route
// =====================
app.get('/api/admin/data', requireAdmin, async (req: any, res) => {
  try {
    const [companyRes, servicesRes, postsRes, galleryRes, testimonialsRes, estimatesRes, productsRes] = await Promise.all([
      supabase.from('companies').select('settings').eq('id', req.user.companyId).single(),
      supabase.from('services').select('*').eq('company_id', req.user.companyId),
      supabase.from('posts').select('*').eq('company_id', req.user.companyId).order('createdAt', { ascending: false }),
      supabase.from('gallery').select('*').eq('company_id', req.user.companyId).order('createdAt', { ascending: false }),
      supabase.from('testimonials').select('*').eq('company_id', req.user.companyId).order('createdAt', { ascending: false }),
      supabase.from('estimates').select('*').eq('company_id', req.user.companyId).order('createdAt', { ascending: false }),
      supabase.from('products').select('*').eq('company_id', req.user.companyId).order('name', { ascending: true }),
    ]);

    let profilesRes: any = null;
    if (req.user.role === 'master' || req.user.role === 'admin') {
      profilesRes = await supabase.from('profiles').select('*').eq('company_id', req.user.companyId).order('createdAt', { ascending: false });
    }

    res.json({
      settings: companyRes.data?.settings || {},
      services: servicesRes.data || [],
      posts: postsRes.data || [],
      gallery: galleryRes.data || [],
      testimonials: testimonialsRes.data || [],
      quotes: estimatesRes.data || [], // Map to existing frontend naming
      inventory: productsRes.data || [], // Map to existing frontend naming
      users: profilesRes?.data || [], // Map to existing frontend naming
      currentUser: req.user,
    });
  } catch (error) {
    console.error('Error fetching admin data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// =====================
// SERVICES Routes (Multi-tenant)
// =====================
app.get('/api/services', async (req: any, res) => {
  let companyId: string | null = null;
  const user = await parseSession(req);
  if (user) companyId = user.companyId;
  else {
    const { data: firstCompany } = await supabase.from('companies').select('id').limit(1).single();
    if (firstCompany) companyId = firstCompany.id;
  }

  if (!companyId) return res.json([]);

  const { data } = await supabase.from('services').select('*').eq('company_id', companyId);
  res.json(data || []);
});


app.post('/api/services', requireAdmin, upload.single('image'), async (req: any, res) => {
  const { title, description } = req.body;
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
  const { data, error } = await supabase.from('services').insert({
    title, description, imageUrl, company_id: req.user.companyId
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/services/delete/:id', requireAdmin, async (req: any, res) => {
  const id = parseInt(req.params.id);
  const { data: item } = await supabase.from('services').select('imageUrl')
    .eq('id', id).eq('company_id', req.user.companyId).single();
  if (item?.imageUrl?.startsWith('/uploads/')) {
    const fp = path.join(process.cwd(), item.imageUrl);
    if (fs.existsSync(fp)) try { fs.unlinkSync(fp); } catch (_) { }
  }
  await supabase.from('services').delete().eq('id', id).eq('company_id', req.user.companyId);
  res.json({ success: true });
});

app.post('/api/services/:id/home-image', requireAdmin, upload.single('homeImage'), async (req: any, res) => {
  const id = parseInt(req.params.id);
  const homeImageUrl = `/uploads/${req.file!.filename}`;
  await supabase.from('services').update({ homeImageUrl })
    .eq('id', id).eq('company_id', req.user.companyId);
  res.json({ success: true, homeImageUrl });
});

// =====================
// POSTS Routes (Multi-tenant)
// =====================
app.get('/api/posts', async (req: any, res) => {
  let companyId: string | null = null;
  const user = await parseSession(req);
  if (user) companyId = user.companyId;
  else {
    const { data: firstCompany } = await supabase.from('companies').select('id').limit(1).single();
    if (firstCompany) companyId = firstCompany.id;
  }

  if (!companyId) return res.json([]);

  const { data } = await supabase.from('posts').select('*').eq('company_id', companyId).order('createdAt', { ascending: false });
  res.json(data || []);
});


app.post('/api/posts', requireAdmin, upload.single('image'), async (req: any, res) => {
  const { title, content } = req.body;
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
  const { data, error } = await supabase.from('posts').insert({
    title, content, imageUrl, company_id: req.user.companyId
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/posts/delete/:id', requireAdmin, async (req: any, res) => {
  const id = parseInt(req.params.id);
  const { data: item } = await supabase.from('posts').select('imageUrl')
    .eq('id', id).eq('company_id', req.user.companyId).single();
  if (item?.imageUrl?.startsWith('/uploads/')) {
    const fp = path.join(process.cwd(), item.imageUrl);
    if (fs.existsSync(fp)) try { fs.unlinkSync(fp); } catch (_) { }
  }
  await supabase.from('posts').delete().eq('id', id).eq('company_id', req.user.companyId);
  res.json({ success: true });
});

// =====================
// GALLERY Routes (Multi-tenant)
// =====================
app.get('/api/gallery', async (req: any, res) => {
  let companyId: string | null = null;
  const user = await parseSession(req);
  if (user) companyId = user.companyId;
  else {
    const { data: firstCompany } = await supabase.from('companies').select('id').limit(1).single();
    if (firstCompany) companyId = firstCompany.id;
  }

  if (!companyId) return res.json([]);

  const { serviceId } = req.query;
  let query = supabase.from('gallery').select('*')
    .eq('company_id', companyId)
    .order('createdAt', { ascending: false });

  if (serviceId) query = query.eq('serviceId', serviceId);
  const { data } = await query;
  res.json(data || []);
});


app.post('/api/gallery', requireAdmin, upload.array('images'), async (req: any, res) => {
  const { description, serviceId } = req.body;
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) return res.status(400).json({ error: 'Pelo menos uma imagem é necessária' });

  const parsedServiceId = serviceId ? parseInt(String(serviceId), 10) : null;
  const items = files.map(file => ({
    imageUrl: `/uploads/${file.filename}`,
    description: description || '',
    serviceId: parsedServiceId,
    company_id: req.user.companyId
  }));

  const { data, error } = await supabase.from('gallery').insert(items).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/gallery/delete/:id', requireAdmin, async (req: any, res) => {
  const id = parseInt(req.params.id);
  const { data: item } = await supabase.from('gallery').select('imageUrl')
    .eq('id', id).eq('company_id', req.user.companyId).single();

  if (item?.imageUrl?.startsWith('/uploads/')) {
    const fp = path.join(process.cwd(), item.imageUrl);
    if (fs.existsSync(fp)) try { fs.unlinkSync(fp); } catch (_) { }
  }
  await supabase.from('gallery').delete().eq('id', id).eq('company_id', req.user.companyId);
  res.json({ success: true });
});

app.post('/api/gallery/bulk-delete', requireAdmin, async (req: any, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'IDs obrigatórios' });
  const numericIds = ids.map((id: any) => parseInt(id)).filter(id => !isNaN(id));

  const { data: items } = await supabase.from('gallery').select('imageUrl')
    .in('id', numericIds).eq('company_id', req.user.companyId);

  for (const item of items || []) {
    if (item.imageUrl?.startsWith('/uploads/')) {
      const fp = path.join(process.cwd(), item.imageUrl);
      if (fs.existsSync(fp)) try { fs.unlinkSync(fp); } catch (_) { }
    }
  }
  await supabase.from('gallery').delete().in('id', numericIds).eq('company_id', req.user.companyId);
  res.json({ success: true });
});

// =====================
// TESTIMONIALS Routes (Multi-tenant)
// =====================
app.get('/api/testimonials', async (req: any, res) => {
  let companyId: string | null = null;
  const user = await parseSession(req);
  if (user) companyId = user.companyId;
  else {
    const { data: firstCompany } = await supabase.from('companies').select('id').limit(1).single();
    if (firstCompany) companyId = firstCompany.id;
  }

  if (!companyId) return res.json([]);

  const { data } = await supabase.from('testimonials').select('*')
    .eq('company_id', companyId)
    .order('createdAt', { ascending: false });
  res.json(data || []);
});


app.post('/api/testimonials', requireAdmin, async (req: any, res) => {
  const { author, content, rating } = req.body;
  const { data, error } = await supabase.from('testimonials').insert({
    author, content, rating: rating || 5, company_id: req.user.companyId
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/testimonials/delete/:id', requireAdmin, async (req: any, res) => {
  const id = parseInt(req.params.id);
  await supabase.from('testimonials').delete().eq('id', id).eq('company_id', req.user.companyId);
  res.json({ success: true });
});


// =====================
// QUOTES Routes (SaaS V2 Map: /api/quotes -> estimates table)
// =====================
app.get('/api/quotes/pending-count', requireAdmin, async (req: any, res) => {
  const { count } = await supabase.from('estimates')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', req.user.companyId)
    .eq('status', 'pending');
  res.json({ count: count || 0 });
});

app.get('/api/quotes', authenticate, async (req: any, res) => {
  let query = supabase.from('estimates').select('*')
    .eq('company_id', req.user.companyId)
    .order('createdAt', { ascending: false });

  // Regular users only see their own
  if (req.user.role === 'user') query = query.eq('client_id', req.user.id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.post('/api/quotes', authenticate, async (req: any, res) => {
  const { clientName, bends, notes, totalValue: passedTotalValue, adminCreated, clientId } = req.body;

  let totalM2 = 0;
  if (bends && Array.isArray(bends)) {
    for (const bend of bends) totalM2 += parseFloat(bend.m2 || 0);
  }

  // Fetch settings from company
  const { data: company } = await supabase.from('companies').select('settings').eq('id', req.user.companyId).single();
  const settings = company?.settings || {};
  const pricePerM2 = parseFloat(settings.pricePerM2 || '50');

  const totalValue = adminCreated && passedTotalValue ? parseFloat(passedTotalValue) : totalM2 * pricePerM2;

  const { data: estimate, error: eError } = await supabase.from('estimates').insert({
    company_id: req.user.companyId,
    client_id: clientId || null, // V2 uses client_id relation
    total_amount: totalValue,
    final_amount: totalValue,
    notes,
    status: 'pending',
    metadata: { clientName, bends } // Store original context in JSONB
  }).select().single();

  if (eError) return res.status(500).json({ error: eError.message });

  // Insert items (legacy bends)
  if (bends && Array.isArray(bends) && bends.length > 0) {
    const itemRows = bends.map((b: any) => ({
      estimate_id: estimate.id,
      company_id: req.user.companyId,
      description: `Dobra width=${b.totalWidthCm}`,
      quantity: 1,
      unit_price: pricePerM2,
      total_price: b.m2 * pricePerM2,
      metadata: b
    }));
    await supabase.from('estimate_items').insert(itemRows);
  }

  res.json(estimate);
});

app.get('/api/quotes/:id', authenticate, async (req: any, res) => {
  const id = parseInt(req.params.id);
  const { data: estimate, error } = await supabase.from('estimates')
    .select('*, items:estimate_items(*)')
    .eq('id', id)
    .eq('company_id', req.user.companyId)
    .single();

  if (error || !estimate) return res.status(404).json({ error: 'Orçamento não encontrado' });
  if (req.user.role === 'user' && estimate.client_id !== req.user.id) return res.status(403).json({ error: 'Acesso negado' });

  // Map to legacy format for frontend
  res.json({
    ...estimate,
    totalValue: estimate.total_amount,
    finalValue: estimate.final_amount,
    bends: estimate.items.map((i: any) => i.metadata)
  });
});

app.put('/api/quotes/:id/status', requireAdmin, async (req: any, res) => {
  const id = parseInt(req.params.id);
  const { status } = req.body;

  const { data: estimate, error } = await supabase.from('estimates')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', req.user.companyId)
    .select().single();

  if (error) return res.status(500).json({ error: error.message });

  // Create payment record on 'paid'
  if (status === 'paid' && estimate) {
    await supabase.from('payments').insert({
      company_id: req.user.companyId,
      estimate_id: id,
      amount: estimate.final_amount,
      payment_method: 'pix',
      status: 'confirmed',
      confirmed_by: req.user.id,
      confirmed_at: new Date().toISOString()
    });
  }

  res.json(estimate);
});


async function debitInventory(estimateId: number, m2Needed: number, userId: string, companyId: string) {
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('company_id', companyId)
    .gt('stock_quantity', 0)
    .order('created_at', { ascending: true });

  let remaining = m2Needed;
  for (const prod of products || []) {
    if (remaining <= 0) break;
    const debit = Math.min(remaining, prod.stock_quantity);
    await supabase.from('products').update({ stock_quantity: prod.stock_quantity - debit }).eq('id', prod.id);

    // Log consumption
    await supabase.from('activity_logs').insert({
      company_id: companyId,
      user_id: userId,
      action: 'inventory_consumption',
      entity_type: 'product',
      entity_id: prod.id,
      metadata: { estimateId, amount: debit }
    });
    remaining -= debit;
  }
}

app.post('/api/quotes/:id/discount', requireMaster, async (req: any, res) => {
  const id = parseInt(req.params.id);
  const { discountValue, reason } = req.body;

  const { data: quote } = await supabase.from('estimates').select('*').eq('id', id).eq('company_id', req.user.companyId).single();
  if (!quote) return res.status(404).json({ error: 'Orçamento não encontrado' });

  const finalValue = Math.max(0, (quote.total_amount || 0) - (discountValue || 0));

  await supabase.from('estimates').update({
    final_amount: finalValue,
    updated_at: new Date().toISOString()
  }).eq('id', id).eq('company_id', req.user.companyId);

  res.json({ success: true, finalValue });
});

app.post('/api/quotes/:id/proof', authenticate, upload.single('proof'), async (req: any, res) => {
  const id = parseInt(req.params.id);
  const { data: estimate } = await supabase.from('estimates').select('client_id').eq('id', id).eq('company_id', req.user.companyId).single();
  if (!estimate) return res.status(404).json({ error: 'Orçamento não encontrado' });
  if (req.user.role === 'user' && estimate.client_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  if (!req.file) return res.status(400).json({ error: 'Arquivo obrigatório' });

  const pixProofUrl = `/uploads/${req.file.filename}`;
  await supabase.from('estimates').update({
    metadata: { pixProofUrl },
    updated_at: new Date().toISOString()
  }).eq('id', id).eq('company_id', req.user.companyId);
  res.json({ success: true, pixProofUrl });
});


// =====================
// INVENTORY Routes (SaaS V2 Map: /api/inventory -> products table)
// =====================
app.get('/api/inventory', requireAdmin, async (req: any, res) => {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('company_id', req.user.companyId)
    .order('name', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.post('/api/inventory', requireAdmin, async (req: any, res) => {
  const { description, widthM, lengthM, costPerUnit, notes, lowStockThresholdM2, name } = req.body;
  const wM = parseFloat(widthM) || 1.20;
  const lM = parseFloat(lengthM) || 33;
  const totalM2 = wM * lM;

  const { data, error } = await supabase.from('products').insert({
    company_id: req.user.companyId,
    name: name || description,
    description,
    sku: `SKU-${Date.now()}`,
    stock_quantity: totalM2,
    unit: 'm2',
    price: parseFloat(costPerUnit) || 0,
    min_stock_level: parseFloat(lowStockThresholdM2) || 5
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/inventory/:id', requireAdmin, async (req: any, res) => {
  await supabase.from('products').delete().eq('id', req.params.id).eq('company_id', req.user.companyId);
  res.json({ success: true });
});

app.get('/api/inventory/summary', requireAdmin, async (req: any, res) => {
  const { data: company } = await supabase.from('companies').select('settings').eq('id', req.user.companyId).single();
  const threshold = parseFloat(company?.settings?.lowStockAlertM2 || '10');

  const { data: products } = await supabase.from('products').select('stock_quantity').eq('company_id', req.user.companyId);
  const totalAvailable = (products || []).reduce((sum, p) => sum + parseFloat(p.stock_quantity || 0), 0);

  res.json({ totalAvailableM2: totalAvailable, lowStock: totalAvailable < threshold, threshold });
});


// =====================
// =====================
// FINANCIAL Routes (SaaS V2 Map: /api/financial -> payments table)
// =====================
app.get('/api/financial', requireAdmin, async (req: any, res) => {
  const { from, to } = req.query;
  let query = supabase.from('payments').select('*, estimate:estimates(metadata)')
    .eq('company_id', req.user.companyId)
    .order('confirmed_at', { ascending: false });

  if (from) query = query.gte('confirmed_at', from as string);
  if (to) query = query.lte('confirmed_at', to as string);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  // Map to legacy format
  const mapped = (data || []).map(p => ({
    id: p.id,
    clientName: p.estimate?.metadata?.clientName || 'Cliente',
    netValue: p.amount,
    paymentMethod: p.payment_method,
    paidAt: p.confirmed_at
  }));
  res.json(mapped);
});

app.get('/api/financial/summary', requireAdmin, async (req: any, res) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { data: payments } = await supabase.from('payments')
    .select('amount, confirmed_at')
    .eq('company_id', req.user.companyId)
    .eq('status', 'confirmed');

  const totalAll = (payments || []).reduce((acc, p) => acc + parseFloat(p.amount), 0);
  const totalMonth = (payments || []).filter(p => p.confirmed_at >= monthStart).reduce((acc, p) => acc + parseFloat(p.amount), 0);

  res.json({
    totalAll,
    totalToday: 0, // Simplified for now
    totalMonth,
    countAll: payments?.length || 0,
    ticketAverage: (payments?.length || 0) > 0 ? totalAll / (payments?.length || 1) : 0
  });
});


// =====================
// Vite + Server Start
// =====================
async function startServer() {
  // Legacy seeding disabled in V2
  // await seedDatabase();


  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

  }

  app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server on http://localhost:${PORT}`));
}

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  startServer();
}

export default app;
