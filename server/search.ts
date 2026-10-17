// Текстовый поиск по каталогу на трёх языках: английском, русском и узбекском.
// Пользователь может написать «итальянский ресторан», «Мирабад», «Амбер» или «oq saroy» —
// место находится по названию, типу, кухне, району, адресу, категории и особенностям.
import { RU } from '../web/src/locales.ru.ts';
import { UZ } from '../web/src/locales.uz.ts';
import { CATEGORIES, type PlaceDef } from './catalog.ts';

const CYR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n',
  о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya', қ: 'k', ғ: 'g', ҳ: 'h', ў: 'o',
};

/** Приводит текст к единому виду: регистр, «ё», узбекские апострофы, лишние пробелы. */
export function normalize(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/[ʻʼ‘’`´]/g, "'").replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

/** Грубое латинское написание: «Амбер» → «amber», «Ок Сарой» и «Oq Saroy» → «ok saroy». */
function loose(s: string): string {
  return [...normalize(s)].map((ch) => CYR[ch] ?? ch).join('')
    .replace(/kh/g, 'h').replace(/x/g, 'h').replace(/q/g, 'k').replace(/'/g, '');
}

const tr = (en: string) => [en, RU[en], UZ[en]].filter((s): s is string => !!s);

const cache = new WeakMap<PlaceDef, { exact: string; rough: string }>();

/** Всё, по чему можно найти место, на всех языках. */
function haystack(p: PlaceDef) {
  let h = cache.get(p);
  if (!h) {
    const category = CATEGORIES.find((c) => c.id === p.category)?.name ?? '';
    const parts = [
      p.name, p.address, p.slug.replace(/-/g, ' '),
      ...tr(p.neighbourhood), ...tr(category), ...(p.cuisine ? [...tr(p.cuisine), ...tr('Cuisine')] : []),
      ...p.subtitle.split(' · ').flatMap(tr), ...p.tags.flatMap(tr),
    ];
    const exact = normalize(parts.join(' | '));
    h = { exact, rough: loose(parts.join(' | ')) };
    cache.set(p, h);
  }
  return h;
}

/** Каждое слово запроса должно найтись хотя бы в одной из форм. Окончания отбрасываются: «итальянская» ≈ «итальянск». */
export function matchesText(p: PlaceDef, query: string): boolean {
  const words = normalize(query).split(' ').filter(Boolean);
  if (!words.length) return true;
  const h = haystack(p);
  return words.every((w) => {
    const stem = w.length > 5 ? w.slice(0, -2) : w;
    return h.exact.includes(stem) || h.rough.includes(loose(stem));
  });
}

/** Совпадает ли название района с запросом на любом языке. */
export function matchesName(en: string, query: string): boolean {
  const n = normalize(query);
  if (!n) return true;
  return tr(en).some((s) => normalize(s).includes(n) || loose(s).includes(loose(n)));
}
