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
