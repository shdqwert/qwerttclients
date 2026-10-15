// Работа с датами в виде строк YYYY-MM-DD и временем HH:MM без привязки к часовому поясу браузера.
import { getLang, type Lang } from './i18n.ts';


export const TZ = 'Asia/Tashkent';
export const TZ_LABEL = 'Tashkent (UTC+5)';

const pad = (n: number) => String(n).padStart(2, '0');

export function toDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

export function toIso(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(iso: string, n: number): string {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

export function diffDays(a: string, b: string): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86400000);
}

/** День недели: 0 — воскресенье. */
export function weekday(iso: string): number {
  return toDate(iso).getUTCDay();
}

export function toMin(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h! * 60 + m!;
}

export function fromMin(min: number): string {
  return `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
}

/** Текущие дата и время в часовом поясе площадок. */
export function nowInTz(now: Date = new Date()): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

// Форматы дат кэшируются по языку интерфейса.
const LOCALES: Record<Lang, string> = { en: 'en-US', ru: 'ru-RU', uz: 'uz-Latn-UZ' };
const OPTS = {
  short: { weekday: 'short', month: 'short', day: 'numeric' },
  long: { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
  dayMonth: { weekday: 'long', month: 'long', day: 'numeric' },
  md: { month: 'short', day: 'numeric' },
  month: { month: 'long', year: 'numeric' },
  dow: { weekday: 'short' },
  full: { month: 'long', day: 'numeric', year: 'numeric' },
} satisfies Record<string, Intl.DateTimeFormatOptions>;
const cache = new Map<string, Intl.DateTimeFormat>();
// В браузерах нет полных данных для узбекского языка, поэтому даты на нём собираются вручную.
const UZ_MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const UZ_MON = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'];
const UZ_DAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
const UZ_DOW = ['Yak', 'Du', 'Se', 'Chor', 'Pay', 'Ju', 'Sha'];

function fmtUz(kind: keyof typeof OPTS, d: Date): string {
  const day = d.getUTCDate();
  const m = d.getUTCMonth();
  const y = d.getUTCFullYear();
  const w = d.getUTCDay();
  switch (kind) {
    case 'short': return `${UZ_DOW[w]}, ${day}-${UZ_MON[m]}`;
    case 'long': return `${UZ_DAYS[w]}, ${y}-yil ${day}-${UZ_MONTHS[m]}`;
    case 'dayMonth': return `${UZ_DAYS[w]}, ${day}-${UZ_MONTHS[m]}`;
    case 'md': return `${day}-${UZ_MON[m]}`;
    case 'month': return `${UZ_MONTHS[m]![0]!.toUpperCase()}${UZ_MONTHS[m]!.slice(1)} ${y}`;
    case 'dow': return UZ_DOW[w]!;
    case 'full': return `${y}-yil ${day}-${UZ_MONTHS[m]}`;
  }
}

const fmt = (kind: keyof typeof OPTS, iso: string) => {
  if (getLang() === 'uz') return fmtUz(kind, toDate(iso));
  const key = `${getLang()}|${kind}`;
  let f = cache.get(key);
  if (!f) cache.set(key, (f = new Intl.DateTimeFormat(LOCALES[getLang()], { timeZone: 'UTC', ...OPTS[kind] })));
  const s = f.format(toDate(iso));
  return getLang() === 'en' ? s : s.charAt(0).toUpperCase() + s.slice(1);
};

/** "Tue, Oct 6" */
export const fmtShort = (iso: string) => fmt('short', iso);
/** "Tuesday, October 6, 2026" */
export const fmtLong = (iso: string) => fmt('long', iso);
/** "Tuesday, October 6" */
export const fmtDayMonth = (iso: string) => fmt('dayMonth', iso);
/** "Oct 6" */
export const fmtMd = (iso: string) => fmt('md', iso);
/** "October 2026" по строке YYYY-MM */
export const fmtMonth = (ym: string) => fmt('month', `${ym}-01`);
export const fmtDow = (iso: string) => fmt('dow', iso);
export const fmtFull = (iso: string) => fmt('full', iso);

/** "Oct 12 – 15" либо "Oct 30 – Nov 2" */
export function fmtRange(a: string, b: string): string {
  return getLang() === 'en' && a.slice(0, 7) === b.slice(0, 7) ? `${fmtMd(a)} – ${toDate(b).getUTCDate()}` : `${fmtMd(a)} – ${fmtMd(b)}`;
}

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** Дни месяца и число пустых ячеек перед первым числом (неделя с понедельника). */
export function monthDays(ym: string): { lead: number; days: string[] } {
  const first = toDate(`${ym}-01`);
  const lead = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return { lead, days: Array.from({ length: count }, (_, i) => `${ym}-${pad(i + 1)}`) };
}

export { plural } from './i18n.ts';
