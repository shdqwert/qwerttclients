// Брони: создание, список, детали, перенос, отмена, экспорт в календарь.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { addDays, nowInTz } from '../../shared/dates.ts';
import { quote } from '../../shared/pricing.ts';
import type { Booking, BookingInput, Selection } from '../../shared/types.ts';
import { type Ctx, HttpError, iso, notify, parse, zDate, zEmail, zPhone, zTime } from '../lib.ts';
import { placeBySlug } from '../catalog.ts';
import { type BookingRow, bookingDto, createBooking, describe, noteData, place, startInstant, sweepCompleted } from '../core.ts';
import { transaction } from '../db.ts';

const selectionSchema = z.object({
  service: z.string().optional(),
  specialist: z.string().optional(),
  duration: z.number().int().positive().optional(),
  room: z.string().optional(),
  rate: z.string().optional(),
  extras: z.array(z.string()).max(10).optional(),
  adults: z.number().int().min(1).max(20).optional(),
  children: z.number().int().min(0).max(20).optional(),
  rooms: z.number().int().min(1).max(10).optional(),
  tickets: z.record(z.string(), z.number().int().min(0).max(20)).optional(),
});

const inputSchema = z.object({
  slug: z.string(),
  date: zDate,
  time: zTime.optional(),
  endDate: zDate.optional(),
  party: z.number().int().min(1).max(50),
  resource: z.string().optional(),
  selection: selectionSchema,
  contact: z.object({
    firstName: z.string().trim().min(1, 'Enter your first name').max(60),
    lastName: z.string().trim().min(1, 'Enter your last name').max(60),
    phone: zPhone,
    email: zEmail,
  }),
  requests: z.string().trim().max(500).optional(),
  remind: z.boolean().default(true),
  agree: z.literal(true, { message: 'Accept the booking terms to continue' }),
});

/** Освободилось место: сообщаем всем, кто ждал этот день. */
export function notifyWaitlist(ctx: Ctx, slug: string, date: string) {
  const p = placeBySlug.get(slug);
  if (!p) return;
  const rows = ctx.db.prepare('SELECT id, user_id FROM waitlist WHERE place = ? AND date = ? AND notified_at IS NULL').all(slug, date) as { id: number; user_id: number | null }[];
  for (const w of rows) {
    notify(ctx.db, w.user_id, 'waitlist', 'bookings', `A spot opened up at ${p.name}`, `${date} · book before someone else does`,
      `/book/${slug}?date=${date}`, ctx.eng.now(), { place: p.name, kind: p.kind, date });
    ctx.db.prepare('UPDATE waitlist SET notified_at = ? WHERE id = ?').run(iso(ctx.eng.now()), w.id);
  }
}

export function bookingRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;

  /** Бронь доступна владельцу, держателю секретного ключа (гость) и аккаунту площадки. */
  const load = (req: FastifyRequest, write = false): BookingRow => {
    const { ref } = req.params as { ref: string };
    const { key } = req.query as { key?: string };
    const row = db.prepare('SELECT * FROM bookings WHERE ref = ?').get(ref.toUpperCase()) as unknown as BookingRow | undefined;
    const user = ctx.user(req);
    const owner = !!row && !!user && row.user_id === user.id;
    const guest = !!row && !!key && key === row.key;
    const venue = !!row && !!user && user.role === 'business' && user.business_place === row.place && !write;
    if (!row || !(owner || guest || venue)) throw new HttpError(404, 'booking_not_found', 'We could not find this booking.');
    return row;
  };

  app.post('/bookings', async (req, reply): Promise<Booking> => {
    const body = parse(inputSchema, req.body);
    const user = ctx.user(req);
    const row = createBooking(ctx, body as BookingInput, user?.id ?? null);
    return reply.status(201).send(bookingDto(ctx, row));
  });

  app.get('/bookings', async (req): Promise<{ upcoming: Booking[]; past: Booking[]; cancelled: Booking[] }> => {
    const user = ctx.requireUser(req);
    sweepCompleted(ctx);
    const rows = db.prepare('SELECT * FROM bookings WHERE user_id = ? ORDER BY date, time').all(user.id) as unknown as BookingRow[];
    const all = rows.map((r) => bookingDto(ctx, r));
    return {
      upcoming: all.filter((b) => b.status === 'confirmed' || b.status === 'pending'),
      past: all.filter((b) => b.status === 'completed').reverse(),
      cancelled: all.filter((b) => b.status === 'cancelled').reverse(),
    };
  });

  app.get('/bookings/:ref', async (req): Promise<Booking> => {
    sweepCompleted(ctx);
    return bookingDto(ctx, load(req));
  });

  app.patch('/bookings/:ref', async (req): Promise<Booking> => {
    const body = parse(z.object({ date: zDate.optional(), time: zTime.optional(), party: z.number().int().min(1).max(50).optional() }), req.body);
    const row = load(req, true);
    if (row.status !== 'confirmed' && row.status !== 'pending') throw new HttpError(409, 'not_changeable', 'This booking can no longer be changed.');
    if (row.kind === 'hotel' || row.kind === 'event') {
      throw new HttpError(400, 'not_changeable', 'To change this booking, cancel it and book again.');
    }
    const p = placeBySlug.get(row.place)!;
    const selection = JSON.parse(row.selection) as Selection;
    const updated = transaction(db, () => {
      const pl = place(ctx, p, {
        date: body.date ?? row.date, time: body.time ?? row.time ?? undefined, party: body.party ?? row.party,
        resource: row.resource ?? undefined, selection,
      }, row.ref);
      const date = body.date ?? row.date;
      const q = quote(p.kind, p.name, p.config, { date, time: pl.time ?? undefined, party: pl.party, resource: pl.resource ?? undefined, selection: pl.selection });
      db.prepare('UPDATE bookings SET date = ?, time = ?, end_time = ?, party = ?, resource = ?, selection = ?, summary = ?, price_lines = ?, total = ?, status = ? WHERE id = ?')
        .run(date, pl.time, q.endTime, pl.party, pl.resource, JSON.stringify(pl.selection), JSON.stringify(q.summary), JSON.stringify(q.priceLines), q.total, pl.status, row.id);
      return db.prepare('SELECT * FROM bookings WHERE id = ?').get(row.id) as unknown as BookingRow;
    });
    notify(db, updated.user_id, 'updated', 'bookings', `Booking at ${p.name} updated`, describe(updated), `/account/bookings/${updated.ref}`, ctx.eng.now(), noteData(updated));
    return bookingDto(ctx, updated);
  });

  app.post('/bookings/:ref/cancel', async (req): Promise<Booking> => {
    const row = load(req, true);
    if (row.status !== 'confirmed' && row.status !== 'pending') throw new HttpError(409, 'not_changeable', 'This booking is already closed.');
    db.prepare("UPDATE bookings SET status = 'cancelled', cancelled_at = ? WHERE id = ?").run(iso(ctx.eng.now()), row.id);
    const p = placeBySlug.get(row.place)!;
    notify(db, row.user_id, 'cancelled', 'bookings', `Booking at ${p.name} cancelled`, describe(row), `/account/bookings/${row.ref}`, ctx.eng.now(), noteData(row));
    notifyWaitlist(ctx, row.place, row.date);
    return bookingDto(ctx, db.prepare('SELECT * FROM bookings WHERE id = ?').get(row.id) as unknown as BookingRow);
  });

  app.get('/bookings/:ref/calendar.ics', async (req, reply) => {
    const row = load(req);
    const p = placeBySlug.get(row.place)!;
    const stamp = (d: Date) => iso(d).replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const start = startInstant(p, row.date, row.time);
    const end = row.end_date
      ? startInstant(p, row.end_date, '12:00')
      : row.end_time
        ? startInstant(p, row.end_time < (row.time ?? '') ? addDays(row.date, 1) : row.date, row.end_time)
        : new Date(start.getTime() + 2 * 3600000);
    const esc = (s: string) => s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//qwerttclients//Booking//EN', 'BEGIN:VEVENT',
      `UID:${row.ref}@qwerttclients`, `DTSTAMP:${stamp(ctx.eng.now())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
      `SUMMARY:${esc(`${p.name} · ${row.ref}`)}`, `LOCATION:${esc(`${p.address}, ${p.neighbourhood}, Tashkent`)}`,
      `DESCRIPTION:${esc(`${describe(row)}\nReference ${row.ref}`)}`, 'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    return reply.header('Content-Type', 'text/calendar; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${row.ref}.ics"`).send(ics);
  });

  // Напоминания: в день брони в ленте уведомлений появляется запись (SMS-шлюз не подключён).
  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/notifications')) return;
    const user = ctx.user(req);
    if (!user) return;
    const today = nowInTz(ctx.eng.now()).date;
    const due = db.prepare(
      `SELECT * FROM bookings b WHERE user_id = ? AND status = 'confirmed' AND remind = 1 AND date = ?
         AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id = b.user_id AND n.type = 'reminder' AND n.link = '/account/bookings/' || b.ref)`,
    ).all(user.id, today) as unknown as BookingRow[];
    for (const b of due) {
      notify(db, user.id, 'reminder', 'bookings', `Reminder: ${placeBySlug.get(b.place)!.name} today`, describe(b), `/account/bookings/${b.ref}`, ctx.eng.now(), noteData(b));
    }
  });
}
