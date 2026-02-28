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
  const legacyAdminSession = req.cookies.admin_session;

  console.log(`[AUTH_DEBUG] Cookies: session=${!!session}, legacy=${legacyAdminSession}`);

  if (!session && legacyAdminSession !== 'authenticated') {
    console.log(`[AUTH_DEBUG] No session and legacy is not 'authenticated'`);
    return null;
  }

  try {
    let userId: string | null = null;

    if (session) {
      const decoded = Buffer.from(session, 'base64').toString('utf8');
      try {
        const parsed = JSON.parse(decoded);
        userId = parsed.userId;
        console.log(`[AUTH_DEBUG] Derived userId from session: ${userId}`);
      } catch (e) {
        console.warn(`[AUTH_DEBUG] Malformed session cookie`);
      }
    }

    // Fallback for legacy admin session
    if (!userId && legacyAdminSession === 'authenticated') {
      console.log(`[AUTH_DEBUG] Using legacy fallback`);
      const { data: adminProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'master')
        .limit(1)
        .single();
      if (adminProfile) {
        userId = adminProfile.id;
        console.log(`[AUTH_DEBUG] Derived userId from legacy fallback: ${userId}`);
      } else {
        console.log(`[AUTH_DEBUG] Legacy fallback failed: No master profile found`);
      }
    }

    if (!userId) {
      console.log(`[AUTH_DEBUG] No userId found after session and legacy checks`);
      return null;
    }

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
  if (!username || !password) return res.status(400).json({ error: 'Usuário e senha obrigatórios' });

  console.log(`[AUTH_LOGIN_ATTEMPT] User: ${username} | IP: ${req.ip}`);

  // Use a simulated email for Supabase Auth if it's a simple username
  const email = username.includes('@') ? username : `${username}@ferreiracalhas.com`;

  try {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      // Secure Fallback for users not yet in Supabase Auth but in profiles table
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', username)
        .single();

      if (profile && profile.password && bcrypt.compareSync(password, profile.password)) {
        const sessionData = Buffer.from(JSON.stringify({ userId: profile.id })).toString('base64');
        res.cookie('session', sessionData, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 30 * 24 * 60 * 60 * 1000 });
        return res.json({ success: true, role: profile.role, name: profile.name, companyId: profile.company_id, id: profile.id });
      }

      console.warn(`[AUTH_FAILED] User: ${username} | Reason: ${authError.message}`);
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    const userId = authData.user.id;
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role, name, company_id')
      .eq('id', userId)
      .single();

    if (!profile) return res.status(401).json({ error: 'Perfil não encontrado no sistema' });

    const sessionData = Buffer.from(JSON.stringify({ userId: profile.id })).toString('base64');
    res.cookie('session', sessionData, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });
    res.json({ success: true, role: profile.role, name: profile.name, companyId: profile.company_id, id: profile.id });

  } catch (err) {
    console.error('[AUTH_EXCEPTION]', err);
    res.status(500).json({ error: 'Erro interno ao realizar login' });
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
// USERS Routes (Multi-tenant)
// =====================
app.get('/api/users', requireAdmin, async (req: any, res) => {
  const { data, error } = await supabase.from('profiles').select('id,username,name,email,phone,role,active,created_at')
    .eq('company_id', req.user.companyId)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.post('/api/users', requireAdmin, async (req: any, res) => {
  const { username, password, name, email, phone, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username e senha obrigatórios' });
  if ((role === 'admin' || role === 'master') && req.user.role !== 'master')
    return res.status(403).json({ error: 'Apenas master pode criar admins' });

  const { data, error } = await supabase.from('profiles').insert({
    username,
    password: bcrypt.hashSync(password, 10),
    name, email, phone, role: role || 'user', active: true, company_id: req.user.companyId
  }).select('id,username,name,email,phone,role,active').single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put('/api/users/:id', requireAdmin, async (req: any, res) => {
  const id = req.params.id;
  const { name, email, phone, active, role, password } = req.body;
  const updateData: any = { name, email, phone, active };
  if (role !== undefined && req.user.role === 'master') updateData.role = role;
  if (password) updateData.password = bcrypt.hashSync(password, 10);
  const { data, error } = await supabase.from('profiles').update(updateData)
    .eq('id', id).eq('company_id', req.user.companyId).select('id,username,name,email,phone,role,active').single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/users/:id', requireAdmin, async (req: any, res) => {
  const id = req.params.id;
  if (id === req.user.id) return res.status(400).json({ error: 'Não pode excluir a si mesmo' });
  await supabase.from('profiles').delete().eq('id', id).eq('company_id', req.user.companyId);
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

  // Backend Validation
  if (!name || name.trim().length === 0) return res.status(400).json({ error: 'Nome é obrigatório' });
  if (email && !email.includes('@')) return res.status(400).json({ error: 'E-mail inválido' });
  if (phone && phone.replace(/\D/g, '').length < 10) return res.status(400).json({ error: 'Telefone inválido (mínimo 10 dígitos)' });

  const { data, error } = await supabase.from('clients').insert({
    company_id: req.user.companyId,
    name, email, phone, document, address
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put('/api/clients/:id', authenticate, async (req: any, res) => {
  const { name, email, phone, document, address } = req.body;

  // Backend Validation
  if (!name || name.trim().length === 0) return res.status(400).json({ error: 'Nome é obrigatório' });
  if (email && !email.includes('@')) return res.status(400).json({ error: 'E-mail inválido' });
  if (phone && phone.replace(/\D/g, '').length < 10) return res.status(400).json({ error: 'Telefone inválido (mínimo 10 dígitos)' });

  const { data, error } = await supabase.from('clients')
    .update({ name, email, phone, document, address })
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

// Raw POST for Test Harness Compatibility
app.post('/api/payments', requireAdmin, async (req: any, res) => {
  const { amount, status, payment_method } = req.body;
  if (!amount || isNaN(parseFloat(amount))) return res.status(400).json({ error: 'Valor inválido' });

  const { data, error } = await supabase.from('payments').insert({
    company_id: req.user.companyId,
    amount: parseFloat(amount),
    payment_method: payment_method || 'teste',
    status: status || 'confirmed',
    confirmed_by: req.user.id,
    confirmed_at: new Date().toISOString()
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// =====================
// PROFILES Routes (SaaS V2: Scoped to Company)
// =====================
app.get('/api/users', requireAdmin, async (req: any, res) => {
  const { data, error } = await supabase.from('profiles')
    .select('*')
    .eq('company_id', req.user.companyId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.post('/api/users', requireAdmin, async (req: any, res) => {
  if (!checkRateLimit(req.ip, 10)) return res.status(429).json({ error: 'Muitas tentativas. Tente novamente em 1 minuto.' });

  const { username, password, name, role, phone } = req.body;
  const email = username?.includes('@') ? username : `${username}@ferreiracalhas.com`;

  // Security: Only master can assign master role
  if (role === 'master' && req.user.role !== 'master') {
    return res.status(403).json({ error: 'Apenas master pode criar outros masters' });
  }

  const companyId = req.user.companyId;

  try {
    // 1. Create User in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, company_id: companyId, role: role || 'user' }
    });

    if (authError) {
      console.error(`[USER_CREATE_ERROR] Auth failure: ${authError.message}`);
      return res.status(400).json({ error: authError.message });
    }

    const newUser = authData.user!;

    // 2. Use UPSERT to handle both new profiles and existing ones (if trigger already fired)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: newUser.id,
        name: name || username,
        role: role || 'user',
        company_id: companyId,
        phone: phone || ''
      })
      .select()
      .single();

    if (profileError) {
      console.error(`[USER_CREATE_ERROR] Profile sync failure: ${profileError.message}`);
      return res.status(500).json({ error: 'Erro ao sincronizar perfil do usuário' });
    }

    res.json(profile);

  } catch (err) {
    console.error('[USER_CREATE_EXCEPTION]', err);
    res.status(500).json({ error: 'Erro interno ao criar usuário' });
  }
});

app.put('/api/users/:id', requireAdmin, async (req: any, res) => {
  const id = req.params.id;
  const { name, role, password } = req.body;

  // Security: Only master can assign master role
  if (role === 'master' && req.user.role !== 'master') {
    return res.status(403).json({ error: 'Apenas master pode alterar para master' });
  }

  // Se houver troca de senha através do painel admin
  if (password && password.length >= 6) {
    const { error: authError } = await supabase.auth.admin.updateUserById(id, { password });
    if (authError) return res.status(400).json({ error: authError.message });
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({ name, role })
    .eq('id', id)
    .eq('company_id', req.user.companyId)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
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


app.post('/api/settings', requireAdmin, upload.fields([{ name: 'logo' }, { name: 'heroImage' }, { name: 'pixQrCode' }]), async (req: any, res) => {
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
      supabase.from('posts').select('*').eq('company_id', req.user.companyId).order('created_at', { ascending: false }),
      supabase.from('gallery').select('*').eq('company_id', req.user.companyId).order('created_at', { ascending: false }),
      supabase.from('testimonials').select('*').eq('company_id', req.user.companyId).order('created_at', { ascending: false }),
      supabase.from('estimates').select('*, profiles(name)').eq('company_id', req.user.companyId).order('created_at', { ascending: false }),
      supabase.from('products').select('*').eq('company_id', req.user.companyId).order('name', { ascending: true }),
    ]);

    let profilesRes: any = null;
    if (req.user.role === 'master' || req.user.role === 'admin') {
      profilesRes = await supabase.from('profiles').select('*').eq('company_id', req.user.companyId).order('created_at', { ascending: false });
    }

    const settings = companyRes.data?.settings || {};

    res.json({
      settings,
      services: servicesRes.data || [],
      posts: postsRes.data || [],
      gallery: galleryRes.data || [],
      testimonials: testimonialsRes.data || [],
      quotes: (estimatesRes.data || []).map(q => {
        let clientName = (Array.isArray(q.profiles) ? q.profiles[0]?.name : q.profiles?.name) || 'Cliente';
        const notes = q.notes || '';
        if (clientName === 'Cliente' && notes.startsWith('[CLIENT: ')) {
          const match = notes.match(/\[CLIENT: (.*?)\]/);
          if (match) clientName = match[1];
        }
        return {
          ...q,
          clientName,
          createdAt: q.created_at,
          totalValue: q.total_amount || 0,
          finalValue: q.final_amount || 0
        };
      }),
      inventory: (productsRes.data || []).map(p => ({
        ...p,
        price: p.base_cost,
        stock_quantity: p.stock_quantity || 0,
        availableM2: p.stock_quantity || 0
      })),
      users: (profilesRes?.data || []).map(u => ({
        ...u,
        createdAt: u.created_at
      })),
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
  const id = req.params.id; // UUID
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
  const id = req.params.id; // UUID
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

  const { data } = await supabase.from('posts').select('*').eq('company_id', companyId).order('created_at', { ascending: false });
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
  const id = req.params.id; // UUID
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
    .order('created_at', { ascending: false });

  if (serviceId) query = query.eq('service_id', serviceId);
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
  const id = req.params.id;
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
  const { data } = await supabase.from('testimonials').select('*').eq('company_id', companyId).order('created_at', { ascending: false });
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
  const id = req.params.id; // UUID
  await supabase.from('testimonials').delete().eq('id', id).eq('company_id', req.user.companyId);
  res.json({ success: true });
});


// =====================
// PRODUCTS Routes (TestHarness specific /api/products)
// =====================
app.get('/api/products', requireAdmin, async (req: any, res) => {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('company_id', req.user.companyId)
    .order('name', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  const mappedObj = (data || []).map(p => ({
    ...p,
    price: p.base_cost, // Backward compatibility
    base_cost: p.base_cost,
    stock_quantity: p.stock_quantity || 0
  }));
  console.log('[API] /api/products returned:', mappedObj.length, 'items');
  res.json(mappedObj);
});

app.post('/api/products', requireAdmin, async (req: any, res) => {
  const { name, price, stock_quantity, description } = req.body;
  if (!name || name.trim().length === 0) return res.status(400).json({ error: 'Nome é obrigatório' });
  const finalPrice = parseFloat(price) || 0;

  const { data, error } = await supabase.from('products').insert({
    company_id: req.user.companyId,
    name,
    description: description || name,
    base_cost: finalPrice,
    stock_quantity: parseFloat(stock_quantity) || 0
  }).select().single();

  res.json({ ...data, price: data.base_cost });
});

app.put('/api/products/:id', requireAdmin, async (req: any, res) => {
  const id = req.params.id;
  const { name, price, stock_quantity } = req.body;

  if (!name || name.trim().length === 0) return res.status(400).json({ error: 'Nome é obrigatório' });
  const finalPrice = parseFloat(price) || 0;

  const { data, error } = await supabase.from('products').update({
    name,
    base_cost: finalPrice,
    stock_quantity: parseFloat(stock_quantity) || 0
  }).eq('id', id).eq('company_id', req.user.companyId).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ...data, price: data.base_cost });
});

app.delete('/api/products/:id', requireAdmin, async (req: any, res) => {
  const id = req.params.id;
  await supabase.from('products').delete().eq('id', id).eq('company_id', req.user.companyId);
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
    .order('created_at', { ascending: false });

  // Regular users only see their own
  if (req.user.role === 'user') query = query.eq('client_id', req.user.id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const mapped = (data || []).map(q => {
    let clientName = (Array.isArray(q.profiles) ? q.profiles[0]?.name : q.profiles?.name) || 'Cliente';
    const notes = q.notes || '';
    if (notes.startsWith('[CLIENT: ')) {
      const match = notes.match(/\[CLIENT: (.*?)\]/);
      if (match) clientName = match[1];
    }
    return {
      ...q,
      clientName,
      createdAt: q.created_at,
      totalValue: q.total_amount || 0,
      finalValue: q.final_amount || 0,
      bends: []
    };
  });

  res.json(mapped);
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

  // Map everything that is not an final status to 'draft' as it is the only one we know works in the DB check constraint.
  const finalStatus = (req.body.status === 'rascunho' || req.body.status === 'draft' || !req.body.status) ? 'draft' : req.body.status;

  const quoteNotes = clientName ? `[CLIENT: ${clientName}] ${notes || ''}` : (notes || '');

  const { data: estimate, error: eError } = await supabase.from('estimates').insert({
    company_id: req.user.companyId,
    client_id: clientId || null,
    total_amount: totalValue,
    final_amount: totalValue,
    notes: quoteNotes,
    status: finalStatus
  }).select().single();

  if (eError) return res.status(500).json({ error: eError.message });

  if (bends && Array.isArray(bends) && bends.length > 0) {
    const itemRows = bends.map((b: any) => ({
      estimate_id: estimate.id,
      description: `[BEND] ${JSON.stringify(b)}`,
      quantity: 1,
      unit_price: pricePerM2,
      total_price: b.m2 * pricePerM2
    }));
    await supabase.from('estimate_items').insert(itemRows);
  }

  res.json(estimate);
});

app.put('/api/quotes/:id', authenticate, async (req: any, res) => {
  const id = req.params.id; // UUID
  const { clientName, bends, notes, totalValue: passedTotalValue, adminCreated, clientId } = req.body;

  let totalM2 = 0;
  if (bends && Array.isArray(bends)) {
    for (const bend of bends) totalM2 += parseFloat(bend.m2 || 0);
  }

  const { data: company } = await supabase.from('companies').select('settings').eq('id', req.user.companyId).single();
  const settings = company?.settings || {};
  const pricePerM2 = parseFloat(settings.pricePerM2 || '50');

  const totalValue = adminCreated && passedTotalValue ? parseFloat(passedTotalValue) : totalM2 * pricePerM2;
  const finalStatus = (req.body.status === 'rascunho' || req.body.status === 'draft' || !req.body.status) ? 'draft' : req.body.status;

  const quoteNotes = clientName ? `[CLIENT: ${clientName}] ${notes || ''}` : (notes || '');

  const { data: estimate, error: eError } = await supabase.from('estimates').update({
    client_id: clientId || null,
    total_amount: totalValue,
    final_amount: totalValue,
    notes: quoteNotes,
    status: finalStatus
  }).eq('id', id).eq('company_id', req.user.companyId).select().single();

  if (eError) return res.status(500).json({ error: eError.message });

  await supabase.from('estimate_items').delete().eq('estimate_id', id);

  if (bends && Array.isArray(bends) && bends.length > 0) {
    const itemRows = bends.map((b: any) => ({
      estimate_id: id,
      description: `[BEND] ${JSON.stringify(b)}`,
      quantity: 1,
      unit_price: pricePerM2,
      total_price: b.m2 * pricePerM2
    }));
    await supabase.from('estimate_items').insert(itemRows);
  }

  res.json(estimate);
});

app.get('/api/quotes/:id', authenticate, async (req: any, res) => {
  const id = req.params.id; // UUID
  const { data: estimate, error } = await supabase.from('estimates')
    .select('*, items:estimate_items(*)')
    .eq('id', id)
    .eq('company_id', req.user.companyId)
    .single();

  if (error || !estimate) return res.status(404).json({ error: 'Orçamento não encontrado' });
  if (req.user.role === 'user' && estimate.client_id !== req.user.id) return res.status(403).json({ error: 'Acesso negado' });

  // Map to legacy format for frontend
  let clientName = 'Cliente';
  const notes = estimate.notes || '';
  if (notes.startsWith('[CLIENT: ')) {
    const match = notes.match(/\[CLIENT: (.*?)\]/);
    if (match) clientName = match[1];
  }

  res.json({
    ...estimate,
    clientName,
    totalValue: estimate.total_amount || 0,
    finalValue: estimate.final_amount || 0,
    bends: (estimate.items || []).map((i: any) => {
      if (i.description && i.description.startsWith('[BEND] ')) {
        try { return JSON.parse(i.description.substring(7)); } catch { return {}; }
      }
      return i.metadata || {};
    })
  });
});

app.get('/api/quotes/:id/bends', authenticate, async (req: any, res) => {
  const id = req.params.id; // UUID
  console.log(`[DEBUG_BENDS] Fetching for quote: ${id} | User: ${req.user.id}`);
  const { data, error } = await supabase.from('estimate_items')
    .select('description, metadata')
    .eq('estimate_id', id);

  if (error) return res.status(500).json({ error: error.message });
  res.json((data || []).map((i: any) => {
    if (i.description && i.description.startsWith('[BEND] ')) {
      try { return JSON.parse(i.description.substring(7)); } catch { return {}; }
    }
    return i.metadata || {};
  }));
});

app.put('/api/quotes/:id/status', authenticate, async (req: any, res) => {
  const id = req.params.id; // UUID
  const { status } = req.body;
  console.log(`[DEBUG_STATUS] Updating quote: ${id} to ${status} | User: ${req.user.id}`);

  const { data, error } = await supabase.from('estimates')
    .update({ status })
    .eq('id', id)
    .eq('company_id', req.user.companyId)
    .select().single();

  if (error) return res.status(500).json({ error: error.message });

  const estimate = data;

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

    // Also debit inventory if needed (optional logic from later in the file)
    // await debitInventory(id, ...); 
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

// Duplicate status route removed

app.post('/api/quotes/:id/discount', requireMaster, async (req: any, res) => {
  const id = req.params.id; // UUID
  const { discountValue, reason } = req.body;

  const { data: quote } = await supabase.from('estimates').select('*').eq('id', id).eq('company_id', req.user.companyId).single();
  if (!quote) return res.status(404).json({ error: 'Orçamento não encontrado' });

  const finalValue = Math.max(0, (quote.total_amount || 0) - (discountValue || 0));

  await supabase.from('estimates').update({
    final_amount: finalValue
  }).eq('id', id).eq('company_id', req.user.companyId);

  res.json({ success: true, finalValue });
});

app.post('/api/quotes/:id/proof', authenticate, upload.single('proof'), async (req: any, res) => {
  const id = req.params.id; // UUID
  const { data: estimate } = await supabase.from('estimates').select('client_id').eq('id', id).eq('company_id', req.user.companyId).single();
  if (!estimate) return res.status(404).json({ error: 'Orçamento não encontrado' });
  if (req.user.role === 'user' && estimate.client_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  if (!req.file) return res.status(400).json({ error: 'Arquivo obrigatório' });

  const pixProofUrl = `/uploads/${req.file.filename}`;
  // Warning: Schema might not have metadata, skipping pixProofUrl update for now to prevent crash
  // await supabase.from('estimates').update({
  //   metadata: { pixProofUrl }
  // }).eq('id', id).eq('company_id', req.user.companyId);
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

  // Map fields for InventoryTab compatibility
  const mapped = (data || []).map(p => ({
    ...p,
    availableM2: p.stock_quantity || 0,
    widthM: 1.2,
    lengthM: (parseFloat(p.stock_quantity || 0) / 1.2) || 0,
    purchasedAt: p.created_at || p.createdAt || new Date().toISOString()
  }));

  res.json(mapped);
});

app.post('/api/inventory', requireAdmin, async (req: any, res) => {
  const { description, widthM, lengthM, costPerUnit, notes, lowStockThresholdM2, name, stock_quantity, price } = req.body;

  const finalName = name || description;
  if (!finalName || finalName.trim().length === 0) return res.status(400).json({ error: 'Nome/Descrição é obrigatório' });

  const finalPrice = price !== undefined ? parseFloat(price) : (parseFloat(costPerUnit) || 0);
  if (isNaN(finalPrice) || finalPrice <= 0) return res.status(400).json({ error: 'Preço/Custo deve ser maior que zero' });

  let totalM2;
  if (stock_quantity !== undefined) {
    totalM2 = parseFloat(stock_quantity);
  } else {
    const wM = parseFloat(widthM) || 1.20;
    const lM = parseFloat(lengthM) || 33;
    totalM2 = wM * lM;
  }

  const { data, error } = await supabase.from('products').insert({
    company_id: req.user.companyId,
    name: finalName,
    description: description || finalName,
    stock_quantity: totalM2,
    unit: 'm2',
    base_cost: finalPrice
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({
    ...data,
    availableM2: data.stock_quantity || 0,
    widthM: 1.2,
    lengthM: (parseFloat(data.stock_quantity || 0) / 1.2) || 0,
    purchasedAt: data.created_at || data.createdAt || new Date().toISOString()
  });
});

app.post('/api/inventory/batch', requireAdmin, async (req: any, res) => {
  const { entries } = req.body || {};
  if (!Array.isArray(entries)) return res.status(400).json({ error: 'entries required' });

  const inserts = entries.map((e: any) => ({
    company_id: req.user.companyId,
    name: e.name || e.description || 'Produto s/ Nome',
    description: e.description || e.name || '',
    stock_quantity: parseFloat(e.stock_quantity) || ((parseFloat(e.widthM) || 1.2) * (parseFloat(e.lengthM) || 33)),
    unit: 'm2',
    base_cost: parseFloat(e.price) || parseFloat(e.costPerUnit) || 0
  }));

  const { data, error } = await supabase.from('products').insert(inserts).select();
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
// PIX KEYS Routes (dedicated table)
// =====================
app.get('/api/pix-keys', authenticate, async (req: any, res) => {
  const { data, error } = await supabase.from('pix_keys').select('*').eq('company_id', req.user.companyId).order('sort_order', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json((data || []).map(k => ({
    ...k,
    pixKey: k.pix_key,
    pixCode: k.pix_code,
    qrCodeUrl: k.qr_code_url,
    sortOrder: k.sort_order
  })));
});

app.post('/api/pix-keys', requireAdmin, async (req: any, res) => {
  const { label, pixKey, keyType, bank, beneficiary, pixCode, qrCodeUrl, sortOrder } = req.body;
  const { data, error } = await supabase.from('pix_keys').insert({
    company_id: req.user.companyId,
    label,
    pix_key: pixKey,
    key_type: keyType,
    bank,
    beneficiary,
    pix_code: pixCode,
    qr_code_url: qrCodeUrl,
    sort_order: sortOrder || 0
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put('/api/pix-keys/:id', requireAdmin, async (req: any, res) => {
  const id = req.params.id;
  const { data, error } = await supabase.from('pix_keys').update(req.body).eq('id', id).eq('company_id', req.user.companyId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/pix-keys/:id', requireAdmin, async (req: any, res) => {
  const id = req.params.id;
  await supabase.from('pix_keys').delete().eq('id', id).eq('company_id', req.user.companyId);
  res.json({ success: true });
});

// =====================
// REPORT SETTINGS Routes
// =====================
app.post('/api/report-settings', requireAdmin, upload.single('reportLogoFile'), async (req: any, res) => {
  try {
    const { reportCompanyName, reportHeaderText, reportFooterText, reportPhone, reportEmail, reportAddress } = req.body;
    const { data: company } = await supabase.from('companies').select('settings').eq('id', req.user.companyId).single();
    const settings = company?.settings || {};

    const updatedSettings = {
      ...settings,
      reportCompanyName, reportHeaderText, reportFooterText, reportPhone, reportEmail, reportAddress
    };

    if (req.file) {
      updatedSettings.reportLogo = `/uploads/${req.file.filename}`;
    }

    const { error } = await supabase.from('companies').update({ settings: updatedSettings }).eq('id', req.user.companyId);
    if (error) throw error;
    res.json({ success: true, settings: updatedSettings });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// =====================
// FINANCIAL Routes (SaaS V2 Map: /api/financial -> payments table)
// =====================
app.get('/api/financial', requireAdmin, async (req: any, res) => {
  const { from, to } = req.query;
  let query = supabase.from('payments').select('*, estimate:estimates(notes)')
    .eq('company_id', req.user.companyId)
    .order('confirmed_at', { ascending: false });

  if (from) query = query.gte('confirmed_at', from as string);
  if (to) query = query.lte('confirmed_at', to as string);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  // Map to legacy format with Fallbacks
  const mapped = (data || []).map(p => {
    let clientName = 'Cliente';
    const notes = p.estimate?.notes || '';
    if (notes.startsWith('[CLIENT: ')) {
      const match = notes.match(/\[CLIENT: (.*?)\]/);
      if (match) clientName = match[1];
    }

    return {
      id: p.id,
      quoteId: p.estimate_id,
      clientName,
      grossValue: p.amount,
      discountValue: 0,
      netValue: p.amount,
      paymentMethod: p.payment_method,
      paidAt: p.confirmed_at
    };
  });
  res.json(mapped);
});

app.get('/api/financial/summary', requireAdmin, async (req: any, res) => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { data: all } = await supabase.from('payments')
    .select('amount, confirmed_at')
    .eq('company_id', req.user.companyId);

  if (!all) return res.json({ totalAll: 0, totalToday: 0, totalMonth: 0, countAll: 0, countToday: 0, countMonth: 0, ticketAverage: 0 });

  const sum = (rows: any[]) => rows.reduce((a, r) => a + parseFloat(r.amount || 0), 0);
  const today = all.filter(r => r.confirmed_at >= todayStart);
  const month = all.filter(r => r.confirmed_at >= monthStart);

  res.json({
    totalAll: sum(all),
    totalToday: sum(today),
    totalMonth: sum(month),
    countAll: all.length,
    countToday: today.length,
    countMonth: month.length,
    ticketAverage: all.length > 0 ? sum(all) / all.length : 0,
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
