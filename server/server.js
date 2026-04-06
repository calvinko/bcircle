import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { pool } from './db.js';
import { requireAuth, signToken } from './auth.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3001);
const ESV_AUTH_TOKEN = process.env.ESV_AUTH_TOKEN;
const ALLOWED_ORIGINS = new Set([
  'https://biblecircle.vercel.app',
  'https://app.biblecircle.org',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000'
]);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.has(origin)) return true;

  try {
    const { protocol, hostname } = new URL(origin);
    return protocol === 'https:' && hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
}

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
  translation: 'web',
  readerFontSize: 15,
  showAdditionalReader: false,
  additionalTranslation: 'kjv'
};

function normalizeProfile(profile = {}) {
  return {
    name: typeof profile.name === 'string' ? profile.name : DEFAULT_PROFILE.name,
    email: typeof profile.email === 'string' ? profile.email : DEFAULT_PROFILE.email,
    goal: typeof profile.goal === 'string' ? profile.goal : DEFAULT_PROFILE.goal
  };
}

function normalizeReadingPlan(readingPlan = {}) {
  const parsedReaderFontSize =
    typeof readingPlan.readerFontSize === 'number'
      ? readingPlan.readerFontSize
      : typeof readingPlan.readerFontSize === 'string' && readingPlan.readerFontSize.trim() !== ''
        ? Number(readingPlan.readerFontSize)
        : NaN;

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
        : DEFAULT_READING_PLAN.translation,
    readerFontSize:
      Number.isFinite(parsedReaderFontSize)
        ? Math.max(12, Math.min(24, parsedReaderFontSize))
        : DEFAULT_READING_PLAN.readerFontSize,
    showAdditionalReader:
      typeof readingPlan.showAdditionalReader === 'boolean'
        ? readingPlan.showAdditionalReader
        : DEFAULT_READING_PLAN.showAdditionalReader,
    additionalTranslation:
      typeof readingPlan.additionalTranslation === 'string'
        ? readingPlan.additionalTranslation
        : DEFAULT_READING_PLAN.additionalTranslation
  };
}

function normalizeStoredUserData(payload = {}) {
  return {
    progress: normalizeProgress(payload.progress),
    profile: normalizeProfile(payload.profile),
    readingPlan: normalizeReadingPlan(payload.readingPlan),
    updatedAt: payload.updatedAt || new Date().toISOString()
  };
}

function normalizeProgress(progress = {}) {
  if (!progress || typeof progress !== 'object' || Array.isArray(progress)) {
    return {};
  }

  const normalized = {};

  for (const [bookName, chapterStates] of Object.entries(progress)) {
    if (Array.isArray(chapterStates)) {
      normalized[bookName] = chapterStates.map(Boolean);
    }
  }

  return normalized;
}

async function fetchEsvPassageText(book, chapter) {
  if (!ESV_AUTH_TOKEN) {
    throw new Error('Missing ESV_AUTH_TOKEN');
  }

  const passage = `${book} ${chapter}`;
  const params = new URLSearchParams({
    q: passage,
    'include-passage-references': 'false',
    'include-first-verse-numbers': 'true',
    'include-verse-numbers': 'true',
    'include-footnotes': 'false',
    'include-headings': 'false',
    'include-short-copyright': 'false',
    'include-copyright': 'false'
  });

  const response = await fetch(`https://api.esv.org/v3/passage/text/?${params.toString()}`, {
    headers: {
      Authorization: `Token ${ESV_AUTH_TOKEN}`
    }
  });

  if (!response.ok) {
    throw new Error(`ESV API request failed with status ${response.status}`);
  }

  const data = await response.json();
  const passages = Array.isArray(data?.passages) ? data.passages : [];
  const rows = passages.flatMap((text) => {
    const normalized = String(text || '')
      .replace(/\r/g, '')
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!normalized) {
      return [];
    }

    const verseMatches = Array.from(normalized.matchAll(/\[(\d+)\]\s*/g));

    if (verseMatches.length === 0) {
      return [{ verse: 1, text: normalized }];
    }

    return verseMatches.map((match, index) => {
      const verse = Number(match[1]);
      const start = match.index + match[0].length;
      const end = index + 1 < verseMatches.length ? verseMatches[index + 1].index : normalized.length;

      return {
        verse,
        text: normalized.slice(start, end).trim()
      };
    });
  });

  return {
    translationName: 'ESV',
    bookname: book,
    chapter: String(chapter),
    title: passage,
    rows
  };
}

async function ensureStoredUserDataTable() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS app_user_state_storage (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      name VARCHAR(100) NULL,
      email VARCHAR(255) NULL,
      goal VARCHAR(255) NULL,
      selected_plan VARCHAR(50) NULL,
      search VARCHAR(255) NULL,
      days VARCHAR(20) NULL,
      active_reference VARCHAR(100) NULL,
      main_page VARCHAR(50) NULL,
      translation VARCHAR(20) NULL,
      reader_font_size SMALLINT NULL,
      show_todays_reading BOOLEAN NULL,
      show_additional_reader BOOLEAN NULL,
      additional_translation VARCHAR(20) NULL,
      progress_json JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_app_user_state_storage_user_id (user_id),
      CONSTRAINT fk_app_user_state_storage_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);
}

async function readStoredUserData(userId, fallbackEmail = DEFAULT_PROFILE.email) {
  await ensureStoredUserDataTable();

  const [rows] = await pool.execute(
    `
    SELECT
      s.user_id,
      name,
      email,
      goal,
      selected_plan,
      search,
      days,
      active_reference,
      main_page,
      translation,
      reader_font_size,
      show_additional_reader,
      additional_translation,
      progress_json,
      updated_at
    FROM app_user_state_storage s
    WHERE s.user_id = ?
    LIMIT 1
    `,
    [userId]
  );

  if (rows.length === 0) {
    return normalizeStoredUserData({
      profile: {
        email: fallbackEmail
      }
    });
  }

  const row = rows[0];
  return normalizeStoredUserData({
    progress: row.progress_json
      ? typeof row.progress_json === 'string'
        ? JSON.parse(row.progress_json)
        : row.progress_json
      : {},
    profile: {
      name: row.name,
      email: row.email,
      goal: row.goal
    },
    readingPlan: {
      selectedPlan: row.selected_plan,
      search: row.search,
      days: row.days,
      activeReference: row.active_reference,
      mainPage: row.main_page,
      translation: row.translation,
      readerFontSize: row.reader_font_size,
      showAdditionalReader: row.show_additional_reader,
      additionalTranslation: row.additional_translation
    },
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at
  });
}

async function writeStoredUserData(userId, payload, fallbackEmail = DEFAULT_PROFILE.email) {
  await ensureStoredUserDataTable();

  const normalized = normalizeStoredUserData({
    ...payload,
    profile: {
      ...payload?.profile,
      email: payload?.profile?.email || fallbackEmail
    }
  });

  await pool.execute(
    `
    INSERT INTO app_user_state_storage (
      user_id,
      name,
      email,
      goal,
      selected_plan,
      search,
      days,
      active_reference,
      main_page,
      translation,
      reader_font_size,
      show_additional_reader,
      additional_translation,
      progress_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      email = VALUES(email),
      goal = VALUES(goal),
      selected_plan = VALUES(selected_plan),
      search = VALUES(search),
      days = VALUES(days),
      active_reference = VALUES(active_reference),
      main_page = VALUES(main_page),
      translation = VALUES(translation),
      reader_font_size = VALUES(reader_font_size),
      show_additional_reader = VALUES(show_additional_reader),
      additional_translation = VALUES(additional_translation),
      progress_json = VALUES(progress_json)
    `,
    [
      userId,
      normalized.profile.name,
      normalized.profile.email,
      normalized.profile.goal,
      normalized.readingPlan.selectedPlan,
      normalized.readingPlan.search,
      normalized.readingPlan.days,
      normalized.readingPlan.activeReference,
      normalized.readingPlan.mainPage,
      normalized.readingPlan.translation,
      normalized.readingPlan.readerFontSize,
      normalized.readingPlan.showAdditionalReader,
      normalized.readingPlan.additionalTranslation,
      JSON.stringify(normalized.progress)
    ]
  );

  return readStoredUserData(userId, fallbackEmail);
}

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  next();
});

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Not allowed by CORS'));
    },
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

app.get('/api/bible/:book/:chapter', async (req, res) => {
  try {
    const version = String(req.query.version || 'ESV').toUpperCase();

    if (version !== 'ESV') {
      return res.status(400).json({ error: 'Only ESV is supported by this endpoint.' });
    }

    const payload = await fetchEsvPassageText(req.params.book, req.params.chapter);
    res.json(payload);
  } catch (error) {
    console.error('Fetch ESV passage failed:', error);
    res.status(502).json({ error: 'Failed to fetch ESV passage.' });
  }
});

app.get('/api/user-profile', requireAuth, async (req, res) => {
  try {
    const data = await readStoredUserData(req.auth.userId, req.auth.email);
    res.json(data);
  } catch (error) {
    console.error('Get stored user profile failed:', error);
    res.status(500).json({ error: 'Failed to read user data.' });
  }
});

app.put('/api/user-profile', requireAuth, async (req, res) => {
  try {
    const saved = await writeStoredUserData(req.auth.userId, req.body ?? {}, req.auth.email);
    res.json(saved);
  } catch (error) {
    console.error('Update stored user profile failed:', error);
    res.status(400).json({ error: 'Failed to save user data.' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  await ensureStoredUserDataTable();
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

    await connection.execute(
      `
      INSERT INTO app_user_state_storage (
        user_id,
        name,
        email,
        goal,
        selected_plan,
        search,
        days,
        active_reference,
        main_page,
        translation,
        reader_font_size,
        show_additional_reader,
        additional_translation,
        progress_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        userResult.insertId,
        displayName ?? DEFAULT_PROFILE.name,
        normalizedEmail,
        DEFAULT_PROFILE.goal,
        DEFAULT_READING_PLAN.selectedPlan,
        DEFAULT_READING_PLAN.search,
        DEFAULT_READING_PLAN.days,
        DEFAULT_READING_PLAN.activeReference,
        DEFAULT_READING_PLAN.mainPage,
        DEFAULT_READING_PLAN.translation,
        DEFAULT_READING_PLAN.readerFontSize,
        DEFAULT_READING_PLAN.showAdditionalReader,
        DEFAULT_READING_PLAN.additionalTranslation,
        JSON.stringify({})
      ]
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
