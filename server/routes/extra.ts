// Обращения в поддержку, заявки площадок, лист ожидания, фото профиля, двухфакторный вход.
import type { FastifyInstance } from 'fastify';
import QRCode from 'qrcode';
import { z } from 'zod';
import { nowInTz } from '../../shared/dates.ts';
import { NEIGHBOURHOODS, placeBySlug } from '../catalog.ts';
import { type Ctx, HttpError, iso, parse, type UserRow, userDto, verifyPassword, zDate, zEmail, zPhone } from '../lib.ts';
import { newSecret, otpauthUrl, verifyCode } from '../totp.ts';

const MAX_AVATAR = 400_000;

export function extraRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;
  const fresh = (id: number) => userDto(db, db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow);

  app.post('/contact', async (req, reply) => {
    const body = parse(z.object({
      name: z.string().trim().min(2, 'Enter your name').max(80),
      email: zEmail,
      topic: z.enum(['booking', 'account', 'business', 'other']),
      message: z.string().trim().min(10, 'Write at least a sentence').max(2000),
    }), req.body);
    db.prepare('INSERT INTO contact_messages (user_id, name, email, topic, message, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(ctx.user(req)?.id ?? null, body.name, body.email, body.topic, body.message, iso(ctx.eng.now()));
    return reply.status(201).send({ ok: true });
  });

  app.post('/partners', async (req, reply) => {
    const body = parse(z.object({
      business: z.string().trim().min(2, 'Enter the business name').max(120),
      category: z.enum(['restaurants', 'cafes', 'beauty', 'wellness', 'hotels', 'sports', 'events', 'health', 'coworking']),
      contactName: z.string().trim().min(2, 'Enter your name').max(80),
      email: zEmail,
      phone: zPhone,
      neighbourhood: z.enum(NEIGHBOURHOODS as [string, ...string[]]),
      message: z.string().trim().max(2000).default(''),
    }), req.body);
    db.prepare('INSERT INTO partner_requests (business, category, contact_name, email, phone, neighbourhood, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(body.business, body.category, body.contactName, body.email, body.phone, body.neighbourhood, body.message, iso(ctx.eng.now()));
    return reply.status(201).send({ ok: true });
  });

  // Лист ожидания: когда на этот день освобождается место, ожидающие получают уведомление.
  app.post('/waitlist', async (req, reply) => {
    const user = ctx.user(req);
    const body = parse(z.object({ slug: z.string(), date: zDate, email: zEmail.optional() }), req.body);
    if (!placeBySlug.has(body.slug)) throw new HttpError(404, 'place_not_found', 'This place does not exist.');
    if (body.date < nowInTz(ctx.eng.now()).date) throw new HttpError(400, 'validation', 'This date is in the past.');
    const email = user?.email ?? body.email;
    if (!email) throw new HttpError(400, 'validation', 'Enter your email', { fields: { email: 'Enter your email' } });
    db.prepare('INSERT OR IGNORE INTO waitlist (user_id, email, place, date, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(user?.id ?? null, email, body.slug, body.date, iso(ctx.eng.now()));
    return reply.status(201).send({ ok: true });
  });

  app.put('/me/avatar', async (req) => {
    const user = ctx.requireUser(req);
    const { image } = parse(z.object({ image: z.string() }), req.body);
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) throw new HttpError(400, 'validation', 'Use a PNG, JPEG or WebP image.');
    if (image.length > MAX_AVATAR) throw new HttpError(413, 'too_large', 'The image is too large. Use one under 300 KB.');
    db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(image, user.id);
    return { user: fresh(user.id) };
  });

  app.delete('/me/avatar', async (req) => {
    const user = ctx.requireUser(req);
    db.prepare('UPDATE users SET avatar = NULL WHERE id = ?').run(user.id);
    return { user: fresh(user.id) };
  });

  app.post('/me/2fa/setup', async (req) => {
    const user = ctx.requireUser(req);
    if (user.totp_enabled) throw new HttpError(409, 'already_enabled', 'Two-step verification is already on.');
    const secret = newSecret();
    db.prepare('UPDATE users SET totp_pending = ? WHERE id = ?').run(secret, user.id);
    const url = otpauthUrl(secret, user.email);
    return { secret, url, qr: await QRCode.toString(url, { type: 'svg', margin: 1, width: 180 }) };
  });

  app.post('/me/2fa/enable', async (req) => {
    const user = ctx.requireUser(req);
    const { code } = parse(z.object({ code: z.string() }), req.body);
    if (!user.totp_pending) throw new HttpError(400, 'no_setup', 'Start the setup again.');
    if (!verifyCode(user.totp_pending, code, ctx.eng.now().getTime())) {
      throw new HttpError(400, 'validation', 'This code is not valid. Check the time on your phone and try again.', { fields: { code: 'This code is not valid' } });
    }
    db.prepare('UPDATE users SET totp_secret = totp_pending, totp_pending = NULL, totp_enabled = 1 WHERE id = ?').run(user.id);
    return { user: fresh(user.id) };
  });

  app.post('/me/2fa/disable', async (req) => {
    const user = ctx.requireUser(req);
    const { password } = parse(z.object({ password: z.string().min(1, 'Enter your password') }), req.body);
    if (!verifyPassword(password, user.password_hash)) {
      throw new HttpError(400, 'validation', 'Password is incorrect.', { fields: { password: 'Password is incorrect.' } });
    }
    db.prepare('UPDATE users SET totp_secret = NULL, totp_pending = NULL, totp_enabled = 0 WHERE id = ?').run(user.id);
    return { user: fresh(user.id) };
  });
}
