// Макет «26 · Кабинет бизнеса» и его разделы: календарь, брони, гости, отзывы, настройки площадки.
import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import { addDays, fmtDayMonth, fmtDow, fmtMd, fmtShort, nowInTz, plural, toDate, toMin } from '../../../shared/dates.ts';
import { money } from '../../../shared/pricing.ts';
import type { BusinessOverview } from '../../../shared/types.ts';
import { api, type Venue } from '../api.ts';
import { t } from '../i18n.tsx';
import { Header, LangMenu, Logo, ThemeToggle } from '../layout.tsx';
import { today } from '../search.tsx';
import { loginUrl, useApp } from '../state.tsx';
import { Avatar, Banner, Empty, ErrorBox, Field, I, Icon, Skeleton, TextInput, Toggle, useLoad, useSubmit } from '../ui.tsx';

const ROW = 56;
const TONE: Record<string, [string, string]> = {
  confirmed: ['var(--accent-tint)', 'var(--accent)'], pending: ['var(--warn-tint)', 'var(--warn)'], completed: ['var(--surface-3)', 'var(--ink-3)'],
};
const BADGE: Record<string, string> = { confirmed: 'success', pending: 'warn', completed: '', cancelled: 'danger' };
const STATUS: Record<string, string> = { confirmed: 'Confirmed', pending: 'Pending', completed: 'Completed', cancelled: 'Cancelled' };

function ago(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return min < 1 ? t('just now') : min < 60 ? t('{n} min ago', { n: min }) : min < 1440 ? t('{n} h ago', { n: Math.round(min / 60) }) : fmtMd(nowInTz(new Date(iso)).date);
}

function Schedule({ data }: { data: BusinessOverview }) {
  const first = toMin(data.hours[0]!);
  const height = data.hours.length * ROW;
  const cell = { borderLeft: '1px solid var(--line)' };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `56px repeat(${data.columns.length},1fr)`, border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', overflow: 'hidden', background: 'var(--surface)' }}>
      <div style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--line)' }} />
      {data.columns.map((c) => <div key={c.id} className="sb sm" style={{ padding: '8px 12px', background: 'var(--surface-2)', borderBottom: '1px solid var(--line)', ...cell }}>{t(c.name)}</div>)}
      <div>{data.hours.map((h) => <div key={h} className="sm subtle" style={{ padding: 8, height: ROW }}>{h}</div>)}</div>
      {data.columns.map((c) => {
        // Пересекающиеся по времени брони одной колонки раскладываются по дорожкам.
        const blocks = data.blocks.filter((b) => b.column === c.id).map((b) => ({ ...b, a: toMin(b.start), z: toMin(b.start) + b.minutes, lane: 0 }));
        const ends: number[] = [];
        for (const b of blocks.sort((x, y) => x.a - y.a)) {
          let lane = ends.findIndex((e) => e <= b.a);
          if (lane === -1) lane = ends.length;
          ends[lane] = b.z;
          b.lane = lane;
        }
        const lanes = Math.max(1, ends.length);
        return (
          <div key={c.id} style={{ ...cell, position: 'relative', height, backgroundImage: 'linear-gradient(var(--line) 1px, transparent 1px)', backgroundSize: `100% ${ROW}px` }}>
            {blocks.map((b) => {
              const [bg, line] = TONE[b.status] ?? TONE.confirmed!;
              return (
                <Link key={b.ref} to={`/account/bookings/${b.ref}`} title={`${b.start} · ${b.label}`} style={{
                  position: 'absolute', top: ((b.a - first) / 60) * ROW + 4, height: Math.max(24, ((Math.min(b.z, first + data.hours.length * 60) - b.a) / 60) * ROW - 8),
                  left: `calc(${(b.lane / lanes) * 100}% + 4px)`, width: `calc(${100 / lanes}% - 8px)`, background: bg, borderLeft: `3px solid ${line}`,
                  borderRadius: 'var(--r-sm)', padding: '4px 8px', fontSize: 12, fontWeight: 600, overflow: 'hidden', zIndex: 1, color: 'var(--ink)',
                }}>{b.status === 'pending' ? `${t('Pending')} · ${b.label.split(' · ')[1] ?? ''}` : b.label}</Link>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function Stats({ d }: { d: BusinessOverview }) {
  const delta = d.stats.bookingsDelta;
  return (
    <div className="row g16 stagger">
      <div className="card col g4 grow" style={{ padding: 16 }}><span className="sm muted">{t('Bookings')}</span><span className="h1">{d.stats.bookings}</span><span className={`sm ${delta >= 0 ? 'ok' : 'err'}`}>{delta >= 0 ? '+' : ''}{delta} {t('vs a week earlier')}</span></div>
      <div className="card col g4 grow" style={{ padding: 16 }}><span className="sm muted">{t('Occupancy')}</span><span className="h1">{d.stats.occupancy}%</span><span className="sm subtle">{t('of bookable capacity')}</span></div>
      <div className="card col g4 grow" style={{ padding: 16 }}><span className="sm muted">{t('Expected revenue')}</span><span className="h1">{money(d.stats.revenue)}</span><span className="sm subtle">{d.place.kind === 'restaurant' ? t('guests × average bill') : t('from booked totals')}</span></div>
      <div className="card col g4 grow" style={{ padding: 16 }}><span className="sm muted">{t('Cancelled, last 7 days')}</span><span className="h1">{d.stats.cancelledWeek}</span><span className="sm subtle">{t('incl. declined requests')}</span></div>
    </div>
  );
}

function Overview() {
  const [date, setDate] = useState(today());
  const res = useLoad(() => api.business(date), [date]);
  const [busy, setBusy] = useState('');
  const { toast } = useApp();
  const d = res.data;
  const decide = async (ref: string, accept: boolean) => {
    setBusy(ref);
    try {
      await api.decide(ref, accept);
      toast(accept ? t('Booking accepted') : t('Booking declined'));
    } catch (e) {
      toast((e as Error).message);
    }
    setBusy('');
    res.reload();
  };
  if (res.error) return <ErrorBox error={res.error} onRetry={res.reload} />;
  if (!d) return <Skeleton rows={4} height={72} />;
  return (
    <main className="col g24">
      <div className="row between">
        <div className="col">
          <h1 className="h1">{date === today() ? t('Today') : fmtDayMonth(date)}</h1>
          <span className="muted">{fmtDayMonth(date)} · {d.place.name}</span>
        </div>
        <div className="row g8">
          <button type="button" className="btn btn-secondary btn-sm btn-icon" aria-label={t('Previous day')} onClick={() => setDate(addDays(date, -1))}><Icon n={I.left} /></button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDate(today())}><Icon n={I.calendar} size={14} /> {fmtMd(date)}</button>
          <button type="button" className="btn btn-secondary btn-sm btn-icon" aria-label={t('Next day')} onClick={() => setDate(addDays(date, 1))}><Icon n={I.right} /></button>
          <Link to={`/book/${d.place.slug}`} className="btn btn-primary btn-sm"><Icon n={I.plus} size={14} /> {t('New booking')}</Link>
        </div>
      </div>
      <Stats d={d} />
      <div className="row g24 start">
        <section className="col g12 grow" style={{ minWidth: 0 }}>
          <h2 className="h2">{t('Schedule')}</h2>
          {d.hours.length > 0 ? <Schedule data={d} /> : <Banner kind="info">{t('This venue is booked by night or by show, so the day has no hourly grid. See the Bookings section.')}</Banner>}
        </section>
        <section className="card col" style={{ width: 320, padding: 16, flexShrink: 0 }}>
          <h2 className="h3">{t('Needs your attention')} {d.pending.length > 0 && <span className="badge danger">{d.pending.length}</span>}</h2>
          {d.pending.length === 0 && <span className="muted" style={{ paddingTop: 12 }}>{t('No requests are waiting.')}</span>}
          {d.pending.map((r) => (
            <div key={r.ref} className="col g8" style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
              <div className="row between g8"><span className="b">{r.title.replace('Table for', t('Table for'))}</span><span className="sm subtle" style={{ whiteSpace: 'nowrap' }}>{ago(r.createdAt)}</span></div>
              <span className="sm muted">{r.note}</span>
              <div className="row g8">
                <button type="button" className="btn btn-primary btn-sm" disabled={busy === r.ref} onClick={() => void decide(r.ref, true)}>{t('Accept')}</button>
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy === r.ref} onClick={() => void decide(r.ref, false)}>{t('Decline')}</button>
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}

function Week() {
  const [start, setStart] = useState<string | undefined>();
  const res = useLoad(() => api.businessWeek(start), [start]);
  const w = res.data;
  if (res.error) return <ErrorBox error={res.error} onRetry={res.reload} />;
  if (!w) return <Skeleton rows={3} height={120} />;
  const max = Math.max(1, ...w.days.map((d) => d.bookings));
  return (
    <main className="col g24">
      <div className="row between">
        <h1 className="h1">{t('Calendar')}</h1>
        <div className="row g8">
          <button type="button" className="btn btn-secondary btn-sm btn-icon" aria-label={t('Previous week')} onClick={() => setStart(addDays(w.start, -7))}><Icon n={I.left} /></button>
          <span className="sb">{fmtMd(w.start)} – {fmtMd(addDays(w.start, 6))}</span>
          <button type="button" className="btn btn-secondary btn-sm btn-icon" aria-label={t('Next week')} onClick={() => setStart(addDays(w.start, 7))}><Icon n={I.right} /></button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 12 }} className="stagger">
        {w.days.map((d) => (
          <div key={d.date} className="card col g8" style={{ padding: 12, minHeight: 260, borderColor: d.date === today() ? 'var(--accent)' : undefined }}>
            <div className="row between"><span className="up">{fmtDow(d.date)}</span><span className="h3">{toDate(d.date).getUTCDate()}</span></div>
            <div style={{ height: 6, background: 'var(--surface-3)', borderRadius: 3 }}>
              <div style={{ width: `${(d.bookings / max) * 100}%`, height: 6, borderRadius: 3, background: 'var(--accent)', transition: 'width .4s' }} />
            </div>
            <span className="sm muted">{plural(d.bookings, 'booking')} · {plural(d.guests, 'guest')}</span>
            {d.pending > 0 && <span className="badge warn" style={{ alignSelf: 'flex-start' }}>{d.pending} {t('Pending').toLowerCase()}</span>}
            <div className="col g4" style={{ marginTop: 4 }}>
              {d.items.map((b) => (
                <Link key={b.ref} to={`/account/bookings/${b.ref}`} className="sm" style={{ padding: '4px 6px', borderRadius: 'var(--r-sm)', background: (TONE[b.status] ?? TONE.confirmed!)[0], borderLeft: `3px solid ${(TONE[b.status] ?? TONE.confirmed!)[1]}` }}>
                  <b>{b.time ?? ''}</b> {b.name.split(' ')[1] ?? b.name} · {b.party}
                </Link>
              ))}
              {d.bookings > d.items.length && <span className="sm subtle">+{d.bookings - d.items.length}</span>}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

function Bookings() {
  const [date, setDate] = useState(today());
  const res = useLoad(() => api.business(date), [date]);
  const d = res.data;
  return (
    <main className="col g16">
      <div className="row between">
        <h1 className="h1">{t('Bookings')}</h1>
        <div className="row g8">
          <button type="button" className="btn btn-secondary btn-sm btn-icon" aria-label={t('Previous day')} onClick={() => setDate(addDays(date, -1))}><Icon n={I.left} /></button>
          <span className="sb">{fmtShort(date)}</span>
          <button type="button" className="btn btn-secondary btn-sm btn-icon" aria-label={t('Next day')} onClick={() => setDate(addDays(date, 1))}><Icon n={I.right} /></button>
        </div>
      </div>
      {res.error && <ErrorBox error={res.error} onRetry={res.reload} />}
      {!d && !res.error && <Skeleton rows={4} />}
      {d && d.list.length === 0 && <Empty icon={I.calendar} title={t('No bookings on this day')} />}
      {d && d.list.length > 0 && (
        <div className="card lines" style={{ padding: '0 16px' }}>
          {d.list.map((r) => (
            <Link key={r.ref} to={`/account/bookings/${r.ref}`} className="line-row">
              <span className="row g16"><span className="sb" style={{ width: 48 }}>{r.time ?? '—'}</span><span className="col"><span className="b">{r.name}</span><span className="sm muted">{plural(r.party, 'guest')} · {r.ref}</span></span></span>
              <span className={`badge ${BADGE[r.status]}`}>{t(STATUS[r.status]!)}</span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

function Customers() {
  const res = useLoad(() => api.businessCustomers(), []);
  const [q, setQ] = useState('');
  const list = (res.data ?? []).filter((c) => !q || `${c.name} ${c.email} ${c.phone}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <main className="col g16">
      <div className="row between">
        <h1 className="h1">{t('Customers')}</h1>
        <div style={{ width: 300 }}><TextInput icon={I.search} value={q} onChange={setQ} placeholder={t('Search by name, email or phone')} /></div>
      </div>
      {res.error && <ErrorBox error={res.error} onRetry={res.reload} />}
      {!res.data && !res.error && <Skeleton rows={4} />}
      {res.data && list.length === 0 && <Empty icon={I.user} title={t('No customers yet')} />}
      {list.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="row up" style={{ padding: '10px 16px', background: 'var(--surface-2)', gap: 16 }}>
            <span className="grow">{t('Guest')}</span><span style={{ width: 160 }}>{t('Phone')}</span><span style={{ width: 90 }}>{t('Visits')}</span><span style={{ width: 90 }}>{t('Upcoming')}</span><span style={{ width: 110 }}>{t('Last booking')}</span>
          </div>
          {list.map((c) => (
            <div key={c.email} className="row" style={{ padding: '12px 16px', borderTop: '1px solid var(--line)', gap: 16 }}>
              <span className="row g12 grow"><span className="avatar">{c.name[0]}</span><span className="col"><span className="b">{c.name}</span><span className="sm muted">{c.email}</span></span></span>
              <span style={{ width: 160 }} className="muted">{c.phone}</span>
              <span style={{ width: 90 }} className="sb">{c.visits}</span>
              <span style={{ width: 90 }}>{c.upcoming > 0 ? <span className="badge info">{c.upcoming}</span> : '—'}</span>
              <span style={{ width: 110 }} className="muted">{fmtShort(c.last)}</span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

function Reviews() {
  const res = useLoad(() => api.businessReviews(), []);
  const avg = res.data?.length ? res.data.reduce((n, r) => n + r.rating, 0) / res.data.length : 0;
  return (
    <main className="col g16">
      <h1 className="h1">{t('Reviews')}</h1>
      {res.error && <ErrorBox error={res.error} onRetry={res.reload} />}
      {!res.data && !res.error && <Skeleton rows={3} />}
      {res.data && res.data.length === 0 && <Empty icon={I.starLine} title={t('No written reviews yet')}>{t('Guests can review after a completed visit.')}</Empty>}
      {res.data && res.data.length > 0 && (
        <>
          <div className="card row g16" style={{ padding: 16 }}>
            <span className="h1-lg">{avg.toFixed(1)}</span>
            <span className="muted">{plural(res.data.length, 'review')} · {t('written on qwerttclients')}</span>
          </div>
          <div className="col g12 stagger">
            {res.data.map((r) => (
              <div key={r.id} className="card col g8" style={{ padding: 16 }}>
                <div className="row g12">
                  <span className="avatar">{r.author[0]}</span>
                  <div className="col grow"><span className="sb">{r.author}</span><span className="sm subtle">{fmtShort(r.createdAt.slice(0, 10))}</span></div>
                  <span className="rate"><Icon n={I.star} size={13} color="#946F00" sw={1} /> {r.rating.toFixed(1)}</span>
                </div>
                <p className="muted">{r.text}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}

function VenueSettings() {
  const res = useLoad(() => api.venue(), []);
  const [v, setV] = useState<Venue | null>(null);
  const form = useSubmit();
  const { toast } = useApp();
  useEffect(() => { if (res.data) setV(res.data); }, [res.data]);
  if (res.error) return <ErrorBox error={res.error} onRetry={res.reload} />;
  if (!v) return <Skeleton rows={5} />;
  const f = form.fields;
  const save = async () => {
    const r = await form.run(() => api.updateVenue({
      about: v.about, phone: v.phone, openUntil: v.openUntil, policies: v.policies, instant: v.instant, cancelHours: v.cancelHours,
      prices: Object.fromEntries(v.items.map((i) => [i.id, i.price])), tables: Object.fromEntries(v.areas.map((a) => [a.id, a.tables])),
    }));
    if (r) { setV(r); toast(t('Changes saved'), t('Guests see them right away.')); }
  };
  const groups = [...new Set(v.items.map((i) => i.group))];
  const num = (s: string) => (s === '' ? 0 : Number(s.replace(',', '.')) || 0);
  return (
    <main className="col g24">
      <div className="row between">
        <h1 className="h1">{t('Settings')}</h1>
        <div className="row g8">
          <Link to={`/place/${v.slug}`} className="btn btn-secondary btn-sm">{t('View public page')}</Link>
          <button type="button" className="btn btn-primary btn-sm" disabled={form.busy} onClick={() => void save()}>{t('Save changes')}</button>
        </div>
      </div>
      {form.error && <Banner kind="danger" title={t('Could not save')}>{form.error.message}</Banner>}
      <section className="card col g16 card-p24">
        <h2 className="h2">{t('Venue')}</h2>
        <Field label={t('About')} error={f.about}>
          <div className={`input ta ${f.about ? 'error' : ''}`} style={{ height: 110 }}><textarea value={v.about} maxLength={1000} onChange={(e) => setV({ ...v, about: e.target.value })} /></div>
        </Field>
        <div className="row g16 start">
          <Field label={t('Phone')} error={f.phone}><TextInput type="tel" icon={I.phone} value={v.phone} onChange={(x) => setV({ ...v, phone: x })} error={!!f.phone} /></Field>
          <Field label={t('Open until')} error={f.openUntil}><TextInput icon={I.clock} value={v.openUntil} onChange={(x) => setV({ ...v, openUntil: x })} error={!!f.openUntil} placeholder="23:00" /></Field>
        </div>
      </section>
      <section className="card col g16 card-p24">
        <h2 className="h2">{t('Booking rules')}</h2>
        <div className="line-row" style={{ paddingTop: 0 }}>
          <div className="col"><span className="b">{t('Instant confirmation')}</span><span className="sm muted">{t('Off: every booking waits for your answer in Overview.')}</span></div>
          <Toggle on={v.instant} label={t('Instant confirmation')} onChange={(instant) => setV({ ...v, instant })} />
        </div>
        <Field label={t('Free cancellation, hours before')} error={f.cancelHours} style={{ width: 260 }}>
          <TextInput value={String(v.cancelHours)} onChange={(x) => setV({ ...v, cancelHours: Math.max(0, Math.min(168, Math.round(num(x)))) })} error={!!f.cancelHours} />
        </Field>
        <Field label={t('Policies shown to guests')} error={f.policies}>
          <div className={`input ta ${f.policies ? 'error' : ''}`}><textarea value={v.policies} maxLength={1000} onChange={(e) => setV({ ...v, policies: e.target.value })} /></div>
        </Field>
      </section>
      {v.areas.length > 0 && (
        <section className="card col g8 card-p24">
          <h2 className="h2">{t('Team & tables')}</h2>
          <span className="sm muted">{t('How many tables each area has. Bookings beyond this number are not accepted.')}</span>
          <div className="lines">
            {v.areas.map((a, i) => (
              <div key={a.id} className="line-row">
                <span className="b">{t(a.name)}</span>
                <div style={{ width: 120 }}><TextInput value={String(a.tables)} onChange={(x) => setV({ ...v, areas: v.areas.map((y, j) => (j === i ? { ...y, tables: Math.max(0, Math.min(200, Math.round(num(x)))) } : y)) })} /></div>
              </div>
            ))}
          </div>
        </section>
      )}
      {groups.map((g) => (
        <section key={g} className="card col g8 card-p24">
          <h2 className="h2">{t(g)} · {t('prices')}</h2>
          <div className="lines">
            {v.items.filter((i) => i.group === g).map((item) => (
              <div key={item.id} className="line-row">
                <span className="b">{t(item.name)}</span>
                <div style={{ width: 140 }}>
                  <div className="input"><span className="subtle">$</span>
                    <input inputMode="decimal" value={String(item.price)} aria-label={t(item.name)}
                      onChange={(e) => setV({ ...v, items: v.items.map((x) => (x.id === item.id ? { ...x, price: Math.max(0, num(e.target.value)) } : x)) })} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

const SECTIONS: [string, string, string][] = [
  ['', 'Overview', I.home], ['calendar', 'Calendar', I.calendar], ['bookings', 'Bookings', I.receipt],
  ['customers', 'Customers', I.user], ['reviews', 'Reviews', I.starLine], ['settings', 'Settings', I.settings],
];

function Dashboard({ slug }: { slug: string | null }) {
  const { section = '' } = useParams();
  const views: Record<string, ReactNode> = { '': <Overview />, calendar: <Week />, bookings: <Bookings />, customers: <Customers />, reviews: <Reviews />, settings: <VenueSettings /> };
  return (
    <div className="row" style={{ alignItems: 'stretch', flex: 1 }}>
      <aside className="col g4" style={{ width: 220, flexShrink: 0, padding: '16px 12px', borderRight: '1px solid var(--line)', background: 'var(--surface)' }} aria-label={t('Business')}>
        {SECTIONS.map(([id, label, icon]) => (
          <NavLink key={id} end to={`/business${id ? `/${id}` : ''}`} className={({ isActive }) => `side-link ${isActive ? 'on' : ''}`}><Icon n={icon} size={18} />{t(label)}</NavLink>
        ))}
        {slug && <Link className="side-link" to={`/place/${slug}`}><Icon n={I.share} size={18} />{t('Public page')}</Link>}
      </aside>
      <div key={section} className="route" style={{ padding: '24px 32px 56px', flex: 1, minWidth: 0 }}>{views[section] ?? views['']}</div>
    </div>
  );
}

export function Business() {
  const { user, ready, logout } = useApp();
  useEffect(() => { document.title = `${t('For business')} — qwerttclients`; }, []);
  if (!ready) return null;
  if (user?.role === 'business') {
    return (
      <>
        <header className="hdr" style={{ '--px': '24px' } as CSSProperties}>
          <Logo badge={t('Business')} />
          <div className="row g8">
            <LangMenu />
            <ThemeToggle />
            <Avatar user={user} />
            <button type="button" className="btn btn-subtle btn-sm" onClick={() => void logout()}><Icon n={I.logout} /> {t('Log out')}</button>
          </div>
        </header>
        <Dashboard slug={user.businessPlace} />
      </>
    );
  }
  return (
    <>
      <Header />
      <div className="page col g24 route" style={{ paddingTop: 48, paddingBottom: 64, maxWidth: 'calc(760px + var(--px) * 2)' }}>
        <div className="col g8">
          <h1 className="h1-lg">{t('Partner dashboard')}</h1>
          <p className="lg muted">{t('The partner dashboard shows your day as one schedule: every table, specialist or court, with requests that need an answer.')}</p>
        </div>
        <div className="card col g16 card-p24 stagger">
          {([[I.calendar, 'One schedule', 'Bookings from the site appear on the grid as they are made.'],
            [I.check, 'Accept or decline', 'Large groups and hotel stays wait for your confirmation.'],
            [I.settings, 'Your rules and prices', 'Change prices, tables and cancellation rules yourself.']] as const).map(([icon, title, text]) => (
            <div key={title} className="row g12 start"><Icon n={icon} size={24} color="var(--accent)" /><div className="col"><span className="b">{t(title)}</span><span className="sm muted">{t(text)}</span></div></div>
          ))}
        </div>
        {user
          ? <Banner kind="info" title={t('This account is a guest account')}>{t('Send a partner request and we will set up a venue account for you.')} <Link className="link" to="/partners">{t('List your business')}</Link></Banner>
          : <div className="row g8"><Link to={loginUrl('/business')} className="btn btn-primary">{t('Log in to the dashboard')}</Link><Link to="/partners" className="btn btn-secondary">{t('List your business')}</Link></div>}
      </div>
    </>
  );
}
