// Язык и тема интерфейса, заставка при запуске и эффект нажатия на кнопки.
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fill, getLang, type Lang, plural, setI18n, type Vars } from '../../shared/i18n.ts';
import { DICT, PATTERNS } from './locales.ts';

export type { Lang };
export type Theme = 'light' | 'dark';

export const LANGS: { code: Lang; label: string; short: string }[] = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'ru', label: 'Русский', short: 'RU' },
  { code: 'uz', label: "O'zbekcha", short: 'UZ' },
];

const missing = new Set<string>();

/** Перевод: ключ — английская строка, {name} — подстановки. */
export function t(s: string, vars?: Vars): string {
  const lang = getLang();
  if (lang === 'en' || !s) return fill(s, vars);
  const hit = DICT[lang][s];
  if (hit == null && import.meta.env.DEV && !missing.has(s)) {
    missing.add(s);
    console.debug(`[i18n:${lang}] missing:`, s);
  }
  return fill(hit ?? s, vars);
}

/** Перевод составной строки каталога вида «Restaurant · Italian». */
export const tl = (s: string) => s.split(' · ').map((part) => t(part)).join(' · ');

/** Перевод сообщений сервера: точное совпадение или шаблон с числами и временем. */
export function tMsg(s: string): string {
  if (getLang() === 'en') return s;
  const exact = DICT[getLang() as 'ru' | 'uz'][s];
  if (exact) return exact;
  for (const [re, build] of PATTERNS) {
    const m = s.match(re);
    if (m) return build(m, { t, plural });
  }
  return s;
}

function read<T extends string>(key: string, allowed: readonly T[]): T | null {
  try {
    const v = localStorage.getItem(key);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* хранилище недоступно — настройка живёт до перезагрузки */ }
}

function initialLang(): Lang {
  const saved = read<Lang>('qw:lang', ['en', 'ru', 'uz']);
  if (saved) return saved;
  const nav = navigator.language.slice(0, 2);
  return nav === 'ru' ? 'ru' : nav === 'uz' ? 'uz' : 'en';
}

function initialTheme(): Theme {
  return read<Theme>('qw:theme', ['light', 'dark']) ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

// Язык применяется до первого рендера, чтобы не было мигания английского текста.
const startLang = initialLang();
setI18n(startLang, t);
document.documentElement.lang = startLang;
document.documentElement.dataset.theme = initialTheme();

interface Prefs {
  lang: Lang;
  setLang: (l: Lang) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const PrefsCtx = createContext<Prefs | null>(null);

export function usePrefs(): Prefs {
  const v = useContext(PrefsCtx);
  if (!v) throw new Error('PrefsProvider is missing');
  return v;
}

export function PrefsProvider({ children }: { children: (lang: Lang) => ReactNode }) {
  const [lang, setLangState] = useState<Lang>(startLang);
  const [theme, setThemeState] = useState<Theme>(() => document.documentElement.dataset.theme as Theme);

  const setLang = useCallback((l: Lang) => {
    setI18n(l, t);
    document.documentElement.lang = l;
    write('qw:lang', l);
    setLangState(l);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    const root = document.documentElement;
    root.classList.add('theme-switch');
    root.dataset.theme = next;
    write('qw:theme', next);
    setThemeState(next);
    setTimeout(() => root.classList.remove('theme-switch'), 400);
  }, []);

  // Эффект «волны» на всех кнопках: одна подписка на весь документ.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('.btn');
      if (!btn || btn.matches('[disabled]') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const r = btn.getBoundingClientRect();
      const size = Math.max(r.width, r.height) * 2;
      const span = document.createElement('span');
      span.className = 'ripple';
      Object.assign(span.style, { width: `${size}px`, height: `${size}px`, left: `${e.clientX - r.left - size / 2}px`, top: `${e.clientY - r.top - size / 2}px` });
      btn.appendChild(span);
      setTimeout(() => span.remove(), 600);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  const value = useMemo(() => ({ lang, setLang, theme, setTheme }), [lang, setLang, theme, setTheme]);
  return <PrefsCtx.Provider value={value}>{children(lang)}</PrefsCtx.Provider>;
}


