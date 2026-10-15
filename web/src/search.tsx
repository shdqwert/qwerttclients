// Поиск: общие поля «где / дата / время / гости» для главной (крупная панель) и выдачи (компактная строка).
import { type ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDays, fmtMd, fmtShort, nowInTz, plural, weekday } from '../../shared/dates.ts';
import type { Suggestion } from '../../shared/types.ts';
import { api } from './api.ts';
import { Calendar, I, Icon, Popover, Stepper } from './ui.tsx';
import { t, tl } from './i18n.tsx';

export interface Query {
  category: string;
  q: string;
  where: string;
  date: string;
  time: string;
  guests: number;
}

export const today = () => nowInTz().date;

export function readQuery(sp: URLSearchParams): Query {
  const t = today();
  const date = sp.get('date');
  return {
    category: sp.get('category') ?? '',
    q: sp.get('q') ?? '',
    where: sp.get('where') ?? '',
    date: date && date >= t ? date : t,
    time: sp.get('time') ?? '',
    guests: Math.min(20, Math.max(1, Number(sp.get('guests')) || 2)),
  };
}

export function queryParams(q: Query): Record<string, string> {
  const out: Record<string, string> = {};
  if (q.category) out.category = q.category;
  if (q.q) out.q = q.q;
  if (q.where) out.where = q.where;
  if (q.date !== today()) out.date = q.date;
  if (q.time) out.time = q.time;
  if (q.guests !== 2) out.guests = String(q.guests);
  return out;
}

export const dateLabel = (d: string) => (d === today() ? t('Today, {d}', { d: fmtMd(d) }) : d === addDays(today(), 1) ? t('Tomorrow, {d}', { d: fmtMd(d) }) : fmtShort(d));

/** Подпись выбранного района в поле «Где». */
const whereLabel = (where: string) => `${t(where)}, ${t('Tashkent')}`;

export const NEIGHBOURHOOD_NAMES = ['Mirabad', 'Yunusabad', 'Chilanzar', 'Old City', 'Mirzo Ulugbek', 'Shaykhontohur'];

export const TIMES = Array.from({ length: 29 }, (_, i) => `${String(8 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

type Open = 'where' | 'date' | 'time' | 'guests' | null;

/** Четыре поля поиска. `cell` рисует обёртку поля — она разная на главной и в выдаче. */
export function SearchFields({ value, onChange, cell }: {
  value: Query;
  onChange: (patch: Partial<Query>) => void;
  cell: (key: Exclude<Open, null>, label: string, icon: string, content: ReactNode, popover: ReactNode) => ReactNode;
}) {
  const [open, setOpen] = useState<Open>(null);
  const [month, setMonth] = useState(value.date.slice(0, 7));
  const [text, setText] = useState(value.where ? whereLabel(value.where) : value.q);
  const [items, setItems] = useState<Suggestion[]>([]);
  const navigate = useNavigate();
  const close = () => setOpen(null);

  useEffect(() => { setText(value.where ? whereLabel(value.where) : value.q); }, [value.where, value.q]);

  useEffect(() => {
    if (open !== 'where') return;
    let alive = true;
    const needle = value.where && text === whereLabel(value.where) ? '' : text;
    const timer = setTimeout(() => { api.suggest(needle).then((r) => alive && setItems(r)).catch(() => undefined); }, 120);
    return () => { alive = false; clearTimeout(timer); };
  }, [text, open, value.where]);

  const pick = (s: Suggestion) => {
    close();
    if (s.type === 'place' && s.slug) navigate(`/place/${s.slug}`);
    else onChange({ where: s.title.split(',')[0]!, q: '' });
  };

  return (
    <>
      {cell('where', t("Where"), I.pin,
        <input
          value={text} placeholder={t("Neighbourhood or place")} aria-label={t("Where")} role="combobox" aria-expanded={open === 'where'} aria-controls="where-list"
          onFocus={() => setOpen('where')}
          onChange={(e) => { setText(e.target.value); setOpen('where'); onChange({ q: e.target.value, where: '' }); }}
          style={{ border: 0, outline: 0, background: 'transparent', font: 'inherit', fontWeight: 600, color: 'inherit', width: '100%', padding: 0 }}
        />,
        <Popover open={open === 'where' && items.length > 0} onClose={close}>
          <div className="menu" id="where-list" role="listbox" style={{ width: 320 }}>
            <div className="up" style={{ padding: '8px 12px' }}>{t("Suggestions")}</div>
            {items.map((s) => (
              <button type="button" key={s.type + s.title} role="option" aria-selected="false" className="row g12 mi" style={{ padding: '8px 12px', height: 'auto' }} onClick={() => pick(s)}>
                <Icon n={s.icon} size={18} color="var(--ink-3)" />
                <div className="col grow">
                  <span className="sb">{s.type === 'neighbourhood' ? whereLabel(s.title.split(',')[0]!) : s.title}</span>
                  <span className="sm subtle">{s.type === 'neighbourhood' ? `${t('Neighbourhood')} · ${plural(Number(s.note.match(/\d+/)?.[0] ?? 0), 'place')}` : tl(s.note)}</span>
                </div>
              </button>
            ))}
          </div>
        </Popover>)}
      {cell('date', t("Date"), I.calendar,
        <button type="button" className="sb" aria-haspopup="dialog" aria-expanded={open === 'date'} onClick={() => setOpen(open === 'date' ? null : 'date')}>{dateLabel(value.date)}</button>,
        <Popover open={open === 'date'} onClose={close}>
          <div className="card overlay" style={{ width: 340, padding: 16 }}>
            <Calendar month={month} onMonth={setMonth} today={today()} selected={value.date} onPick={(d) => { onChange({ date: d }); close(); }} />
          </div>
        </Popover>)}
      {cell('time', t("Time"), I.clock,
        <button type="button" className="sb" aria-haspopup="listbox" aria-expanded={open === 'time'} onClick={() => setOpen(open === 'time' ? null : 'time')}>{value.time || t("Any time")}</button>,
        <Popover open={open === 'time'} onClose={close}>
          <div className="menu" role="listbox" style={{ width: 160, maxHeight: 280, overflowY: 'auto' }}>
            {['', ...TIMES].map((time) => (
              <button type="button" key={time} role="option" aria-selected={time === value.time} className={`mi ${time === value.time ? 'on' : ''}`} onClick={() => { onChange({ time }); close(); }}>{time || t("Any time")}</button>
            ))}
          </div>
        </Popover>)}
      {cell('guests', t("Guests"), I.users,
        <button type="button" className="sb" aria-haspopup="dialog" aria-expanded={open === 'guests'} onClick={() => setOpen(open === 'guests' ? null : 'guests')}>{plural(value.guests, 'guest')}</button>,
        <Popover open={open === 'guests'} onClose={close}>
          <div className="card overlay row between g16" style={{ width: 240, padding: 16 }}>
            <span className="b">{t("Guests")}</span>
            <Stepper value={value.guests} min={1} max={20} onChange={(guests) => onChange({ guests })} label={t('guests')} />
          </div>
        </Popover>)}
    </>
  );
}

/** Местоположение пользователя «lat,lng» для сортировки по расстоянию; null — пользователь не разрешил. */
export function locate(): Promise<string | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(`${p.coords.latitude.toFixed(4)},${p.coords.longitude.toFixed(4)}`),
      () => resolve(null),
      { timeout: 8000, maximumAge: 600000 },
    );
  });
}

/** Быстрый выбор даты под поиском на главной. */
export function quickPicks(): { label: string; patch: Partial<Query> }[] {
  const d = today();
  const toSaturday = (6 - weekday(d) + 7) % 7;
  return [
    { label: t('Tonight'), patch: { date: d, time: '19:00' } },
    { label: t('Tomorrow'), patch: { date: addDays(d, 1), time: '' } },
    { label: t('This weekend'), patch: { date: addDays(d, toSaturday), time: '' } },
  ];
}
