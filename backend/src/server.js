import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pg from 'pg';

const { Pool } = pg;
const required = ['DATABASE_URL', 'TELEGRAM_BOT_TOKEN'];
for (const key of required) if (!process.env[key]) {
  console.error(`Missing required environment variable: ${key}`);
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined });
const app = express();
const port = Number(process.env.PORT || 3000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(__dirname, '../../frontend');

app.disable('x-powered-by');

// Allow the deployed Vercel frontend to call this Render API.
const allowedFrontendOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const isVercelPreview = typeof origin === 'string' &&
    /^https:\/\/[a-z0-9-]+(?:-[a-z0-9-]+)*\.vercel\.app$/i.test(origin);
  if (origin && (allowedFrontendOrigins.includes(origin) || isVercelPreview)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '10kb' }));

function verifyTelegramInitData(initData) {
  if (!initData || typeof initData !== 'string') throw Object.assign(new Error('Telegram authentication required.'), { status: 401 });
  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) throw Object.assign(new Error('Invalid Telegram initData.'), { status: 401 });
  params.delete('hash');
  const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(process.env.TELEGRAM_BOT_TOKEN).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  const a = Buffer.from(calculatedHash, 'hex');
  const b = Buffer.from(receivedHash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw Object.assign(new Error('Telegram authentication failed.'), { status: 401 });
  const authDate = Number(params.get('auth_date'));
  const now = Math.floor(Date.now() / 1000);
  if (!authDate || authDate > now + 60 || now - authDate > 86400) throw Object.assign(new Error('Telegram session expired. Reopen the Mini App.'), { status: 401 });
  const userRaw = params.get('user');
  if (!userRaw) throw Object.assign(new Error('Telegram user data missing.'), { status: 401 });
  let user;
  try { user = JSON.parse(userRaw); } catch { throw Object.assign(new Error('Invalid Telegram user data.'), { status: 401 }); }
  if (!user?.id) throw Object.assign(new Error('Telegram user ID missing.'), { status: 401 });
  return user;
}

async function authenticate(req, res, next) {
  try {
    const header = req.get('authorization') || '';
    const initData = header.startsWith('tma ') ? header.slice(4) : '';
    const user = verifyTelegramInitData(initData);
    const result = await pool.query(
      `INSERT INTO users (telegram_id, username, first_name, last_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (telegram_id) DO UPDATE SET username = EXCLUDED.username,
         first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, updated_at = NOW()
       RETURNING telegram_id, username, first_name, last_name, balance, wallet_address`,
      [String(user.id), user.username || null, user.first_name || null, user.last_name || null]
    );
    req.telegramUser = user;
    req.dbUser = result.rows[0];
    next();
  } catch (error) { next(error); }
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'test-world-api' }));
app.get('/api/me', authenticate, (req, res) => res.json({ user: req.dbUser }));

// Every successful logo tap atomically adds exactly 10 TW to the authenticated account.
app.post('/api/claim', authenticate, rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false }), async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE users SET balance = balance + 10.00, updated_at = NOW()
       WHERE telegram_id = $1
       RETURNING telegram_id, username, first_name, last_name, balance, wallet_address`,
      [String(req.telegramUser.id)]
    );
    res.json({ user: result.rows[0] });
  } catch (error) { next(error); }
});

app.put('/api/wallet', authenticate, async (req, res, next) => {
  try {
    const address = req.body?.address;
    if (address !== null && (typeof address !== 'string' || address.length < 20 || address.length > 128)) {
      return res.status(400).json({ error: 'Invalid TON wallet address.' });
    }
    const result = await pool.query(
      `UPDATE users SET wallet_address = $2, updated_at = NOW()
       WHERE telegram_id = $1 RETURNING wallet_address`,
      [String(req.telegramUser.id), address]
    );
    res.json({ wallet_address: result.rows[0].wallet_address });
  } catch (error) { next(error); }
});

app.use(express.static(frontendDir, { extensions: ['html'] }));
app.get('*', (_req, res) => res.sendFile(path.join(frontendDir, 'index.html')));
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status || 500).json({ error: error.status ? error.message : 'Internal server error.' });
});

pool.query('SELECT 1').then(() => {
  app.listen(port, () => console.log(`Test World API listening on ${port}`));
}).catch(error => {
  console.error('Database connection failed:', error.message);
  process.exit(1);
});
