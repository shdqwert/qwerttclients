// Ядро бронирования: проверка выбора, атомарное создание брони, преобразование строк базы в ответ API.
import { randomInt } from 'node:crypto';
import { addDays, diffDays, fmtShort, nowInTz, plural } from '../shared/dates.ts';
import { quote, seatsFor, ticketCount } from '../shared/pricing.ts';
import type {
  Booking, BookingInput, BookingStatus, EventConfig, HotelConfig, Kind, RestaurantConfig, SalonConfig, Selection, SportConfig,
} from '../shared/types.ts';
import { type Ctx, HttpError, iso, notify, token } from './lib.ts';
import { eventSessions, getAvailability, MAX_ADVANCE_DAYS } from './availability.ts';
import { type PlaceDef, placeBySlug } from './catalog.ts';
import { transaction } from './db.ts';

export interface BookingRow {
  id: number;
  ref: string;
  key: string;
  user_id: number | null;
  place: string;
  kind: Kind;
  status: BookingStatus;
  date: string;
  time: string | null;
  end_time: string | null;
  end_date: string | null;
  party: number;
  units: number;
  resource: string | null;
  selection: string;
  summary: string;
  price_lines: string;
  total: number;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  requests: string;
  remind: number;
  created_at: string;
  cancelled_at: string | null;
}

/** Момент начала брони. Площадки работают по времени Ташкента (UTC+5, без перехода на летнее время). */
export function startInstant(p: PlaceDef, date: string, time: string | null): Date {
  const t = time ?? (p.kind === 'hotel' ? (p.config as HotelConfig).checkIn : p.kind === 'event' ? (p.config as EventConfig).time : '00:00');
  return new Date(`${date}T${t}:00+05:00`);
}

export function bookingDto(ctx: Ctx, r: BookingRow): Booking {
  const p = placeBySlug.get(r.place)!;
  const selection = JSON.parse(r.selection) as Selection;
  const until = new Date(startInstant(p, r.date, r.time).getTime() - p.cancelHours * 3600000);
  const local = nowInTz(until);
  return {
    ref: r.ref, key: r.key, status: r.status, kind: r.kind, date: r.date, time: r.time, endTime: r.end_time, endDate: r.end_date,
    party: r.party, resource: r.resource, selection, summary: JSON.parse(r.summary), priceLines: JSON.parse(r.price_lines),
    total: r.total, contact: { firstName: r.first_name, lastName: r.last_name, phone: r.phone, email: r.email },
    requests: r.requests, createdAt: r.created_at, cancelUntil: `${fmtShort(local.date)}, ${local.time}`,
    canCancelFree: selection.rate !== 'advance' && until.getTime() > ctx.eng.now().getTime(),
    place: {
      slug: p.slug, name: p.name, category: p.category, kind: p.kind, subtitle: p.subtitle, address: p.address,
      neighbourhood: p.neighbourhood, color: p.color, icon: p.icon, phone: p.phone,
    },
  };
}

/** Подтверждённые брони, дата которых прошла, становятся завершёнными. */
export function sweepCompleted(ctx: Ctx) {
  ctx.db.prepare("UPDATE bookings SET status = 'completed' WHERE status = 'confirmed' AND COALESCE(end_date, date) < ?")
    .run(nowInTz(ctx.eng.now()).date);
}

const taken = (what: string) => new HttpError(409, 'slot_taken', `${what} was just booked. Pick another option.`);
const invalid = (message: string, field = '_') => new HttpError(400, 'validation', message, { fields: { [field]: message } });

export interface Placement {
  resource: string | null;
  time: string | null;
  endTime: string | null;
  endDate: string | null;
  party: number;
  units: number;
  selection: Selection;
  status: BookingStatus;
}

/** Проверяет выбор гостя и свободность ресурса. Вызывается внутри транзакции. */
export function place(ctx: Ctx, p: PlaceDef, input: Pick<BookingInput, 'date' | 'time' | 'endDate' | 'party' | 'resource' | 'selection'>, excludeRef?: string): Placement {
  const today = nowInTz(ctx.eng.now()).date;
  if (input.date < today) throw invalid('This date is in the past.', 'date');
  if (input.date > addDays(today, MAX_ADVANCE_DAYS)) throw invalid(`Bookings open ${MAX_ADVANCE_DAYS} days ahead.`, 'date');
  const sel = input.selection;
  const avail = (opts: { service?: string; duration?: number; endDate?: string }) =>
    getAvailability(ctx.db, p, input.date, { ...opts, excludeRef }, ctx.eng);
  const out: Placement = {
    resource: input.resource ?? null, time: input.time ?? null, endTime: null, endDate: null,
    party: input.party, units: 1, selection: {}, status: p.instant ? 'confirmed' : 'pending',
  };

  if (p.kind === 'restaurant') {
    const cfg = p.config as RestaurantConfig;
    if (!input.time || !cfg.periods.some((x) => x.times.includes(input.time!))) throw invalid('Choose a time.', 'time');
    if (input.party < 1 || input.party > cfg.maxParty) throw invalid(`Tables seat up to ${cfg.maxParty}.`, 'party');
    const area = cfg.areas.find((a) => a.id === input.resource);
    if (!area) throw invalid('Choose a seating area.', 'resource');
    const left = avail({}).resources.find((r) => r.id === area.id)!.left[input.time] ?? 0;
    if (left < 1) throw taken(input.time);
    // Большие компании ресторан подтверждает вручную.
    if (input.party >= 8) out.status = 'pending';
  }

  if (p.kind === 'salon') {
    const cfg = p.config as SalonConfig;
    const service = cfg.services.find((s) => s.id === sel.service);
    if (!service) throw invalid('Choose a service.', 'service');
    if (!input.time) throw invalid('Choose a time.', 'time');
    const a = avail({ service: service.id });
    if (!a.times.includes(input.time)) throw invalid('Choose a time.', 'time');
    const wanted = sel.specialist && sel.specialist !== 'any' ? cfg.specialists.find((s) => s.id === sel.specialist) : null;
    if (sel.specialist && sel.specialist !== 'any' && !wanted) throw invalid('Choose a specialist.', 'specialist');
    const free = a.resources.filter((r) => (r.left[input.time!] ?? 0) > 0 && (!wanted || r.id === wanted.id));
    if (!free.length) throw taken(input.time);
    out.resource = free[0]!.id;
    out.selection = { service: service.id, specialist: out.resource };
    out.party = 1;
  }

  if (p.kind === 'sport') {
    const cfg = p.config as SportConfig;
    const court = cfg.courts.find((c) => c.id === input.resource);
    if (!court) throw invalid(`Choose a ${cfg.resourceLabel.toLowerCase()}.`, 'resource');
    const duration = sel.duration ?? cfg.durations[0]!;
    if (!cfg.durations.includes(duration)) throw invalid('Choose a duration.', 'duration');
    const a = avail({ duration });
    if (!input.time || !a.times.includes(input.time)) throw invalid('Choose a start time.', 'time');
    if ((a.resources.find((r) => r.id === court.id)!.left[input.time] ?? 0) < 1) throw taken(input.time);
    out.selection = { duration };
    out.party = Math.max(1, input.party);
  }

  if (p.kind === 'hotel') {
    const cfg = p.config as HotelConfig;
    if (!input.endDate || input.endDate <= input.date) throw invalid('Choose your check-out date.', 'endDate');
    const nights = diffDays(input.date, input.endDate);
    if (nights < cfg.minNights) throw invalid(`Minimum stay is ${plural(cfg.minNights, 'night')}.`, 'endDate');
    if (nights > 30) throw invalid('Stays are limited to 30 nights.', 'endDate');
    const room = cfg.rooms.find((r) => r.id === sel.room);
    if (!room) throw invalid('Choose a room.', 'room');
    const rate = cfg.rates.find((r) => r.id === sel.rate) ?? cfg.rates[0]!;
    const adults = sel.adults ?? 2;
    const children = sel.children ?? 0;
    const rooms = sel.rooms ?? 1;
    if (adults < 1 || children < 0 || rooms < 1) throw invalid('Check the number of guests.', 'party');
    if (adults + children > room.sleeps * rooms) throw invalid(`${room.name} sleeps up to ${room.sleeps} per room.`, 'room');
    const left = avail({ endDate: input.endDate }).resources.find((r) => r.id === room.id)!.left.stay ?? 0;
    if (left < rooms) throw taken(room.name);
    const extras = (sel.extras ?? []).filter((id) => cfg.extras.some((e) => e.id === id));
    out.resource = room.id;
    out.time = null;
    out.endDate = input.endDate;
    out.units = rooms;
    out.party = adults + children;
    out.selection = { room: room.id, rate: rate.id, extras, adults, children, rooms };
  }

  if (p.kind === 'event') {
    const cfg = p.config as EventConfig;
    if (!eventSessions(cfg, today).includes(input.date)) throw invalid('Choose a date.', 'date');
    const tickets: Record<string, number> = {};
    for (const t of cfg.tickets) {
      const n = Math.floor(sel.tickets?.[t.id] ?? 0);
      if (n > 0) tickets[t.id] = n;
    }
    const count = ticketCount({ tickets });
    if (count < 1) throw invalid('Add at least one ticket.', 'tickets');
    if (count > cfg.maxTickets) throw invalid(`Max ${cfg.maxTickets} tickets per order.`, 'tickets');
    const seats = seatsFor(cfg, { tickets });
    const left = avail({}).resources.find((r) => r.id === input.date)?.left.tickets ?? 0;
    if (left < seats) throw new HttpError(409, 'slot_taken', left > 0 ? `Only ${left} places are left for this date.` : 'This date just sold out.');
    out.resource = null;
    out.time = cfg.time;
    out.units = seats;
    out.party = seats;
    out.selection = { tickets };
  }

  return out;
}

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newRef = () => `QW-${Array.from({ length: 5 }, () => REF_ALPHABET[randomInt(REF_ALPHABET.length)]).join('')}`;

export function createBooking(ctx: Ctx, input: BookingInput, userId: number | null, createdAt = ctx.eng.now()): BookingRow {
  const p = placeBySlug.get(input.slug);
  if (!p) throw new HttpError(404, 'place_not_found', 'This place does not exist.');
  return transaction(ctx.db, () => {
    const pl = place(ctx, p, input);
    const q = quote(p.kind, p.name, p.config, { date: input.date, time: pl.time ?? undefined, endDate: pl.endDate ?? undefined, party: pl.party, resource: pl.resource ?? undefined, selection: pl.selection });
    let ref = newRef();
    while (ctx.db.prepare('SELECT 1 FROM bookings WHERE ref = ?').get(ref)) ref = newRef();
    ctx.db.prepare(
      `INSERT INTO bookings (ref, key, user_id, place, kind, status, date, time, end_time, end_date, party, units, resource, selection,
         summary, price_lines, total, first_name, last_name, phone, email, requests, remind, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      ref, token(18), userId, p.slug, p.kind, pl.status, input.date, pl.time, q.endTime, pl.endDate, pl.party, pl.units, pl.resource,
      JSON.stringify(pl.selection), JSON.stringify(q.summary), JSON.stringify(q.priceLines), q.total,
      input.contact.firstName, input.contact.lastName, input.contact.phone, input.contact.email.toLowerCase(),
      input.requests ?? '', input.remind ? 1 : 0, iso(createdAt),
    );
    const row = ctx.db.prepare('SELECT * FROM bookings WHERE ref = ?').get(ref) as unknown as BookingRow;
    notify(ctx.db, userId, pl.status === 'confirmed' ? 'confirmed' : 'booking', 'bookings',
      pl.status === 'confirmed' ? `Booking confirmed at ${p.name}` : `Request sent to ${p.name}`, describe(row), `/account/bookings/${ref}`, createdAt, noteData(row));
    return row;
  });
}

/** Данные брони для локализованного текста уведомления. */
export function noteData(r: Pick<BookingRow, 'place' | 'kind' | 'date' | 'time' | 'end_date' | 'party'>) {
  return { place: placeBySlug.get(r.place)?.name ?? r.place, kind: r.kind, date: r.date, time: r.time, endDate: r.end_date, party: r.party };
}

/** Короткая строка «когда и сколько» для списков и уведомлений. */
export function describe(r: Pick<BookingRow, 'kind' | 'date' | 'time' | 'end_date' | 'party'>): string {
  if (r.kind === 'hotel' && r.end_date) {
    return `${fmtShort(r.date)} – ${fmtShort(r.end_date)} · ${plural(diffDays(r.date, r.end_date), 'night')} · ${plural(r.party, 'guest')}`;
  }
  const who = r.kind === 'event' ? plural(r.party, 'ticket') : r.kind === 'salon' ? '' : plural(r.party, 'guest');
  return [fmtShort(r.date), r.time, who].filter(Boolean).join(' · ');
}
