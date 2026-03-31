import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';
import { requireAuth, signToken } from './auth.js';

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3001);
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'user-profile.json');

const DEFAULT_PROFILE = {
  name: 'Bible Reader',
  email: 'reader@example.com',
  goal: 'Read every day'
};

const DEFAULT_READING_PLAN = {
  selectedPlan: 'whole-bible',
  search: '',
  days: '365',
  activeReference: 'Genesis 1',
  mainPage: 'reader',
  translation: 'web'
};

function normalizeProfile(profile = {}) {
  return {
    name: typeof profile.name === 'string' ? profile.name : DEFAULT_PROFILE.name,
    email: typeof profile.email === 'string' ? profile.email : DEFAULT_PROFILE.email,
    goal: typeof profile.goal === 'string' ? profile.goal : DEFAULT_PROFILE.goal
  };
}

function normalizeReadingPlan(readingPlan = {}) {
  return {
    selectedPlan:
      typeof readingPlan.selectedPlan === 'string'
        ? readingPlan.selectedPlan
        : DEFAULT_READING_PLAN.selectedPlan,
    search:
      typeof readingPlan.search === 'string' ? readingPlan.search : DEFAULT_READING_PLAN.search,
    days: typeof readingPlan.days === 'string' ? readingPlan.days : DEFAULT_READING_PLAN.days,
    activeReference:
      typeof readingPlan.activeReference === 'string'
        ? readingPlan.activeReference
        : DEFAULT_READING_PLAN.activeReference,
    mainPage:
      typeof readingPlan.mainPage === 'string'
        ? readingPlan.mainPage
        : DEFAULT_READING_PLAN.mainPage,
    translation:
      typeof readingPlan.translation === 'string'
        ? readingPlan.translation
        : DEFAULT_READING_PLAN.translation
  };
}

function normalizeStoredUserData(payload = {}) {
  return {
    profile: normalizeProfile(payload.profile),
    readingPlan: normalizeReadingPlan(payload.readingPlan),
    updatedAt: payload.updatedAt || new Date().toISOString()
  };
}

async function ensureDataFile() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    await readFile(DATA_FILE, 'utf8');
  } catch {
    await writeFile(DATA_FILE, JSON.stringify(normalizeStoredUserData({}), null, 2));
  }
}

async function readStoredUserData() {
  await ensureDataFile();
  const raw = await readFile(DATA_FILE, 'utf8');
  return normalizeStoredUserData(JSON.parse(raw));
}

async function writeStoredUserData(payload) {
  const normalized = normalizeStoredUserData({
    ...payload,
    updatedAt: new Date().toISOString()
  });

  await ensureDataFile();
  await writeFile(DATA_FILE, JSON.stringify(normalized, null, 2));
  return normalized;
}

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN,
    credentials: false
  })
);
app.use(express.json());

app.get('/api/health', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    res.json({ ok: rows[0].ok === 1 });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false });
  }
});

app.get('/api/user-profile', async (_req, res) => {
  try {
    const data = await readStoredUserData();
    res.json(data);
  } catch (error) {
    console.error('Get stored user profile failed:', error);
    res.status(500).json({ error: 'Failed to read user data.' });
  }
});

app.put('/api/user-profile', async (req, res) => {
  try {
    const saved = await writeStoredUserData(req.body ?? {});
    res.json(saved);
  } catch (error) {
    console.error('Update stored user profile failed:', error);
    res.status(400).json({ error: 'Failed to save user data.' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { email, password, displayName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const passwordHash = await bcrypt.hash(password, 12);
    const userUuid = randomUUID();

    await connection.beginTransaction();

    const [userResult] = await connection.execute(
      `
      INSERT INTO users (user_uuid, email, password_hash)
      VALUES (?, ?, ?)
      `,
      [userUuid, normalizedEmail, passwordHash]
    );

    await connection.execute(
      `
      INSERT INTO user_profiles (user_id, display_name, avatar_url, timezone, bio)
      VALUES (?, ?, NULL, NULL, NULL)
      `,
      [userResult.insertId, displayName ?? null]
    );

    await connection.commit();

    const user = {
      id: userResult.insertId,
      user_uuid: userUuid,
      email: normalizedEmail
    };

    const token = signToken(user);

    res.status(201).json({
      token,
      user: {
        userUuid: user.user_uuid,
        email: user.email
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Register failed:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Email already registered' });
    }

    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const [rows] = await pool.execute(
      `
      SELECT id, user_uuid, email, password_hash
      FROM users
      WHERE email = ?
      LIMIT 1
      `,
      [normalizedEmail]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);

    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken(user);

    res.json({
      token,
      user: {
        userUuid: user.user_uuid,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Login failed:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/profile/me', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `
      SELECT
        u.user_uuid,
        u.email,
        p.display_name,
        p.avatar_url,
        p.timezone,
        p.bio,
        p.created_at,
        p.updated_at
      FROM users u
      JOIN user_profiles p ON p.user_id = u.id
      WHERE u.id = ?
      LIMIT 1
      `,
      [req.auth.userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Get my profile failed:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/profile/me', requireAuth, async (req, res) => {
  try {
    const { displayName, avatarUrl, timezone, bio } = req.body;

    await pool.execute(
      `
      UPDATE user_profiles
      SET
        display_name = ?,
        avatar_url = ?,
        timezone = ?,
        bio = ?
      WHERE user_id = ?
      `,
      [
        displayName ?? null,
        avatarUrl ?? null,
        timezone ?? null,
        bio ?? null,
        req.auth.userId
      ]
    );

    const [rows] = await pool.execute(
      `
      SELECT
        u.user_uuid,
        u.email,
        p.display_name,
        p.avatar_url,
        p.timezone,
        p.bio,
        p.created_at,
        p.updated_at
      FROM users u
      JOIN user_profiles p ON p.user_id = u.id
      WHERE u.id = ?
      LIMIT 1
      `,
      [req.auth.userId]
    );

    res.json(rows[0]);
  } catch (error) {
    console.error('Update my profile failed:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
