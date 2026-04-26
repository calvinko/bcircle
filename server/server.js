import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { pool } from './db.js';
import { createAuthRouter, requireAuth } from './auth.js';
import { createChatGptRouter } from './chatgpt.js';

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
  showTodaysReading: false,
  showDailyPlan: false,
  showAdditionalReader: false,
  additionalTranslation: 'kjv'
};

const BIBLE_BOOK_NAMES = [
  'Genesis',
  'Exodus',
  'Leviticus',
  'Numbers',
  'Deuteronomy',
  'Joshua',
  'Judges',
  'Ruth',
  '1 Samuel',
  '2 Samuel',
  '1 Kings',
  '2 Kings',
  '1 Chronicles',
  '2 Chronicles',
  'Ezra',
  'Nehemiah',
  'Esther',
  'Job',
  'Psalms',
  'Proverbs',
  'Ecclesiastes',
  'Song of Solomon',
  'Isaiah',
  'Jeremiah',
  'Lamentations',
  'Ezekiel',
  'Daniel',
  'Hosea',
  'Joel',
  'Amos',
  'Obadiah',
  'Jonah',
  'Micah',
  'Nahum',
  'Habakkuk',
  'Zephaniah',
  'Haggai',
  'Zechariah',
  'Malachi',
  'Matthew',
  'Mark',
  'Luke',
  'John',
  'Acts',
  'Romans',
  '1 Corinthians',
  '2 Corinthians',
  'Galatians',
  'Ephesians',
  'Philippians',
  'Colossians',
  '1 Thessalonians',
  '2 Thessalonians',
  '1 Timothy',
  '2 Timothy',
  'Titus',
  'Philemon',
  'Hebrews',
  'James',
  '1 Peter',
  '2 Peter',
  '1 John',
  '2 John',
  '3 John',
  'Jude',
  'Revelation'
];

const BIBLE_BOOK_NUMBER_BY_NAME = new Map(
  BIBLE_BOOK_NAMES.map((bookName, index) => [bookName.toLowerCase(), index + 1])
);

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
    showTodaysReading:
      typeof readingPlan.showTodaysReading === 'boolean'
        ? readingPlan.showTodaysReading
        : DEFAULT_READING_PLAN.showTodaysReading,
    showDailyPlan:
      typeof readingPlan.showDailyPlan === 'boolean'
        ? readingPlan.showDailyPlan
        : DEFAULT_READING_PLAN.showDailyPlan,
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

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function fetchCuvPassageText(book, chapter) {
  const bookNumber = BIBLE_BOOK_NUMBER_BY_NAME.get(String(book || '').toLowerCase());
  const chapterNumber = Number(chapter);

  if (!bookNumber || !Number.isInteger(chapterNumber) || chapterNumber < 1) {
    throw createHttpError(400, 'Invalid Bible passage.');
  }

  const [rows] = await pool.execute(
    `
    SELECT
      book,
      bookname,
      chapter,
      verse,
      text
    FROM hb5text
    WHERE UPPER(version) = 'hb5'
      AND book = ?
      AND chapter = ?
    ORDER BY verse ASC
    `,
    [bookNumber, chapterNumber]
  );

  if (rows.length === 0) {
    throw createHttpError(404, 'CUV passage not found.');
  }

  const bookname = rows[0].bookname || book;

  return {
    translationName: 'CUV',
    bookname,
    chapter: String(chapterNumber),
    title: `${bookname} ${chapterNumber}`,
    rows: rows.map((row) => ({
      book_id: BIBLE_BOOK_NAMES[bookNumber - 1],
      book_name: row.bookname || book,
      chapter: Number(row.chapter),
      verse: Number(row.verse),
      text: row.text || ''
    }))
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
      show_daily_plan BOOLEAN NULL,
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

  try {
    await pool.execute(`
      ALTER TABLE app_user_state_storage
      ADD COLUMN show_todays_reading BOOLEAN NULL
    `);
  } catch (error) {
    if (error.code !== 'ER_DUP_FIELDNAME') throw error;
  }

  try {
    await pool.execute(`
      ALTER TABLE app_user_state_storage
      ADD COLUMN show_daily_plan BOOLEAN NULL
    `);
  } catch (error) {
    if (error.code !== 'ER_DUP_FIELDNAME') throw error;
  }
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
      show_todays_reading,
      show_daily_plan,
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
      showTodaysReading: Boolean(row.show_todays_reading),
      showDailyPlan: Boolean(row.show_daily_plan),
      showAdditionalReader: Boolean(row.show_additional_reader),
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
      show_todays_reading,
      show_daily_plan,
      show_additional_reader,
      additional_translation,
      progress_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      show_todays_reading = VALUES(show_todays_reading),
      show_daily_plan = VALUES(show_daily_plan),
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
      normalized.readingPlan.showTodaysReading,
      normalized.readingPlan.showDailyPlan,
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
app.use(
  '/api/auth',
  createAuthRouter({
    pool,
    ensureStoredUserDataTable,
    defaultProfile: DEFAULT_PROFILE,
    defaultReadingPlan: DEFAULT_READING_PLAN
  })
);
app.use('/api/chatgpt', requireAuth, createChatGptRouter());

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

    if (version === 'ESV') {
      const payload = await fetchEsvPassageText(req.params.book, req.params.chapter);
      res.json(payload);
      return;
    }

    if (version === 'CUV') {
      const payload = await fetchCuvPassageText(req.params.book, req.params.chapter);
      res.json(payload);
      return;
    }

    res.status(400).json({ error: 'Only ESV and CUV are supported by this endpoint.' });
  } catch (error) {
    const statusCode = Number(error.statusCode) || 502;
    console.error('Fetch Bible passage failed:', error);
    res.status(statusCode).json({ error: error.message || 'Failed to fetch Bible passage.' });
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
