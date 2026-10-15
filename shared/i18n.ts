// Ядро локализации, общее для сервера и фронтенда. Сервер всегда работает на английском;
// фронтенд подставляет переводчик и язык, и тогда общие функции (даты, склонения, сводка брони) говорят на языке пользователя.

export type Lang = 'en' | 'ru' | 'uz';
export type Vars = Record<string, string | number>;

/** Подстановка {name} в строку. */
export const fill = (s: string, vars?: Vars) => (vars ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : s);

let translator: (s: string, vars?: Vars) => string = fill;
let lang: Lang = 'en';

/** Перевод строки, ключ — английский текст. */
export const tx = (s: string, vars?: Vars) => translator(s, vars);
export const getLang = () => lang;

export function setI18n(next: Lang, fn: (s: string, vars?: Vars) => string) {
  lang = next;
  translator = fn;
}

/** Формы существительных для склонения по числу: [одна, несколько (2–4), много]. */
const NOUNS: Record<Exclude<Lang, 'en'>, Record<string, string | [string, string, string]>> = {
  ru: {
    person: ['человек', 'человека', 'человек'], guest: ['гость', 'гостя', 'гостей'], night: ['ночь', 'ночи', 'ночей'],
    adult: ['взрослый', 'взрослых', 'взрослых'], child: ['ребёнок', 'ребёнка', 'детей'], room: ['номер', 'номера', 'номеров'],
    table: ['стол', 'стола', 'столов'], ticket: ['билет', 'билета', 'билетов'], place: ['место', 'места', 'мест'],
    review: ['отзыв', 'отзыва', 'отзывов'], hour: ['час', 'часа', 'часов'], time: ['раз', 'раза', 'раз'], star: ['звезда', 'звезды', 'звёзд'],
    day: ['день', 'дня', 'дней'], minute: ['минута', 'минуты', 'минут'], booking: ['бронь', 'брони', 'броней'],
  },
  uz: {
    person: 'kishi', guest: 'mehmon', night: 'tun', adult: 'katta', child: 'bola', room: 'xona', table: 'stol', ticket: 'chipta',
    place: 'joy', review: 'sharh', hour: 'soat', time: 'marta', star: 'yulduz', day: 'kun', minute: 'daqiqa', booking: 'bron',
  },
};

/** «3 guests» на текущем языке. `one` — английское слово в единственном числе. */
export function plural(n: number, one: string, many = `${one}s`): string {
  if (lang === 'en') return `${n} ${n === 1 ? one : many}`;
  const forms = NOUNS[lang][one];
  if (!forms) return `${n} ${n === 1 ? one : many}`;
  if (typeof forms === 'string') return `${n} ${forms}`;
  const m10 = n % 10;
  const m100 = n % 100;
  const form = m10 === 1 && m100 !== 11 ? 0 : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 1 : 2;
  return `${n} ${forms[form]}`;
}
