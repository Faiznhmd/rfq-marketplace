import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from 'node:crypto';
import { promisify } from 'node:util';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { registerSchema, loginSchema } from '../shared/validation.js';
import { parse, HttpError } from './errors.js';

const scrypt = promisify(scryptCallback);
const SESSION_AGE = 7 * 24 * 60 * 60 * 1000;
const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
const publicUser = (row) => ({ id: row.id, name: row.name, email: row.email, role: row.role });
const cookieOptions = (production) => ({
  httpOnly: true,
  secure: production,
  sameSite: 'lax',
  path: '/',
});
const cookieName = (production) => (production ? '__Host-rfq_session' : 'rfq_session');

async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const key = await scrypt(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}
async function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const key = await scrypt(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === key.length && timingSafeEqual(expected, key);
}

export function authentication(db, production) {
  return async (req, res, next) => {
    const token = req.cookies[cookieName(production)];
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token))
      throw new HttpError(401, 'Please log in to continue.');
    const { rows } = await db.query(
      `SELECT u.id, u.name, u.email, u.role FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at > CURRENT_TIMESTAMP`,
      [tokenHash(token)],
    );
    if (!rows[0]) throw new HttpError(401, 'Your session has expired. Please log in again.');
    req.user = publicUser(rows[0]);
    next();
  };
}
export const authorize = (role) => (req, res, next) => {
  if (req.user.role !== role)
    throw new HttpError(403, `This action is available to ${role.toLowerCase()}s only.`);
  next();
};

export function authRoutes(db, production) {
  const router = Router();
  const authenticate = authentication(db, production);
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
  });

  async function createSession(req, res, user) {
    const previous = req.cookies[cookieName(production)];
    if (typeof previous === 'string')
      await db.query('DELETE FROM sessions WHERE token_hash=$1', [tokenHash(previous)]);
    await db.query('DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP');
    const token = randomBytes(32).toString('hex');
    await db.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1,$2,$3)', [
      tokenHash(token),
      user.id,
      new Date(Date.now() + SESSION_AGE),
    ]);
    res.cookie(cookieName(production), token, {
      ...cookieOptions(production),
      maxAge: SESSION_AGE,
    });
  }

  router.post('/register', limiter, async (req, res) => {
    const data = parse(registerSchema, req.body);
    const passwordHash = await hashPassword(data.password);
    let user;
    try {
      const { rows } = await db.query(
        `INSERT INTO users (id,name,email,password_hash,role) VALUES ($1,$2,$3,$4,$5) RETURNING id,name,email,role`,
        [randomUUID(), data.name, data.email, passwordHash, data.role],
      );
      user = publicUser(rows[0]);
    } catch (error) {
      if (error.code === '23505')
        throw new HttpError(409, 'An account with this email already exists.', {
          email: 'This email is already registered.',
        });
      throw error;
    }
    await createSession(req, res, user);
    res.status(201).json({ user });
  });
  router.post('/login', limiter, async (req, res) => {
    const data = parse(loginSchema, req.body);
    const { rows } = await db.query('SELECT * FROM users WHERE email=$1', [data.email]);
    // Perform the same expensive hash even when the account does not exist.
    const dummy = `${'0'.repeat(32)}:${'0'.repeat(128)}`;
    const valid = await verifyPassword(data.password, rows[0]?.password_hash || dummy);
    if (!valid || !rows[0]) throw new HttpError(401, 'Email or password is incorrect.');
    const user = publicUser(rows[0]);
    await createSession(req, res, user);
    res.json({ user });
  });
  router.get('/me', authenticate, (req, res) => res.json({ user: req.user }));
  router.post('/logout', authenticate, async (req, res) => {
    await db.query('DELETE FROM sessions WHERE token_hash=$1', [
      tokenHash(req.cookies[cookieName(production)]),
    ]);
    res.clearCookie(cookieName(production), cookieOptions(production));
    res.status(204).end();
  });
  return router;
}
