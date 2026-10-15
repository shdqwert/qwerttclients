// Кабинет бизнеса: расписание дня по ресурсам, показатели, заявки, ожидающие подтверждения.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { addDays, fmtShort, fromMin, nowInTz, toMin } from '../../shared/dates.ts';
import type { BusinessOverview, EventConfig, HotelConfig, RestaurantConfig, SalonConfig, SportConfig } from '../../shared/types.ts';
import { type Ctx, HttpError, iso, notify, parse, zDate, zPhone, zTime } from '../lib.ts';
import { applyOverride, type PlaceDef, placeBySlug, resetPlace, type VenueOverride } from '../catalog.ts';
import { type BookingRow, describe, noteData } from '../core.ts';
import { notifyWaitlist } from './bookings.ts';

function columns(p: PlaceDef): { id: string; name: string; capacity: number }[] {
  if (p.kind === 'restaurant') return (p.config as RestaurantConfig).areas.map((a) => ({ id: a.id, name: a.name, capacity: a.tables }));
  if (p.kind === 'salon') return (p.config as SalonConfig).specialists.map((s) => ({ id: s.id, name: s.name, capacity: 1 }));
  if (p.kind === 'sport') return (p.config as SportConfig).courts.map((c) => ({ id: c.id, name: c.name, capacity: 1 }));
  if (p.kind === 'hotel') return (p.config as HotelConfig).rooms.map((r) => ({ id: r.id, name: r.name, capacity: r.count }));
  return [{ id: 'event', name: (p.config as EventConfig).hall, capacity: (p.config as EventConfig).capacity }];
}

function hours(p: PlaceDef): string[] {
  const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => fromMin((from + i) * 60));
  if (p.kind === 'restaurant') {
    const times = (p.config as RestaurantConfig).periods.flatMap((x) => x.times).map(toMin);
    return range(Math.floor(Math.min(...times) / 60), Math.floor(Math.max(...times) / 60) + 1);
  }
  if (p.kind === 'salon') return range(toMin((p.config as SalonConfig).open) / 60, toMin((p.config as SalonConfig).close) / 60 - 1);
  if (p.kind === 'sport') return (p.config as SportConfig).hours;
  if (p.kind === 'event') return range(19, 22);
  return [];
}

export function businessRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;

  const venue = (req: FastifyRequest): PlaceDef => {
    const user = ctx.requireUser(req);
    const p = user.role === 'business' && user.business_place ? placeBySlug.get(user.business_place) : undefined;
    if (!p) throw new HttpError(403, 'not_business', 'This account does not manage a venue.');
    return p;
  };

  app.get('/business/overview', async (req): Promise<BusinessOverview> => {
    const p = venue(req);
    const today = nowInTz(ctx.eng.now()).date;
    const { date } = parse(z.object({ date: zDate.default(today) }), req.query);
    const active = (d: string) => db.prepare(
      "SELECT * FROM bookings WHERE place = ? AND status != 'cancelled' AND date <= ? AND COALESCE(end_date, date) >= ? ORDER BY time",
    ).all(p.slug, d, d) as unknown as BookingRow[];
    const rows = active(date);
    const lastWeek = active(addDays(date, -7)).length;
    const cols = columns(p);
    const grid = hours(p);
    // Загрузка: доля занятых «ресурс × час» (для отеля — занятых номеров).
    const capacity = p.kind === 'hotel' || p.kind === 'event'
      ? cols.reduce((n, c) => n + c.capacity, 0)
      : cols.reduce((n, c) => n + c.capacity, 0) * Math.max(1, grid.length);
    const used = rows.reduce((n, r) => n + (p.kind === 'hotel' || p.kind === 'event' ? r.units
      : r.time && r.end_time ? Math.max(1, (toMin(r.end_time) - toMin(r.time)) / 60) : 1.5), 0);
    const cancelledWeek = (db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE place = ? AND status = 'cancelled' AND date BETWEEN ? AND ?")
      .get(p.slug, addDays(date, -6), date) as { n: number }).n;
    const pending = db.prepare("SELECT * FROM bookings WHERE place = ? AND status = 'pending' AND COALESCE(end_date, date) >= ? ORDER BY created_at DESC")
      .all(p.slug, today) as unknown as BookingRow[];
    const title = (r: BookingRow) => (p.kind === 'restaurant' ? `Table for ${r.party} · ${fmtShort(r.date)} ${r.time}` : `${r.first_name} ${r.last_name} · ${describe(r)}`);
    return {
      place: { slug: p.slug, name: p.name, kind: p.kind },
      date,
      stats: {
        bookings: rows.length, bookingsDelta: rows.length - lastWeek,
        occupancy: Math.min(100, Math.round((used / capacity) * 100)),
        // У столиков нет цены брони: выручка оценивается как «гости × средний чек».
        revenue: Math.round(rows.reduce((n, r) => n + (r.total || (p.kind === 'restaurant' ? r.party * p.priceFrom : 0)), 0) * 100) / 100, cancelledWeek,
      },
      columns: cols.map(({ id, name }) => ({ id, name })),
      hours: grid,
      blocks: rows.filter((r) => r.time).map((r) => ({
        ref: r.ref, column: r.resource ?? 'event', start: r.time!,
        minutes: r.end_time ? toMin(r.end_time) - toMin(r.time!) : 90,
        label: `${r.last_name || r.first_name} · ${r.party}`, status: r.status,
      })),
      pending: pending.map((r) => ({ ref: r.ref, title: title(r), note: r.requests || `${r.first_name} ${r.last_name} · ${r.phone}`, createdAt: r.created_at })),
      list: rows.map((r) => ({ ref: r.ref, time: r.time, name: `${r.first_name} ${r.last_name}`, party: r.party, status: r.status, summary: describe(r) })),
    };
  });

  app.post('/business/bookings/:ref/decision', async (req) => {
    const p = venue(req);
    const { accept } = parse(z.object({ accept: z.boolean() }), req.body);
    const row = db.prepare("SELECT * FROM bookings WHERE ref = ? AND place = ? AND status = 'pending'")
      .get((req.params as { ref: string }).ref, p.slug) as unknown as BookingRow | undefined;
    if (!row) throw new HttpError(404, 'booking_not_found', 'This request is no longer pending.');
    db.prepare('UPDATE bookings SET status = ?, cancelled_at = ? WHERE id = ?')
      .run(accept ? 'confirmed' : 'cancelled', accept ? null : ctx.eng.now().toISOString(), row.id);
    notify(db, row.user_id, accept ? 'confirmed' : 'declined', 'bookings',
      accept ? `${p.name} confirmed your booking` : `${p.name} could not accept your booking`, describe(row), `/account/bookings/${row.ref}`, ctx.eng.now(), noteData(row));
    if (!accept) notifyWaitlist(ctx, row.place, row.date);
    return { ok: true };
  });

  // Неделя: сводка по дням.
  app.get('/business/week', async (req) => {
    const p = venue(req);
    const today = nowInTz(ctx.eng.now()).date;
    const { start } = parse(z.object({ start: zDate.optional() }), req.query);
    const monday = start ?? addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
    const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i)).map((date) => {
      const rows = db.prepare(
        "SELECT * FROM bookings WHERE place = ? AND status != 'cancelled' AND date <= ? AND COALESCE(end_date, date) >= ?",
      ).all(p.slug, date, date) as unknown as BookingRow[];
      return {
        date,
        bookings: rows.length,
        guests: rows.reduce((n, r) => n + r.party, 0),
        pending: rows.filter((r) => r.status === 'pending').length,
        revenue: Math.round(rows.reduce((n, r) => n + (r.total || (p.kind === 'restaurant' ? r.party * p.priceFrom : 0)), 0)),
        items: rows.slice(0, 6).map((r) => ({ ref: r.ref, time: r.time, name: `${r.first_name} ${r.last_name}`, party: r.party, status: r.status })),
      };
    });
    return { start: monday, days };
  });

  // Гости площадки, собранные из броней.
  app.get('/business/customers', async (req) => {
    const p = venue(req);
    const today = nowInTz(ctx.eng.now()).date;
    const rows = db.prepare(
      `SELECT lower(email) AS email, MAX(first_name || ' ' || last_name) AS name, MAX(phone) AS phone, COUNT(*) AS bookings,
         SUM(CASE WHEN COALESCE(end_date, date) < ? THEN 1 ELSE 0 END) AS visits,
         SUM(CASE WHEN COALESCE(end_date, date) >= ? THEN 1 ELSE 0 END) AS upcoming,
         MAX(date) AS last, SUM(total) AS spent
       FROM bookings WHERE place = ? AND status != 'cancelled' AND email != '' GROUP BY lower(email) ORDER BY bookings DESC, last DESC`,
    ).all(today, today, p.slug) as { email: string; name: string; phone: string; bookings: number; visits: number; upcoming: number; last: string; spent: number }[];
    return rows;
  });

  app.get('/business/reviews', async (req) => {
    const p = venue(req);
    return db.prepare('SELECT id, author, rating, text, created_at AS createdAt FROM reviews WHERE place = ? ORDER BY created_at DESC').all(p.slug);
  });

  // Настройки площадки: описание, контакты, правила и цены.
  const venueDto = (p: PlaceDef) => {
    const cfg = p.config as unknown as Record<string, { id: string; name: string; price?: number; tables?: number }[]>;
    const groups: Record<string, string> = { services: 'Services', rooms: 'Rooms', courts: (p.config as SportConfig).resourceLabel ? `${(p.config as SportConfig).resourceLabel}s` : 'Courts', tickets: 'Tickets' };
    return {
      slug: p.slug, name: p.name, kind: p.kind, about: p.about, phone: p.phone, openUntil: p.openUntil, policies: p.policies,
      instant: p.instant, cancelHours: p.cancelHours,
      items: Object.entries(groups).flatMap(([key, group]) => (cfg[key] ?? []).map((i) => ({ id: i.id, name: i.name, group, price: i.price ?? 0 }))),
      areas: (cfg.areas ?? []).map((a) => ({ id: a.id, name: a.name, tables: a.tables ?? 0 })),
    };
  };

  app.get('/business/venue', async (req) => venueDto(venue(req)));

  app.patch('/business/venue', async (req) => {
    const p = venue(req);
    const body = parse(z.object({
      about: z.string().trim().min(20, 'Write at least a couple of sentences').max(1000),
      phone: zPhone,
      openUntil: zTime,
      policies: z.string().trim().min(10, 'Describe the policy').max(1000),
      instant: z.boolean(),
      cancelHours: z.number().int().min(0).max(168),
      prices: z.record(z.string(), z.number().min(0).max(100000)),
      tables: z.record(z.string(), z.number().int().min(0).max(200)),
    }).partial(), req.body);
    const row = db.prepare('SELECT data FROM place_overrides WHERE place = ?').get(p.slug) as { data: string } | undefined;
    const prev = row ? (JSON.parse(row.data) as VenueOverride) : {};
    const next: VenueOverride = { ...prev, ...body, prices: { ...prev.prices, ...body.prices }, tables: { ...prev.tables, ...body.tables } };
    db.prepare('INSERT INTO place_overrides (place, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(place) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
      .run(p.slug, JSON.stringify(next), iso(ctx.eng.now()));
    resetPlace(p.slug);
    applyOverride(placeBySlug.get(p.slug)!, next);
    return venueDto(placeBySlug.get(p.slug)!);
  });
}
