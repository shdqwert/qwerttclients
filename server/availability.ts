// Доступность по модели «ресурс × время»: зона ресторана, мастер, корт, тип номера, сеанс.
import { addDays, addMonths, monthDays, nowInTz, toMin, weekday } from '../shared/dates.ts';
import { fromMin } from '../shared/dates.ts';
import type {
  Availability, DayState, EventConfig, HotelConfig, RestaurantConfig, SalonConfig, SportConfig,
} from '../shared/types.ts';
import type { PlaceDef } from './catalog.ts';
import type { Db } from './db.ts';

export const MAX_ADVANCE_DAYS = 90;
/** За сколько минут до начала ещё можно бронировать сегодняшний слот. */
const LEAD_MINUTES = 30;

export interface BusyRow {
  date: string;
  time: string | null;
  end_time: string | null;
  end_date: string | null;
  resource: string | null;
  units: number;
}

export interface AvailabilityOptions {
  service?: string;
  duration?: number;
  endDate?: string;
  /** Не учитывать эту бронь (при переносе). */
  excludeRef?: string;
}

export interface Engine {
  /** Демо-загрузка: имитирует брони, сделанные мимо сайта (по телефону, на месте). */
  demoLoad: boolean;
  now: () => Date;
}

/** Детерминированное псевдослучайное число 0..1 по строке. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

export function loadBusy(db: Db, slug: string, from: string, to: string, excludeRef?: string): BusyRow[] {
  return db.prepare(
    `SELECT date, time, end_time, end_date, resource, units FROM bookings
     WHERE place = ? AND status IN ('confirmed', 'pending') AND ref != ?
       AND date <= ? AND COALESCE(end_date, date) >= ?`,
  ).all(slug, excludeRef ?? '', to, from) as unknown as BusyRow[];
}

export function eventSessions(cfg: EventConfig, today: string, count = 6): string[] {
  const out: string[] = [];
  for (let i = 0; i <= MAX_ADVANCE_DAYS && out.length < count; i++) {
    const d = addDays(today, i);
    if (cfg.weekdays.includes(weekday(d))) out.push(d);
  }
  return out;
}

export function salonTimes(cfg: SalonConfig, minutes: number): string[] {
  const out: string[] = [];
  for (let m = toMin(cfg.open); m + minutes <= toMin(cfg.close); m += 30) out.push(fromMin(m));
  return out;
}

export function compute(place: PlaceDef, date: string, opts: AvailabilityOptions, rows: BusyRow[], eng: Engine): Availability {
  const now = nowInTz(eng.now());
  const out: Availability = { date, times: [], resources: [] };
  const tooFar = date > addDays(now.date, MAX_ADVANCE_DAYS);
  const past = date < now.date || tooFar;
  const startable = (t: string) => !past && (date > now.date || toMin(t) >= toMin(now.time) + LEAD_MINUTES);
  const demo = (key: string) => (eng.demoLoad ? hash(`${place.slug}|${key}`) : 1);
  // Примерно один день из шестнадцати площадка «занята полностью».
  const fullDay = eng.demoLoad && place.kind !== 'hotel' && place.kind !== 'event' && hash(`${place.slug}|day|${date}`) < 0.06;
  const day = rows.filter((r) => r.date === date);

  if (place.kind === 'restaurant') {
    const cfg = place.config as RestaurantConfig;
    out.times = cfg.periods.flatMap((p) => p.times);
    for (const area of cfg.areas) {
      const left: Record<string, number> = {};
      for (const t of out.times) {
        const walkIns = eng.demoLoad ? Math.floor(demo(`${date}|${area.id}|${t}`) ** 1.5 * (area.tables + 1)) : 0;
        const booked = day.filter((r) => r.resource === area.id && r.time === t).length;
        left[t] = startable(t) && !fullDay ? Math.max(0, area.tables - walkIns - booked) : 0;
      }
      out.resources.push({ id: area.id, left });
    }
  }

  if (place.kind === 'salon' || place.kind === 'sport') {
    let ids: string[];
    let minutes: number;
    let step: number;
    if (place.kind === 'salon') {
      const cfg = place.config as SalonConfig;
      minutes = (cfg.services.find((s) => s.id === opts.service) ?? cfg.services[0]!).minutes;
      out.times = salonTimes(cfg, minutes);
      ids = cfg.specialists.map((s) => s.id);
      step = 30;
    } else {
      const cfg = place.config as SportConfig;
      minutes = opts.duration ?? cfg.durations[0]!;
      const close = toMin(cfg.hours.at(-1)!) + 60;
      out.times = cfg.hours.filter((h) => toMin(h) + minutes <= close);
      ids = cfg.courts.map((c) => c.id);
      step = 60;
    }
    for (const id of ids) {
      const busy = day.filter((r) => r.resource === id && r.time && r.end_time).map((r) => [toMin(r.time!), toMin(r.end_time!)] as const);
      const left: Record<string, number> = {};
      for (const t of out.times) {
        const a = toMin(t);
        const b = a + minutes;
        let free = startable(t) && !fullDay && !busy.some(([s, e]) => s < b && e > a);
        // Демо-занятость считается по ячейкам сетки, которые перекрывает запрошенный интервал.
        for (let m = Math.floor(a / step) * step; free && m < b; m += step) {
          if (eng.demoLoad && demo(`${date}|${id}|${fromMin(m)}`) < 0.22) free = false;
        }
        left[t] = free ? 1 : 0;
      }
      out.resources.push({ id, left });
    }
  }

  if (place.kind === 'hotel') {
    const cfg = place.config as HotelConfig;
    const end = opts.endDate && opts.endDate > date ? opts.endDate : addDays(date, 1);
    for (const room of cfg.rooms) {
      let left = room.count;
      for (let night = date; night < end; night = addDays(night, 1)) {
        const walkIns = eng.demoLoad ? Math.floor(demo(`${night}|${room.id}`) ** 2 * (room.count + 1)) : 0;
        const booked = rows.filter((r) => r.resource === room.id && r.date <= night && (r.end_date ?? r.date) > night).reduce((n, r) => n + r.units, 0);
        left = Math.min(left, room.count - walkIns - booked);
      }
      out.resources.push({ id: room.id, left: { stay: past ? 0 : Math.max(0, left) } });
    }
  }

  if (place.kind === 'event') {
    const cfg = place.config as EventConfig;
    for (const session of eventSessions(cfg, now.date)) {
      const sold = eng.demoLoad ? Math.floor(demo(`${session}|sold`) * 1.15 * cfg.capacity) : 0;
      const booked = rows.filter((r) => r.date === session).reduce((n, r) => n + r.units, 0);
      const open = session > now.date || toMin(cfg.time) > toMin(now.time);
      out.resources.push({ id: session, left: { tickets: open ? Math.max(0, cfg.capacity - sold - booked) : 0 } });
    }
  }

  return out;
}

export function getAvailability(db: Db, place: PlaceDef, date: string, opts: AvailabilityOptions, eng: Engine): Availability {
  const to = place.kind === 'event' ? addDays(date, MAX_ADVANCE_DAYS) : opts.endDate ?? date;
  return compute(place, date, opts, loadBusy(db, place.slug, date, to, opts.excludeRef), eng);
}

const anyLeft = (a: Availability) => a.resources.some((r) => Object.values(r.left).some((n) => n > 0));

/** Состояния дней месяца для календаря. */
export function getCalendar(db: Db, place: PlaceDef, ym: string, opts: AvailabilityOptions, eng: Engine): Record<string, DayState> {
  const { days } = monthDays(ym);
  const today = nowInTz(eng.now()).date;
  const rows = loadBusy(db, place.slug, days[0]!, `${addMonths(ym, 1)}-01`);
  const out: Record<string, DayState> = {};
  for (const d of days) {
    if (d < today || d > addDays(today, MAX_ADVANCE_DAYS)) out[d] = 'off';
    else out[d] = anyLeft(compute(place, d, { ...opts, endDate: undefined }, rows, eng)) ? 'av' : 'full';
  }
  return out;
}

/** Ближайшие свободные сегодня слоты для карточек каталога. */
export function todaySlots(db: Db, place: PlaceDef, date: string, eng: Engine, limit = 3, around?: string): { time: string; left: number }[] {
  if (place.kind === 'hotel' || place.kind === 'event') return [];
  const a = getAvailability(db, place, date, {}, eng);
  const free = a.times
    .map((time) => ({ time, left: a.resources.reduce((n, r) => n + (r.left[time] ?? 0), 0) }))
    .filter((s) => s.left > 0);
  if (!around) return free.slice(0, limit);
  // Слоты вокруг запрошенного времени: ближайший раньше и следующие за ним.
  const target = toMin(around);
  const idx = Math.max(0, free.findIndex((s) => toMin(s.time) >= target) - 1);
  const start = free.findIndex((s) => toMin(s.time) >= target) === -1 ? Math.max(0, free.length - limit) : idx;
  return free.slice(start, start + limit);
}
