const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || '15m';
const REFRESH_TOKEN_TTL = process.env.REFRESH_TOKEN_TTL || '7d';
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || 'pic-access-secret';
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'pic-refresh-secret';
const ENCRYPTION_SECRET = process.env.TOKEN_ENCRYPTION_SECRET || 'pic-token-encryption-key';

const encryptionKey = crypto.createHash('sha256').update(ENCRYPTION_SECRET).digest();

function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
    },
    ACCESS_TOKEN_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL },
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      type: 'refresh',
    },
    REFRESH_TOKEN_SECRET,
    { expiresIn: REFRESH_TOKEN_TTL },
  );
}

function encryptToken(token) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

function decryptToken(payload) {
  if (!payload) {
    throw new Error('Missing token payload');
  }
  const parts = payload.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token payload');
  }
  const [ivB64, tagB64, encB64] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encB64, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = {
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL,
  ACCESS_TOKEN_SECRET,
  REFRESH_TOKEN_SECRET,
  signAccessToken,
  signRefreshToken,
  encryptToken,
  decryptToken,
  hashToken,
};
