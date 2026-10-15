// Переводы интерфейса. Ключ — английская строка из кода, {name} — подстановки.
import type { Lang, Vars } from '../../shared/i18n.ts';
import { RU } from './locales.ru.ts';
import { UZ } from './locales.uz.ts';

export const DICT: Record<Exclude<Lang, 'en'>, Record<string, string>> = { ru: RU, uz: UZ };

type Helpers = { t: (s: string, vars?: Vars) => string; plural: (n: number, one: string) => string };

/** Сообщения сервера с числами и названиями: разбираются по шаблону и собираются заново на языке интерфейса. */
export const PATTERNS: [RegExp, (m: RegExpMatchArray, h: Helpers) => string][] = [
  [/^(.+) was just booked\. Pick another option\.$/, (m, h) => h.t('{x} was just booked. Pick another option.', { x: h.t(m[1]!) })],
  [/^Try again in (\d+) minutes or reset your password\.$/, (m, h) => h.t('Try again in {n} or reset your password.', { n: h.plural(Number(m[1]), 'minute') })],
  [/^Minimum stay is (\d+) nights?\.?$/, (m, h) => h.t('Minimum stay is {n}', { n: h.plural(Number(m[1]), 'night') })],
  [/^Tables seat up to (\d+)\.$/, (m, h) => h.t('Tables seat up to {n}.', { n: m[1]! })],
  [/^Only (\d+) places are left for this date\.$/, (m, h) => h.t('Only {n} left for this date.', { n: h.plural(Number(m[1]), 'place') })],
  [/^Max (\d+) tickets per order\.?$/, (m, h) => h.t('Max {n} tickets per order', { n: m[1]! })],
  [/^Bookings open (\d+) days ahead\.$/, (m, h) => h.t('Bookings open {n} ahead.', { n: h.plural(Number(m[1]), 'day') })],
  [/^(.+) sleeps up to (\d+) per room\.$/, (m, h) => h.t('{room} sleeps up to {n} per room.', { room: h.t(m[1]!), n: m[1 + 1]! })],
  [/^Choose a (court|studio|space)\.$/, (m, h) => h.t('Choose a {what}', { what: h.t(m[1]![0]!.toUpperCase() + m[1]!.slice(1)).toLowerCase() })],
];
