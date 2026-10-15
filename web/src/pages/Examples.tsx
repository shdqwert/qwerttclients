// Примеры бронирования из макетов 07–13: открывают шаг брони с уже выбранным местом, датой, временем и гостями.
import { type CSSProperties, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDays, fmtRange, fmtShort, nowInTz, toMin } from '../../../shared/dates.ts';
import type { Availability } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { t } from '../i18n.tsx';
import { type Draft, writeDraft } from '../state.tsx';
import { Art, Banner, I, Icon, Spinner } from '../ui.tsx';

/** Свободное время ресурса, ближайшее к желаемому. */
function closest(a: Availability, resource: string | null, wanted: string): { time: string; resource: string } | null {
  const pool = a.resources.filter((r) => !resource || r.id === resource);
  let best: { time: string; resource: string; d: number } | null = null;
  for (const r of pool) {
    for (const time of a.times) {
      if ((r.left[time] ?? 0) < 1) continue;
      const d = Math.abs(toMin(time) - toMin(wanted));
      if (!best || d < best.d) best = { time, resource: r.id, d };
    }
  }
  return best && { time: best.time, resource: best.resource };
}

const SAMPLE_CONTACT = { firstName: 'Marina', lastName: 'Karimova', phone: '+998 90 123 45 67', email: 'marina@mail.com' };

interface Example {
  id: string;
  slug: string;
  name: string;
  title: string;
  steps: string[];
  color: string;
  art: string;
  icon: string;
  /** Собирает черновик брони и возвращает адрес шага, который нужно открыть. */
  prepare: () => Promise<{ draft: Draft; url: string }>;
}

const tomorrow = () => addDays(nowInTz().date, 1);

const EXAMPLES: Example[] = [
  {
    id: 'restaurant', slug: 'amber', name: 'Amber', title: 'Table for 2 on the terrace', color: '#B5622E', art: 'r2', icon: 'i7',
    steps: ['Date & time', 'Party size and seating', 'Your details', 'Confirm'],
    prepare: async () => {
      const date = tomorrow();
      const a = await api.availability('amber', { date });
      const pick = closest(a, 'terrace', '19:00') ?? closest(a, null, '19:00');
      return { draft: { date, time: pick?.time, party: 2, resource: pick?.resource, selection: {}, contact: SAMPLE_CONTACT }, url: '/book/amber' };
    },
  },
  {
    id: 'salon', slug: 'studio-noir', name: 'Studio Noir', title: 'Haircut + beard with Dmitry K.', color: '#23222A', art: 'b1', icon: 'i8',
    steps: ['Service & specialist', 'Date & time', 'Your details'],
    prepare: async () => {
      const date = tomorrow();
      const a = await api.availability('studio-noir', { date, service: 'haircut-beard' });
      const pick = closest(a, 'dmitry', '14:30');
      const selection = { service: 'haircut-beard', specialist: pick ? 'dmitry' : 'any' };
      const time = pick?.time ?? closest(a, null, '14:30')?.time;
      return { draft: { date, time, party: 1, selection, contact: SAMPLE_CONTACT }, url: '/book/studio-noir/time' };
    },
  },
  {
    id: 'hotel', slug: 'merion-hotel', name: 'Merion Hotel', title: 'Deluxe double for 3 nights with breakfast', color: '#1F2A4A', art: 'ho2', icon: 'i9',
    steps: ['Dates & guests', 'Room & extras', 'Your details'],
    prepare: async () => {
      const today = nowInTz().date;
      const date = addDays(today, 6);
      const endDate = addDays(today, 9);
      const a = await api.availability('merion-hotel', { date, endDate });
      const free = (id: string) => (a.resources.find((r) => r.id === id)?.left.stay ?? 0) > 0;
      const room = free('deluxe') ? 'deluxe' : ['standard', 'family'].find(free);
      return {
        draft: { date, endDate, party: 2, selection: { room, rate: 'flex', extras: ['breakfast'], adults: 2, children: 0, rooms: 1 }, contact: SAMPLE_CONTACT },
        url: '/book/merion-hotel/room',
      };
    },
  },
  {
    id: 'sport', slug: 'riverside-sports-club', name: 'Riverside Sports Club', title: 'Court 1 for 90 minutes', color: '#2F6B4A', art: 't2', icon: 'i10',
    steps: ['Court', 'Date, time and duration', 'Your details', 'Confirm'],
    prepare: async () => {
      const date = tomorrow();
      const a = await api.availability('riverside-sports-club', { date, duration: 90 });
      const pick = closest(a, 'court-1', '17:00') ?? closest(a, null, '17:00');
      return { draft: { date, time: pick?.time, party: 2, resource: pick?.resource ?? 'court-1', selection: { duration: 90 }, contact: SAMPLE_CONTACT }, url: '/book/riverside-sports-club' };
    },
  },
  {
    id: 'event', slug: 'blue-room-jazz-night', name: 'Blue Room Jazz Night', title: '2 standard tickets', color: '#2B1F4A', art: 'j2', icon: 'i11',
    steps: ['Choose a date', 'Tickets', 'Your details', 'Confirm'],
    prepare: async () => {
      const a = await api.availability('blue-room-jazz-night', { date: nowInTz().date });
      const session = a.resources.find((r) => (r.left.tickets ?? 0) >= 2)?.id;
      return { draft: { date: session, party: 2, selection: { tickets: { standard: 2 } }, contact: SAMPLE_CONTACT }, url: '/book/blue-room-jazz-night' };
    },
  },
];

/** Подпись выбранного в примере: дата, время, номер или билеты. */
function summary(ex: Example, d: Draft): string {
  if (ex.id === 'hotel' && d.date && d.endDate) return `${fmtRange(d.date, d.endDate)} · ${t('Breakfast')}`;
  if (ex.id === 'event') return d.date ? `${fmtShort(d.date)} · 20:00` : t('Sold out');
  return [d.date && fmtShort(d.date), d.time].filter(Boolean).join(' · ');
}

export function Examples() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Record<string, string>>({});
  useEffect(() => { document.title = `${t('Booking examples')} — qwerttclients`; }, []);

  // Заранее показываем, на какое время откроется каждый пример.
  useEffect(() => {
    let alive = true;
    for (const ex of EXAMPLES) {
      ex.prepare().then((r) => alive && setPreview((p) => ({ ...p, [ex.id]: summary(ex, r.draft) }))).catch(() => undefined);
    }
    return () => { alive = false; };
  }, []);

  const open = async (ex: Example) => {
    setBusy(ex.id);
    setError('');
    try {
      const { draft, url } = await ex.prepare();
      writeDraft(ex.slug, draft);
      navigate(url);
    } catch (e) {
      setError((e as Error).message);
      setBusy('');
    }
  };

  return (
    <div className="page col g24" style={{ paddingTop: 40, paddingBottom: 64 }}>
      <div className="col g8" style={{ maxWidth: 760 }}>
        <h1 className="h1-lg">{t('Booking examples')}</h1>
        <p className="lg muted">{t('Open any example: the place, date, time and guests are already chosen, just like in the design. You can change everything and finish the booking.')}</p>
      </div>
      {error && <Banner kind="danger" title={t('Something went wrong')}>{error}</Banner>}
      <div className="grid3 stagger" style={{ gap: 16 }}>
        {EXAMPLES.map((ex) => (
          <div key={ex.id} className="card col place-card">
            <div className="ph" style={{ '--c': ex.color, width: '100%', height: 140, borderRadius: 0, position: 'relative', overflow: 'hidden' } as CSSProperties}>
              <Art n={ex.art} />
            </div>
            <div className="col g8" style={{ padding: 16, flex: 1 }}>
              <span className="row g8 sm muted"><Icon n={ex.icon} size={14} /> {ex.name}</span>
              <span className="h3">{t(ex.title)}</span>
              <span className="sm subtle">{ex.steps.map((s) => t(s)).join(' → ')}</span>
              <span className="row g4 sm sb" style={{ color: 'var(--accent)' }}>
                <Icon n={I.calendar} size={14} /> {preview[ex.id] ?? '…'}
              </span>
              <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 'auto' }} disabled={!!busy} onClick={() => void open(ex)}>
                {busy === ex.id ? <><Spinner /> {t('Opening…')}</> : t('Open example')}
              </button>
            </div>
          </div>
        ))}
      </div>
      <Banner kind="info" title={t('These are real bookings')}>
        {t('If you confirm an example, the booking is created and the slot is taken. You can cancel it in My bookings.')}
      </Banner>
    </div>
  );
}
