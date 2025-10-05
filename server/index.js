require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');
const jwt = require('jsonwebtoken');

const {
  findUserByEmail,
  findUserById,
  createUser,
  updateUser,
} = require('./storage');
const {
  signAccessToken,
  signRefreshToken,
  encryptToken,
  decryptToken,
  hashToken,
  ACCESS_TOKEN_SECRET,
  REFRESH_TOKEN_SECRET,
  REFRESH_TOKEN_TTL,
} = require('./token');

const app = express();
const PORT = process.env.PORT || 4000;
const CLIENT_ORIGINS = (process.env.CLIENT_ORIGIN || '').split(',').map(origin => origin.trim()).filter(Boolean);
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';
const REFRESH_COOKIE_NAME = 'pic_refresh_token';

function parseDurationToMs(value, fallback) {
  if (!value) return fallback;
  if (/^\d+$/.test(String(value))) {
    return Number(value) * 1000;
  }
  const match = /^\s*(\d+)\s*([smhd])\s*$/i.exec(String(value));
  if (!match) return fallback;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
  return amount * (multipliers[unit] || 1000);
}

const REFRESH_MAX_AGE_MS = parseDurationToMs(REFRESH_TOKEN_TTL, 7 * 24 * 60 * 60 * 1000);

app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin(origin, callback) {
    if (!origin || CLIENT_ORIGINS.length === 0 || CLIENT_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

const refreshCookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? 'none' : 'lax',
  maxAge: REFRESH_MAX_AGE_MS,
  path: '/',
};

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt,
  };
}

async function issueTokens(res, user) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  const encryptedRefresh = encryptToken(refreshToken);
  const refreshTokenHash = hashToken(refreshToken);
  const refreshTokenExpiresAt = new Date(Date.now() + REFRESH_MAX_AGE_MS).toISOString();
  const updatedUser = {
    ...user,
    refreshTokenHash,
    refreshTokenExpiresAt,
  };
  updateUser(updatedUser);
  res.cookie(REFRESH_COOKIE_NAME, encryptedRefresh, refreshCookieOptions);
  return {
    user: sanitizeUser(updatedUser),
    accessToken,
  };
}

function validateEmail(email) {
  return /^\S+@\S+\.\S+$/.test(String(email).toLowerCase());
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

async function verifyRefreshToken(cookieValue) {
  if (!cookieValue) {
    throw new Error('Missing refresh token');
  }
  const decrypted = decryptToken(cookieValue);
  const payload = jwt.verify(decrypted, REFRESH_TOKEN_SECRET);
  if (payload.type !== 'refresh') {
    throw new Error('Invalid refresh token');
  }
  const user = findUserById(payload.sub);
  if (!user || !user.refreshTokenHash) {
    throw new Error('Session expired');
  }
  const hashed = hashToken(decrypted);
  if (hashed !== user.refreshTokenHash) {
    throw new Error('Session expired');
  }
  return { user, token: decrypted };
}

app.post('/api/register', async (req, res) => {
  const { email, password } = req.body || {};
  if (!validateEmail(email)) {
    return res.status(400).json({ message: 'A valid email address is required.' });
  }
  if (!validatePassword(password)) {
    return res.status(400).json({ message: 'Password must be at least 8 characters long.' });
  }
  const existing = findUserByEmail(email);
  if (existing) {
    return res.status(409).json({ message: 'An account with this email already exists.' });
  }
  try {
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);
    const timestamp = new Date().toISOString();
    const user = {
      id: nanoid(),
      email: email.toLowerCase(),
      hashedPassword,
      salt,
      createdAt: timestamp,
      refreshTokenHash: null,
      refreshTokenExpiresAt: null,
    };
    createUser(user);
    const payload = await issueTokens(res, user);
    return res.status(201).json(payload);
  } catch (err) {
    console.error('Registration failed', err);
    return res.status(500).json({ message: 'Unable to register at this time.' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!validateEmail(email) || !validatePassword(password)) {
    return res.status(400).json({ message: 'Invalid credentials supplied.' });
  }
  const user = findUserByEmail(email);
  if (!user) {
    return res.status(401).json({ message: 'Incorrect email or password.' });
  }
  try {
    const valid = await bcrypt.compare(password, user.hashedPassword);
    if (!valid) {
      return res.status(401).json({ message: 'Incorrect email or password.' });
    }
    const payload = await issueTokens(res, user);
    return res.json(payload);
  } catch (err) {
    console.error('Login failed', err);
    return res.status(500).json({ message: 'Unable to log in at this time.' });
  }
});

app.post('/api/token/refresh', async (req, res) => {
  try {
    const { user } = await verifyRefreshToken(req.cookies[REFRESH_COOKIE_NAME]);
    const payload = await issueTokens(res, user);
    return res.json(payload);
  } catch (err) {
    console.warn('Refresh token rejected', err.message);
    res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions);
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }
});

app.post('/api/logout', async (req, res) => {
  try {
    const cookieValue = req.cookies[REFRESH_COOKIE_NAME];
    if (cookieValue) {
      try {
        const { user } = await verifyRefreshToken(cookieValue);
        updateUser({ ...user, refreshTokenHash: null, refreshTokenExpiresAt: null });
      } catch (err) {
        console.warn('Failed to verify refresh token during logout', err.message);
      }
    }
  } finally {
    res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions);
    res.status(204).send();
  }
});

function authenticateAccessToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;
  if (!token) {
    return res.status(401).json({ message: 'Access token required.' });
  }
  try {
    const payload = jwt.verify(token, ACCESS_TOKEN_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired access token.' });
  }
}

app.get('/api/me', authenticateAccessToken, (req, res) => {
  const user = findUserById(req.user.sub);
  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }
  return res.json({ user: sanitizeUser(user) });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

const clientDir = path.join(__dirname, '..');
app.use(express.static(clientDir));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  return res.sendFile(path.join(clientDir, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Unhandled server error', err);
  res.status(500).json({ message: 'Unexpected server error.' });
});

app.listen(PORT, () => {
  console.log(`PIC API listening on port ${PORT}`);
});
