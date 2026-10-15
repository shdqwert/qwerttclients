// Расчёт сводки и стоимости брони. Одна и та же функция работает на сервере (источник правды)
// и на фронтенде (мгновенный предпросмотр в липкой сводке).
import { diffDays, fmtRange, fmtShort, fromMin, plural, toMin } from './dates.ts';
import { tx } from './i18n.ts';
import type {
  EventConfig, HotelConfig, Kind, Line, PlaceConfig, RestaurantConfig, SalonConfig, Selection, SportConfig,
} from './types.ts';

export interface QuoteInput {
  date?: string;
  time?: string;
  endDate?: string;
  party: number;
  resource?: string;
  selection: Selection;
}

export interface Quote {
  summary: Line[];
  priceLines: Line[];
  total: number;
  totalLabel: string;
  endTime: string | null;
  /** Чего не хватает, чтобы перейти дальше; null — выбор полный. */
  missing: string | null;
}

export const money = (n: number) => (Number.isInteger(n) ? `$${n.toLocaleString('en-US')}` : `$${n.toFixed(2)}`);

const round2 = (n: number) => Math.round(n * 100) / 100;

export function ticketCount(sel: Selection): number {
  return Object.values(sel.tickets ?? {}).reduce((a, b) => a + b, 0);
}

export function quote(kind: Kind, placeName: string, cfg: PlaceConfig, q: QuoteInput): Quote {
  const out: Quote = { summary: [], priceLines: [], total: 0, totalLabel: 'Total', endTime: null, missing: null };
  const sel = q.selection;
  const dateLine = () => q.date && out.summary.push({ label: tx('Date'), value: fmtShort(q.date) });

  if (kind === 'restaurant') {
    const c = cfg as RestaurantConfig;
    const area = c.areas.find((a) => a.id === q.resource);
    dateLine();
    if (q.time) out.summary.push({ label: tx('Time'), value: q.time });
    out.summary.push({ label: tx('Guests'), value: plural(q.party, 'person', 'people') });
    if (area) out.summary.push({ label: tx('Seating'), value: tx(area.name) });
    out.missing = !q.date ? tx('Choose a date') : !q.time ? tx('Choose a time') : !area ? tx('Choose a seating area') : null;
  }

  if (kind === 'salon') {
    const c = cfg as SalonConfig;
    const service = c.services.find((s) => s.id === sel.service);
    const spec = c.specialists.find((s) => s.id === sel.specialist);
    if (service) out.summary.push({ label: tx('Service'), value: tx(service.name) });
    out.summary.push({ label: tx('Specialist'), value: spec ? spec.name : tx('Any specialist') });
    if (service && !q.time) out.summary.push({ label: tx('Duration'), value: tx('{n} min', { n: service.minutes }) });
    dateLine();
    if (service && q.time) {
      out.endTime = fromMin(toMin(q.time) + service.minutes);
      out.summary.push({ label: tx('Time'), value: `${q.time} – ${out.endTime}` });
    }
    out.total = service?.price ?? 0;
    out.missing = !service ? tx('Choose a service') : !q.date || !q.time ? tx('Choose a date and time') : null;
  }

  if (kind === 'hotel') {
    const c = cfg as HotelConfig;
    const adults = sel.adults ?? 2;
    const children = sel.children ?? 0;
    const rooms = sel.rooms ?? 1;
    const nights = q.date && q.endDate ? diffDays(q.date, q.endDate) : 0;
    const room = c.rooms.find((r) => r.id === sel.room);
    const rate = c.rates.find((r) => r.id === sel.rate) ?? c.rates[0]!;
    if (q.date) out.summary.push({ label: tx('Check-in'), value: `${fmtShort(q.date)} · ${tx('from {time}', { time: c.checkIn })}` });
    if (q.endDate) out.summary.push({ label: tx('Check-out'), value: `${fmtShort(q.endDate)} · ${tx('until {time}', { time: c.checkOut })}` });
    const guests = [plural(adults, 'adult'), children ? plural(children, 'child', 'children') : '', plural(rooms, 'room')];
    out.summary.push({ label: tx('Guests'), value: guests.filter(Boolean).join(' · ') });
    if (room && nights > 0) {
      out.summary.push({ label: tx('Room'), value: `${tx(room.name)} · ${tx(rate.name)}` });
      const roomTotal = round2(room.price * rate.factor * nights * rooms);
      out.priceLines.push({ label: fmtRange(q.date!, q.endDate!), value: plural(nights, 'night') });
      out.priceLines.push({ label: rooms > 1 ? `${tx(room.name)} × ${rooms}` : tx(room.name), value: money(roomTotal) });
      let extras = 0;
      for (const id of sel.extras ?? []) {
        const e = c.extras.find((x) => x.id === id);
        if (!e) continue;
        const people = adults + children;
        const sum = e.per === 'person_night' ? e.price * people * nights : e.price;
        extras += sum;
        out.priceLines.push({ label: e.per === 'person_night' ? `${tx(e.name)} × ${people} × ${nights}` : tx(e.name), value: money(sum) });
      }
      const taxes = Math.round((roomTotal + extras) * c.taxRate);
      out.priceLines.push({ label: tx('Taxes and fees'), value: money(taxes) });
      out.total = round2(roomTotal + extras + taxes);
    } else {
      out.totalLabel = 'From';
      out.total = Math.min(...c.rooms.map((r) => r.price));
    }
    out.missing = !q.date || !q.endDate ? tx('Choose your dates')
      : nights < c.minNights ? tx('Minimum stay is {n}', { n: plural(c.minNights, 'night') })
      : !room ? tx('Choose a room') : null;
  }

  if (kind === 'sport') {
    const c = cfg as SportConfig;
    const court = c.courts.find((x) => x.id === q.resource);
    const duration = sel.duration ?? c.durations[0]!;
    if (court) out.summary.push({ label: c.resourceLabel, value: `${tx(court.name)} · ${tx(court.note.split(' · ')[0]!)}` });
    dateLine();
    if (q.time) {
      out.endTime = fromMin(toMin(q.time) + duration);
      out.summary.push({ label: tx('Time'), value: `${q.time} – ${out.endTime}` });
    }
    out.summary.push({ label: tx('Duration'), value: tx('{n} min', { n: duration }) });
    out.total = court ? round2((court.price * duration) / 60) : 0;
    out.missing = !court ? tx('Choose a {what}', { what: tx(c.resourceLabel).toLowerCase() }) : !q.date || !q.time ? tx('Choose a date and time') : null;
  }

  if (kind === 'event') {
    const c = cfg as EventConfig;
    out.summary.push({ label: tx('Event'), value: placeName });
    if (q.date) out.summary.push({ label: tx('Date'), value: `${fmtShort(q.date)} · ${c.time}` });
    let sum = 0;
    for (const t of c.tickets) {
      const n = sel.tickets?.[t.id] ?? 0;
      if (!n) continue;
      sum += t.price * n;
      out.priceLines.push({ label: `${tx(t.name)} × ${n}`, value: money(t.price * n) });
    }
    const count = ticketCount(sel);
    if (count) out.priceLines.push({ label: tx('Service fee'), value: money(c.feePerTicket * count) });
    out.total = round2(sum + c.feePerTicket * count);
    out.missing = !q.date ? tx('Choose a date') : !count ? tx('Add at least one ticket')
      : count > c.maxTickets ? tx('Max {n} tickets per order', { n: c.maxTickets }) : null;
  }

  return out;
}

/** Сколько мест занимает бронь мероприятия (VIP-стол — несколько мест). */
export function seatsFor(cfg: EventConfig, sel: Selection): number {
  return cfg.tickets.reduce((n, t) => n + (sel.tickets?.[t.id] ?? 0) * t.seats, 0);
}
