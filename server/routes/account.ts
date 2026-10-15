// Аккаунт: профиль, пароль, настройки, сохранённые места, уведомления.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { nowInTz } from '../../shared/dates.ts';
import type { Notification } from '../../shared/types.ts';
import {
  type Ctx, COOKIE, HttpError, normalizeSettings, hashPassword, iso, parse, sha256, type UserRow, userDto, verifyPassword, zEmail, zPassword, zPhone,
} from '../lib.ts';
import { placeBySlug } from '../catalog.ts';

export function accountRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;
  const fresh = (id: number) => userDto(db, db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow);

  app.patch('/me', async (req) => {
    const user = ctx.requireUser(req);
    const body = parse(z.object({
      firstName: z.string().trim().min(1, 'Enter your first name').max(60),
      lastName: z.string().trim().max(60),
      email: zEmail,
      phone: z.union([z.literal(''), zPhone]),
    }), req.body);
    if (body.email !== user.email && db.prepare('SELECT 1 FROM users WHERE email = ?').get(body.email)) {
      throw new HttpError(409, 'email_exists', 'This email is already used by another account.', { fields: { email: 'This email is already used by another account.' } });
    }
    db.prepare('UPDATE users SET first_name = ?, last_name = ?, email = ?, phone = ? WHERE id = ?')
      .run(body.firstName, body.lastName, body.email, body.phone, user.id);
    return { user: fresh(user.id) };
  });

  app.patch('/me/settings', async (req) => {
    const user = ctx.requireUser(req);
    const body = parse(z.object({
      notifyUpdates: z.boolean(), notifyReminders: z.boolean(), notifyOffers: z.boolean(),
      language: z.enum(['en', 'ru', 'uz']), currency: z.enum(['USD']),
    }).partial(), req.body);
    const next = { ...normalizeSettings(JSON.parse(user.settings)), ...body };
    db.prepare('UPDATE users SET settings = ? WHERE id = ?').run(JSON.stringify(next), user.id);
    return { user: fresh(user.id) };
  });

  app.post('/me/password', async (req) => {
    const user = ctx.requireUser(req);
    const body = parse(z.object({ current: z.string().min(1, 'Enter your current password'), password: zPassword }), req.body);
    if (!verifyPassword(body.current, user.password_hash)) {
      throw new HttpError(400, 'validation', 'Current password is incorrect.', { fields: { current: 'Current password is incorrect.' } });
    }
    db.prepare('UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?').run(hashPassword(body.password), iso(ctx.eng.now()), user.id);
    return { user: fresh(user.id) };
  });

  app.post('/me/sessions/revoke-others', async (req) => {
    const user = ctx.requireUser(req);
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(user.id, sha256(req.cookies[COOKIE] ?? ''));
    return { user: fresh(user.id) };
  });

  app.delete('/me', async (req, reply) => {
    const user = ctx.requireUser(req);
    const body = parse(z.object({ password: z.string().min(1, 'Enter your password') }), req.body);
    if (!verifyPassword(body.password, user.password_hash)) {
      throw new HttpError(400, 'validation', 'Password is incorrect.', { fields: { password: 'Password is incorrect.' } });
    }
    // Предстоящие брони освобождаются, история обезличивается.
    db.prepare("UPDATE bookings SET status = 'cancelled', cancelled_at = ? WHERE user_id = ? AND status IN ('confirmed', 'pending')").run(iso(ctx.eng.now()), user.id);
    db.prepare("UPDATE bookings SET first_name = 'Deleted', last_name = 'user', phone = '', email = '', requests = '' WHERE user_id = ?").run(user.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/me/stats', async (req) => {
    const user = ctx.requireUser(req);
    const today = nowInTz(ctx.eng.now()).date;
    const n = (sql: string, ...args: (string | number)[]) => (db.prepare(sql).get(...args) as { n: number }).n;
    return {
      upcoming: n("SELECT COUNT(*) AS n FROM bookings WHERE user_id = ? AND status IN ('confirmed', 'pending') AND COALESCE(end_date, date) >= ?", user.id, today),
      past: n("SELECT COUNT(*) AS n FROM bookings WHERE user_id = ? AND (status = 'completed' OR (status = 'confirmed' AND COALESCE(end_date, date) < ?))", user.id, today),
      saved: n('SELECT COUNT(*) AS n FROM saved WHERE user_id = ?', user.id),
      unread: n('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0', user.id),
    };
  });

  app.get('/saved', async (req) => {
    const user = ctx.requireUser(req);
    const rows = db.prepare('SELECT place FROM saved WHERE user_id = ? ORDER BY created_at DESC').all(user.id) as { place: string }[];
    return rows.map((r) => r.place).filter((s) => placeBySlug.has(s));
  });

  app.put('/saved/:slug', async (req) => {
    const user = ctx.requireUser(req);
    const { slug } = req.params as { slug: string };
    if (!placeBySlug.has(slug)) throw new HttpError(404, 'place_not_found', 'This place does not exist.');
    db.prepare('INSERT OR IGNORE INTO saved (user_id, place, created_at) VALUES (?, ?, ?)').run(user.id, slug, iso(ctx.eng.now()));
    return { saved: true };
  });

  app.delete('/saved/:slug', async (req) => {
    const user = ctx.requireUser(req);
    db.prepare('DELETE FROM saved WHERE user_id = ? AND place = ?').run(user.id, (req.params as { slug: string }).slug);
    return { saved: false };
  });

  app.get('/notifications', async (req): Promise<Notification[]> => {
    const user = ctx.requireUser(req);
    const rows = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 100').all(user.id) as
      { id: number; type: Notification['type']; grp: Notification['group']; title: string; body: string; link: string | null; created_at: string; read: number; data: string | null }[];
    return rows.map((r) => ({ id: r.id, type: r.type, group: r.grp, title: r.title, body: r.body, link: r.link, createdAt: r.created_at, read: !!r.read, data: r.data ? JSON.parse(r.data) : null }));
  });

  app.post('/notifications/read', async (req) => {
    const user = ctx.requireUser(req);
    const body = parse(z.object({ id: z.number().int().optional() }), req.body ?? {});
    if (body.id) db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND id = ?').run(user.id, body.id);
    else db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(user.id);
    return { ok: true };
  });
}
