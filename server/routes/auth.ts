// Регистрация, вход, выход, сброс пароля.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { verifyCode } from '../totp.ts';
import {
  type Ctx, DEFAULT_SETTINGS, HttpError, hashPassword, iso, parse, sha256, token, type UserRow, userDto, verifyPassword, zEmail, zPassword,
} from '../lib.ts';

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 10;
const RESET_MINUTES = 30;

export function authRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;
  const now = () => ctx.eng.now();
  // Счётчик неудачных входов по паре «email + IP».
  const attempts = new Map<string, { count: number; first: number }>();
  // Билеты второго шага входа: пароль уже проверен, ждём код из приложения.
  const tickets = new Map<string, { userId: number; expires: number; tries: number }>();

  const findByEmail = (email: string) => db.prepare('SELECT * FROM users WHERE email = ?').get(email) as unknown as UserRow | undefined;

  /** Брони, сделанные гостем на этот email, привязываются к аккаунту. */
  const claimGuestBookings = (u: UserRow) => {
    db.prepare('UPDATE bookings SET user_id = ? WHERE user_id IS NULL AND lower(email) = ?').run(u.id, u.email);
  };

  app.get('/auth/me', async (req) => {
    const u = ctx.user(req);
    return { user: u ? userDto(db, u) : null };
  });

  app.post('/auth/signup', async (req, reply) => {
    const body = parse(z.object({
      name: z.string().trim().min(2, 'Enter your full name').max(80),
      email: zEmail,
      password: zPassword,
      agree: z.literal(true, { message: 'Accept the terms to continue' }),
    }), req.body);
    if (findByEmail(body.email)) {
      throw new HttpError(409, 'email_exists', 'An account with this email already exists.', {
        fields: { email: 'An account with this email already exists. Log in instead?' },
      });
    }
    const [first, ...rest] = body.name.split(/\s+/);
    const at = iso(now());
    const res = db.prepare(
      'INSERT INTO users (email, password_hash, first_name, last_name, settings, created_at, password_changed_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(body.email, hashPassword(body.password), first!, rest.join(' '), JSON.stringify(DEFAULT_SETTINGS), at, at);
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(res.lastInsertRowid) as unknown as UserRow;
    claimGuestBookings(u);
    ctx.startSession(reply, u.id);
    return reply.status(201).send({ user: userDto(db, u) });
  });

  app.post('/auth/login', async (req, reply) => {
    const body = parse(z.object({ email: zEmail, password: z.string().min(1, 'Enter your password') }), req.body);
    const key = `${body.email}|${req.ip}`;
    const state = attempts.get(key);
    const t = now().getTime();
    if (state && t - state.first > LOCK_MINUTES * 60000) attempts.delete(key);
    const current = attempts.get(key);
    if (current && current.count >= MAX_ATTEMPTS) {
      const retryAfter = Math.max(1, Math.ceil((current.first + LOCK_MINUTES * 60000 - t) / 60000));
      throw new HttpError(429, 'rate_limited', `Try again in ${retryAfter} minutes or reset your password.`, { retryAfter });
    }
    const u = findByEmail(body.email);
    if (!u || !verifyPassword(body.password, u.password_hash)) {
      attempts.set(key, { count: (current?.count ?? 0) + 1, first: current?.first ?? t });
      throw new HttpError(401, 'bad_credentials', 'Incorrect email or password');
    }
    attempts.delete(key);
    if (u.totp_enabled) {
      const ticket = token(24);
      tickets.set(ticket, { userId: u.id, expires: t + 5 * 60000, tries: 0 });
      return { twoFactor: true, ticket };
    }
    claimGuestBookings(u);
    ctx.startSession(reply, u.id);
    return { user: userDto(db, u) };
  });

  app.post('/auth/login/2fa', async (req, reply) => {
    const body = parse(z.object({ ticket: z.string(), code: z.string().min(1, 'Enter the 6-digit code') }), req.body);
    const tk = tickets.get(body.ticket);
    if (!tk || tk.expires < now().getTime() || tk.tries >= 5) {
      tickets.delete(body.ticket);
      throw new HttpError(400, 'ticket_expired', 'The sign-in step expired. Enter your password again.');
    }
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(tk.userId) as unknown as UserRow;
    if (!u.totp_secret || !verifyCode(u.totp_secret, body.code, now().getTime())) {
      tk.tries++;
      throw new HttpError(400, 'validation', 'This code is not valid', { fields: { code: 'This code is not valid' } });
    }
    tickets.delete(body.ticket);
    claimGuestBookings(u);
    ctx.startSession(reply, u.id);
    return { user: userDto(db, u) };
  });

  app.post('/auth/logout', async (req, reply) => {
    ctx.endSession(req, reply);
    return { ok: true };
  });

  app.post('/auth/forgot', async (req) => {
    const { email } = parse(z.object({ email: zEmail }), req.body);
    const u = findByEmail(email);
    // Ответ одинаков для существующих и несуществующих адресов.
    const out: { ok: true; expiresInMinutes: number; devLink?: string } = { ok: true, expiresInMinutes: RESET_MINUTES };
    if (u) {
      const raw = token();
      db.prepare('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
        .run(sha256(raw), u.id, iso(new Date(now().getTime() + RESET_MINUTES * 60000)));
      const link = `/reset?token=${raw}`;
      // Почтовый сервис не подключён: вне production ссылка возвращается в ответе и пишется в лог.
      if (!ctx.cfg.production) out.devLink = link;
      console.log(`[auth] password reset link for ${u.email}: ${link}`);
    }
    return out;
  });

  app.post('/auth/reset', async (req, reply) => {
    const body = parse(z.object({ token: z.string().min(10), password: zPassword }), req.body);
    const row = db.prepare('SELECT user_id, expires_at, used FROM password_resets WHERE token_hash = ?').get(sha256(body.token)) as
      { user_id: number; expires_at: string; used: number } | undefined;
    if (!row || row.used || Date.parse(row.expires_at) < now().getTime()) {
      throw new HttpError(400, 'reset_invalid', 'This reset link is invalid or has expired. Request a new one.');
    }
    db.prepare('UPDATE password_resets SET used = 1 WHERE token_hash = ?').run(sha256(body.token));
    db.prepare('UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?').run(hashPassword(body.password), iso(now()), row.user_id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id);
    ctx.startSession(reply, row.user_id);
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id) as unknown as UserRow;
    return { user: userDto(db, u) };
  });
}
