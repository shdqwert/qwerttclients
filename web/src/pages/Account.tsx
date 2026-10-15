// Макеты «20 · Подтверждение», «21 · Профиль», «22 · Мои брони», «23 · Детали брони», «24 · Настройки», «25 · Уведомления».
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { diffDays, fmtLong, fmtMd, fmtMonth, fmtRange, fmtShort, nowInTz, plural } from '../../../shared/dates.ts';
import { money } from '../../../shared/pricing.ts';
import type { Booking, BookingStatus, Notification, PlaceCard } from '../../../shared/types.ts';
import { api, type BookingLists } from '../api.ts';
import { Avatar } from '../ui.tsx';
import { PageTitle, PlaceTile } from '../layout.tsx';
import { today } from '../search.tsx';
import { useApp } from '../state.tsx';
import {
  Banner, Calendar, Empty, ErrorBox, Field, I, Icon, Lines, Modal, PasswordInput, Skeleton, Stepper, TextInput, Thumb, Toggle, useLoad, useSubmit,
} from '../ui.tsx';
import { LANGS, type Lang, t, type Theme, tl, usePrefs } from '../i18n.tsx';
import { quote } from '../../../shared/pricing.ts';
import type { Line } from '../../../shared/types.ts';

const STATUS: Record<BookingStatus, [string, string]> = {
  confirmed: ['success', 'Confirmed'], pending: ['warn', 'Pending'], cancelled: ['danger', 'Cancelled'], completed: ['', 'Completed'],
};
const StatusBadge = ({ status }: { status: BookingStatus }) => <span className={`badge ${STATUS[status][0]}`}>{t(STATUS[status][1])}</span>;

function when(b: Booking): string {
  if (b.kind === 'hotel' && b.endDate) return `${fmtRange(b.date, b.endDate)} · ${plural(diffDays(b.date, b.endDate), 'night')} · ${plural(b.party, 'guest')}`;
  const who = b.kind === 'salon' ? '' : b.kind === 'event' ? plural(b.party, 'place') : plural(b.party, 'guest');
  return [fmtShort(b.date), b.time, who].filter(Boolean).join(' · ');
}

const mapsUrl = (b: Booking) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.place.name}, ${b.place.address}, Tashkent`)}`;

/** Сводка брони на языке интерфейса: пересчёт по настройкам места; пока они грузятся — сохранённая сводка. */
function useLocalSummary(b: Booking | undefined) {
  const place = useLoad(() => (b ? api.place(b.place.slug) : Promise.resolve(undefined)), [b?.place.slug]);
  if (!b || !place.data) return b ? { summary: b.summary, priceLines: b.priceLines } : null;
  const q = quote(b.kind, b.place.name, place.data.config, {
    date: b.date, time: b.time ?? undefined, endDate: b.endDate ?? undefined, party: b.party, resource: b.resource ?? undefined, selection: b.selection,
  });
  return { summary: q.summary, priceLines: q.priceLines };
}

/** Строки брони для карточки: дата целиком, остальное — из сводки. */
function detailRows(b: Booking, loc: { summary: Line[]; priceLines: Line[] } | null) {
  const summary = loc?.summary ?? b.summary;
  const skip = new Set([t('Date'), t('Check-in'), t('Check-out'), 'Date', 'Check-in', 'Check-out']);
  const rest = summary.filter((l) => !skip.has(l.label));
  const dates = b.kind === 'hotel' && b.endDate
    ? [{ label: 'Check-in', value: fmtLong(b.date) }, { label: 'Check-out', value: fmtLong(b.endDate) }]
    : [{ label: 'Date', value: fmtLong(b.date) }];
  return [...dates, ...rest, ...(loc?.priceLines ?? b.priceLines), ...(b.total > 0 ? [{ label: 'Total, pay at the venue', value: money(b.total) }] : []),
    { label: 'Name', value: `${b.contact.firstName} ${b.contact.lastName}` }, { label: 'Reference', value: b.ref }];
}

function PlaceHead({ b, action }: { b: Booking; action?: React.ReactNode }) {
  return (
    <div className="row g16" style={{ padding: 16 }}>
      <Thumb color={b.place.color} icon={b.place.icon} size={64} />
      <div className="col grow">
        <Link to={`/place/${b.place.slug}`} className="h3">{b.place.name}</Link>
        <span className="sm muted">{b.place.subtitle}</span>
        <span className="sm muted row g4" style={{ marginTop: 2 }}><Icon n={I.pin} size={14} /> {b.place.address}, {b.place.neighbourhood}</span>
      </div>
      {action}
    </div>
  );
}

export function Confirmation() {
  const { ref = '' } = useParams();
  const [sp] = useSearchParams();
  const key = sp.get('key');
  const { user, toast } = useApp();
  const res = useLoad(() => api.booking(ref, key), [ref, key]);
  const loc = useLocalSummary(res.data);
  const b = res.data;
  useEffect(() => { document.title = `${t('Booking confirmed')} — qwerttclients`; }, []);
  if (res.error) return <div className="px" style={{ paddingTop: 48 }}><ErrorBox error={res.error} onRetry={res.reload} /></div>;
  if (!b) return <div className="px" style={{ paddingTop: 48, maxWidth: 760 }}><Skeleton rows={4} /></div>;
  const pending = b.status === 'pending';
  const manage = `/account/bookings/${b.ref}${key ? `?key=${key}` : ''}`;
  const share = async () => {
    const text = `${b.place.name} · ${when(b)} · ref ${b.ref}`;
    if (navigator.share) await navigator.share({ title: b.place.name, text }).catch(() => undefined);
    else { await navigator.clipboard.writeText(text); toast('Copied', text); }
  };
  return (
    <div className="page row start center" style={{ paddingTop: 48, paddingBottom: 64, gap: 48 }}>
      <div className="col g24" style={{ width: 640 }}>
        <div className="col g12">
          <span style={{ width: 56, height: 56, borderRadius: '50%', background: pending ? 'var(--warn)' : 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon n={pending ? I.clock : I.check} size={28} color="#fff" sw={2.5} />
          </span>
          <h1 className="h1-lg">{pending ? t("Request sent to {a}", { a: b.place.name }) : t("You're booked at {a}", { a: b.place.name })}</h1>
          <p className="lg muted">
            {pending ? t("{a} confirms this booking manually. You will see the answer in My bookings.", { a: b.place.name }) : t("Show the reference at the door.")}{' '}{t("The booking is linked to")}{' '}{b.contact.email}.
          </p>
        </div>
        <div className="card">
          <PlaceHead b={b} />
          <hr className="hr" />
          <div className="lines" style={{ padding: '0 16px' }}>
            {detailRows(b, loc).map((l) => <div key={l.label} className="line-row"><span className="muted">{t(l.label)}</span><span className="sb">{l.value}</span></div>)}
          </div>
        </div>
        <div className="row g8">
          <a className="btn btn-primary" href={api.icsUrl(b.ref, key)}><Icon n={I.calendar} color="#fff" />{' '}{t("Add to calendar")}</a>
          <a className="btn btn-secondary" href={mapsUrl(b)} target="_blank" rel="noreferrer"><Icon n={I.map} />{' '}{t("Directions")}</a>
          <button type="button" className="btn btn-secondary" onClick={() => void share()}><Icon n={I.share} />{' '}{t("Share")}</button>
        </div>
      </div>
      <aside className="col g16" style={{ width: 340 }}>
        <div className="card col g12" style={{ padding: 16 }}>
          <span className="h3">{t("Need to change something?")}</span>
          <span className="muted sm">{b.canCancelFree ? t("Free cancellation until {a}.", { a: b.cancelUntil }) : t("This booking is past its free cancellation time.")}{' '}{t("You can manage it any time.")}</span>
          <Link to={manage} className="btn btn-secondary btn-block">{t("Manage booking")}</Link>
        </div>
        <div className="card col g12" style={{ padding: 16 }}>
          <span className="h3">{t("Before you go")}</span>
          {b.kind === 'restaurant' && <div className="row g8 sm muted start"><Icon n={I.clock} /><span>{t("The table is held for 15 minutes after")}{' '}{b.time}.</span></div>}
          <div className="row g8 sm muted start"><Icon n={I.bell} /><span>{user ? t("You will get a reminder in Notifications on the day.") : t("Keep the reference {a} — it is how the venue finds your booking.", { a: b.ref })}</span></div>
        </div>
        {!user && (
          <div className="card col g12" style={{ padding: 16, background: 'var(--accent-tint)', borderColor: 'var(--accent-tint-2)' }}>
            <span className="h3">{t("Create an account")}</span>
            <span className="sm muted">{t("Sign up with")}{' '}{b.contact.email}{' '}{t("and this booking appears in My bookings.")}</span>
            <div><Link to="/signup" className="btn btn-primary btn-sm">{t("Sign up")}</Link></div>
          </div>
        )}
      </aside>
    </div>
  );
}

function BookingRow({ b }: { b: Booking }) {
  const open = b.status === 'confirmed' || b.status === 'pending';
  return (
    <div className="card row g16" style={{ padding: 16 }}>
      <Thumb color={b.place.color} icon={b.place.icon} size={64} />
      <div className="col g4 grow">
        <div className="row g8"><Link to={`/account/bookings/${b.ref}`} className="h3">{b.place.name}</Link><StatusBadge status={b.status} /></div>
        <span className="muted row g8"><Icon n={I.calendar} size={14} />{when(b)}</span>
        <span className="sm subtle">{t("Ref")}{' '}{b.ref} · {b.place.address}</span>
      </div>
      <div className="row g8">
        {open ? (
          <>
            <Link to={`/account/bookings/${b.ref}`} className="btn btn-secondary btn-sm">{t("Manage")}</Link>
            <a href={mapsUrl(b)} target="_blank" rel="noreferrer" className="btn btn-subtle btn-sm">{t("Get directions")}</a>
          </>
        ) : (
          <>
            <Link to={`/book/${b.place.slug}`} className="btn btn-secondary btn-sm">{t("Book again")}</Link>
            {b.status === 'completed' && <Link to={`/place/${b.place.slug}#reviews`} className="btn btn-subtle btn-sm">{t("Leave a review")}</Link>}
          </>
        )}
      </div>
    </div>
  );
}

const KIND_CHIPS: [string, string][] = [['', 'All'], ['restaurant', 'Restaurants'], ['salon', 'Beauty & health'], ['hotel', 'Hotels'], ['sport', 'Sports'], ['event', 'Events']];

export function MyBookings() {
  const res = useLoad(() => api.bookings(), []);
  const [tab, setTab] = useState<keyof BookingLists>('upcoming');
  const [kind, setKind] = useState('');
  const data = res.data;
  const list = (data?.[tab] ?? []).filter((b) => !kind || b.kind === kind);
  return (
    <>
      <PageTitle title={t("My bookings")}>{t("Everything you booked, in one place.")}</PageTitle>
      <div className="col g16">
        <div className="tabs" role="tablist">
          {(['upcoming', 'past', 'cancelled'] as const).map((t) => (
            <button type="button" key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
              {t[0]!.toUpperCase() + t.slice(1)} {t === 'upcoming' && data && data.upcoming.length > 0 && <span className="badge info">{data.upcoming.length}</span>}
            </button>
          ))}
        </div>
        <div className="row g8">
          {KIND_CHIPS.map(([id, label]) => <button type="button" key={id} className={`chip ${kind === id ? 'on' : ''}`} aria-pressed={kind === id} onClick={() => setKind(id)}>{t(label)}</button>)}
        </div>
        {res.error && <ErrorBox error={res.error} onRetry={res.reload} />}
        {!data && !res.error && <Skeleton rows={3} height={96} />}
        {data && list.length === 0 && (
          <Empty icon={I.calendar} title={tab === 'upcoming' ? t("No bookings yet") : t("No {a} bookings", { a: tab })} action={<Link to="/" className="btn btn-primary btn-sm">{t("Explore places")}</Link>}>
            {tab === 'upcoming' ? t("When you book, it appears here.") : t("Nothing to show for this filter.")}
          </Empty>
        )}
        <div className="col g12">{list.map((b) => <BookingRow key={b.ref} b={b} />)}</div>
        {data && tab === 'upcoming' && data.past.length > 0 && !kind && (
          <>
            <h2 className="h3" style={{ marginTop: 16 }}>{t("Recently completed")}</h2>
            <BookingRow b={data.past[0]!} />
          </>
        )}
      </div>
    </>
  );
}

function ChangeTime({ b, bkey, onDone, onClose }: { b: Booking; bkey: string | null; onDone: (b: Booking) => void; onClose: () => void }) {
  const [date, setDate] = useState(b.date);
  const [time, setTime] = useState(b.time ?? '');
  const [month, setMonth] = useState(b.date.slice(0, 7));
  const opts = { service: b.selection.service, duration: b.selection.duration };
  const cal = useLoad(() => api.calendar(b.place.slug, { month, ...opts }), [month]);
  const avail = useLoad(() => api.availability(b.place.slug, { date, exclude: b.ref, ...opts }), [date]);
  const form = useSubmit();
  // Перенос возможен только в пределах того же ресурса: зоны, мастера или корта.
  const left = (t: string) => avail.data?.resources.find((r) => r.id === b.resource)?.left[t] ?? 0;
  const changed = date !== b.date || time !== b.time;
  return (
    <Modal label={t("Change date or time")} onClose={onClose} width={720}>
      <span className="h3">{t("Change date or time")}</span>
      <div className="row g24 start">
        <div style={{ width: 340, flexShrink: 0 }}><Calendar month={month} onMonth={setMonth} states={cal.data} today={today()} selected={date} onPick={(d) => { setDate(d); setTime(''); }} /></div>
        <div className="col g8 grow">
          <span className="label">{fmtShort(date)}</span>
          {avail.error ? <ErrorBox error={avail.error} onRetry={avail.reload} /> : !avail.data ? <Skeleton rows={2} /> : (
            <div className="grid3" style={{ gap: 8, maxHeight: 300, overflowY: 'auto' }}>
              {avail.data.times.map((t) => (
                <button type="button" key={t} disabled={left(t) === 0} aria-pressed={time === t} className={`slot ${left(t) === 0 ? 'off' : time === t ? 'sel' : ''}`} onClick={() => setTime(t)}>{t}</button>
              ))}
            </div>
          )}
        </div>
      </div>
      {form.error && <Banner kind={form.error.code === 'slot_taken' ? 'warn' : 'danger'} title={t("Could not move the booking")}>{form.error.message}</Banner>}
      <div className="row g8 end">
        <button type="button" className="btn btn-secondary" onClick={onClose}>{t("Keep as is")}</button>
        <button type="button" className="btn btn-primary" disabled={!changed || !time || form.busy} onClick={async () => { const r = await form.run(() => api.changeBooking(b.ref, { date, time }, bkey)); if (r) onDone(r); }}>{t("Save changes")}</button>
      </div>
    </Modal>
  );
}

export function BookingDetail() {
  const { ref = '' } = useParams();
  const [sp] = useSearchParams();
  const key = sp.get('key');
  const { user, toast } = useApp();
  const res = useLoad(() => api.booking(ref, key), [ref, key]);
  const loc = useLocalSummary(res.data);
  const [modal, setModal] = useState<'time' | 'guests' | 'cancel' | null>(null);
  const [party, setParty] = useState(2);
  const form = useSubmit();
  const b = res.data;
  useEffect(() => { document.title = `Booking ${ref} — qwerttclients`; }, [ref]);
  useEffect(() => { if (b) setParty(b.party); }, [b]);

  if (res.error) {
    return (
      <div className="page col g16" style={{ paddingTop: 48, paddingBottom: 64 }}>
        <ErrorBox error={res.error} onRetry={res.reload} />
        {!user && <span className="muted">{t("If this is your booking,")}{' '}<Link className="link" to={`/login?next=${encodeURIComponent(`/account/bookings/${ref}`)}`}>{t("log in")}</Link>{' '}{t("to see it.")}</span>}
      </div>
    );
  }
  if (!b) return <div className="page" style={{ paddingTop: 48 }}><Skeleton rows={4} /></div>;

  const open = b.status === 'confirmed' || b.status === 'pending';
  const movable = open && (b.kind === 'restaurant' || b.kind === 'salon' || b.kind === 'sport');
  const done = (next: Booking, message: string) => { res.set(next); setModal(null); form.clear(); toast(message, when(next)); };
  const banner = {
    confirmed: <Banner kind="success" title={t("Confirmed")}>{b.canCancelFree ? t("Free cancellation until {a}.", { a: b.cancelUntil }) : t("The free cancellation time has passed.")}</Banner>,
    pending: <Banner kind="warn" icon={I.clock} title={t("Waiting for the venue")}>{b.place.name}{' '}{t("confirms this booking manually. Nothing else is needed from you.")}</Banner>,
    cancelled: <Banner kind="danger" title={t("Cancelled")}>{t("This booking was cancelled and the slot was released.")}</Banner>,
    completed: <Banner kind="info" title={t("Completed")}>{t("We hope you enjoyed it. You can book again or leave a review.")}</Banner>,
  }[b.status];

  return (
    <div className="page" style={{ paddingBottom: 64 }}>
      <nav className="row g8 sm" style={{ padding: '16px 0' }}>
        {user ? <Link to="/account/bookings" className="row g4 sb muted"><Icon n={I.left} size={14} />{' '}{t("My bookings")}</Link> : <Link to="/" className="row g4 sb muted"><Icon n={I.left} size={14} />{' '}{t("Home")}</Link>}
      </nav>
      <div className="row between" style={{ marginBottom: 16 }}>
        <h1 className="h1">{t("Booking")}{' '}{b.ref}</h1>
        <StatusBadge status={b.status} />
      </div>
      <div className="row g32 start">
        <div className="col g24 grow">
          {banner}
          <section className="card">
            <PlaceHead b={b} action={<a className="btn btn-secondary btn-sm" href={mapsUrl(b)} target="_blank" rel="noreferrer"><Icon n={I.map} size={14} />{' '}{t("Directions")}</a>} />
            <hr className="hr" />
            <div className="lines" style={{ padding: '0 16px' }}>
              {detailRows(b, loc).map((l) => <div key={l.label} className="line-row"><span className="muted">{t(l.label)}</span><span className="sb">{l.value}</span></div>)}
            </div>
          </section>
          {b.requests && (
            <section className="card" style={{ padding: 16 }}>
              <h2 className="h3" style={{ marginBottom: 8 }}>{t("Special requests")}</h2>
              <span className="muted">{b.requests}</span>
            </section>
          )}
        </div>
        <aside className="col g16" style={{ width: 340 }}>
          <div className="card col g8" style={{ padding: 16 }}>
            <span className="h3">{t("Manage booking")}</span>
            {movable && <button type="button" className="btn btn-secondary btn-block" style={{ justifyContent: 'flex-start' }} onClick={() => setModal('time')}><Icon n={I.calendar} />{' '}{t("Change date or time")}</button>}
            {open && b.kind === 'restaurant' && <button type="button" className="btn btn-secondary btn-block" style={{ justifyContent: 'flex-start' }} onClick={() => setModal('guests')}><Icon n={I.users} />{' '}{t("Change guests")}</button>}
            {open && <a className="btn btn-secondary btn-block" style={{ justifyContent: 'flex-start' }} href={api.icsUrl(b.ref, key)}><Icon n={I.calPlus} />{' '}{t("Add to calendar")}</a>}
            {!open && <Link to={`/book/${b.place.slug}`} className="btn btn-secondary btn-block" style={{ justifyContent: 'flex-start' }}><Icon n={I.refresh} />{' '}{t("Book again")}</Link>}
            {open && (
              <>
                <hr className="hr" style={{ margin: '4px 0' }} />
                <button type="button" className="btn btn-danger-o btn-block" style={{ justifyContent: 'flex-start' }} onClick={() => setModal('cancel')}><Icon n={I.cancel} color="var(--danger)" />{' '}{t("Cancel booking")}</button>
              </>
            )}
            {open && !movable && <span className="sm subtle">{t("To change dates or tickets, cancel this booking and book again.")}</span>}
          </div>
          <div className="card col g8" style={{ padding: 16 }}>
            <span className="h3">{t("Contact")}{' '}{b.place.name}</span>
            <a className="muted row g8" href={`tel:${b.place.phone.replace(/\s/g, '')}`}><Icon n={I.phone} /> {b.place.phone}</a>
            <span className="muted row g8"><Icon n={I.pin} /> {b.place.address}, {b.place.neighbourhood}</span>
          </div>
        </aside>
      </div>

      {modal === 'time' && <ChangeTime b={b} bkey={key} onClose={() => setModal(null)} onDone={(n) => done(n, t('Booking updated'))} />}
      {modal === 'guests' && (
        <Modal label={t("Change guests")} onClose={() => setModal(null)} width={360}>
          <span className="h3">{t("Change guests")}</span>
          <div className="row between"><span className="b">{t("Guests")}</span><Stepper value={party} min={1} max={20} onChange={setParty} label="guests" /></div>
          {party >= 8 && <span className="sm muted">{t("Groups of 8+ are confirmed by the restaurant.")}</span>}
          {form.error && <Banner kind="danger" title={t("Could not update")}>{form.error.message}</Banner>}
          <div className="row g8 end">
            <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>{t("Keep as is")}</button>
            <button type="button" className="btn btn-primary" disabled={party === b.party || form.busy} onClick={async () => { const r = await form.run(() => api.changeBooking(b.ref, { party }, key)); if (r) done(r, t('Booking updated')); }}>{t("Save")}</button>
          </div>
        </Modal>
      )}
      {modal === 'cancel' && (
        <Modal label={t("Cancel this booking?")} onClose={() => setModal(null)} width={380}>
          <div className="col g4">
            <span className="h3">{t("Cancel this booking?")}</span>
            <span className="muted">{b.canCancelFree ? t("It will be released immediately, free of charge.") : t("The free cancellation time has passed; the venue may charge a fee.")}</span>
          </div>
          {form.error && <Banner kind="danger" title={t("Could not cancel")}>{form.error.message}</Banner>}
          <div className="row g8 end">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModal(null)}>{t("Keep")}</button>
            <button type="button" className="btn btn-danger btn-sm" disabled={form.busy} onClick={async () => { const r = await form.run(() => api.cancelBooking(b.ref, key)); if (r) done(r, t('Booking cancelled')); }}>{t("Cancel booking")}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function Profile() {
  const { user, setUser, toast } = useApp();
  const stats = useLoad(() => api.stats(), []);
  const [v, setV] = useState({ firstName: user!.firstName, lastName: user!.lastName, email: user!.email, phone: user!.phone });
  const [pw, setPw] = useState<{ current: string; password: string } | null>(null);
  const form = useSubmit();
  const pwForm = useSubmit();
  const u = user!;
  const dirty = v.firstName !== u.firstName || v.lastName !== u.lastName || v.email !== u.email || v.phone !== u.phone;
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const r = await form.run(() => api.updateMe(v));
    if (r) { setUser(r.user); toast(t('Profile saved')); }
  };
  const since = fmtMonth(u.createdAt.slice(0, 7));
  const f = form.fields;
  return (
    <>
      <PageTitle title={t("Profile")} />
      <div className="col g24">
        <div className="row g16" style={{ alignItems: 'stretch' }}>
          <div className="card row g16 grow" style={{ padding: 16 }}>
            <Avatar user={u} size="xl" />
            <div className="col g8 grow"><div className="col"><span className="h2">{u.firstName} {u.lastName}</span><span className="muted">{t("Member since")}{' '}{since}</span></div><PhotoButtons /></div>
          </div>
          {([[t("Upcoming"), stats.data?.upcoming, '/account/bookings'], [t("Past bookings"), stats.data?.past, '/account/bookings'], [t("Saved places"), stats.data?.saved, '/account/saved']] as const).map(([label, n, to]) => (
            <Link key={label} to={to} className="card col" style={{ padding: 16, width: 130 }}><span className="h1">{n ?? '–'}</span><span className="muted">{label}</span></Link>
          ))}
        </div>

        <form className="card" style={{ padding: 24 }} onSubmit={save} noValidate>
          <h2 className="h2" style={{ marginBottom: 16 }}>{t("Personal details")}</h2>
          <div className="col g16">
            <div className="row g16 start">
              <Field label={t("First name")} error={f.firstName}><TextInput value={v.firstName} onChange={(x) => setV({ ...v, firstName: x })} error={!!f.firstName} autoComplete="given-name" /></Field>
              <Field label={t("Last name")} error={f.lastName}><TextInput value={v.lastName} onChange={(x) => setV({ ...v, lastName: x })} error={!!f.lastName} autoComplete="family-name" /></Field>
            </div>
            <div className="row g16 start">
              <Field label={t("Email")} error={f.email}><TextInput type="email" icon={I.mail} value={v.email} onChange={(x) => setV({ ...v, email: x })} error={!!f.email} autoComplete="email" /></Field>
              <Field label={t("Phone")} error={f.phone}><TextInput type="tel" icon={I.phone} value={v.phone} onChange={(x) => setV({ ...v, phone: x })} error={!!f.phone} placeholder="+998 90 123 45 67" autoComplete="tel" /></Field>
            </div>
          </div>
          <div className="row g8 end" style={{ marginTop: 16 }}>
            <button type="button" className="btn btn-secondary" disabled={!dirty} onClick={() => { setV({ firstName: u.firstName, lastName: u.lastName, email: u.email, phone: u.phone }); form.clear(); }}>{t("Cancel")}</button>
            <button type="submit" className="btn btn-primary" disabled={!dirty || form.busy}>{t("Save changes")}</button>
          </div>
        </form>

        <section className="card" style={{ padding: 24 }}>
          <h2 className="h2" style={{ marginBottom: 8 }}>{t("Security")}</h2>
          <div className="lines">
            <div className="line-row">
              <div className="col"><span className="b">{t("Password")}</span><span className="sm muted">{t("Last changed")}{' '}{fmtMd(u.passwordChangedAt.slice(0, 10))}, {u.passwordChangedAt.slice(0, 4)}</span></div>
              {!pw && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPw({ current: '', password: '' })}>{t("Change")}</button>}
            </div>
            {pw && (
              <form className="col g12" style={{ padding: '16px 0', borderBottom: '1px solid var(--line)' }} noValidate
                onSubmit={async (e) => { e.preventDefault(); const r = await pwForm.run(() => api.changePassword(pw.current, pw.password)); if (r) { setUser(r.user); setPw(null); toast(t('Password changed')); } }}>
                <div className="row g16 start">
                  <Field label={t("Current password")} error={pwForm.fields.current}><PasswordInput value={pw.current} onChange={(x) => setPw({ ...pw, current: x })} error={!!pwForm.fields.current} /></Field>
                  <Field label={t("New password")} error={pwForm.fields.password} help={t("8+ characters with a number")}><PasswordInput value={pw.password} onChange={(x) => setPw({ ...pw, password: x })} error={!!pwForm.fields.password} placeholder={t("Create a password")} autoComplete="new-password" /></Field>
                </div>
                <div className="row g8 end">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setPw(null); pwForm.clear(); }}>{t("Cancel")}</button>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={pwForm.busy}>{t("Update password")}</button>
                </div>
              </form>
            )}
            <TwoFactorRow />
            <div className="line-row">
              <div className="col"><span className="b">{t("Active sessions")}</span><span className="sm muted">{u.sessions > 1 ? t('This device and {n} more', { n: u.sessions - 1 }) : t('This device only')} · {t('sessions end after 30 minutes of inactivity')}</span></div>
              <button type="button" className="btn btn-subtle btn-sm" disabled={u.sessions <= 1} onClick={async () => { const r = await api.revokeOthers(); setUser(r.user); toast(t('Other devices logged out')); }}>{t("Log out other devices")}</button>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

export function Saved() {
  const places = useLoad(async () => {
    const [slugs, all] = await Promise.all([api.saved(), api.places({ perPage: 50 })]);
    return slugs.map((s) => all.items.find((p) => p.slug === s)).filter((p): p is PlaceCard => !!p);
  }, []);
  return (
    <>
      <PageTitle title={t("Saved places")}>{t("Places you marked with a heart.")}</PageTitle>
      {places.error && <ErrorBox error={places.error} onRetry={places.reload} />}
      {!places.data && !places.error && <Skeleton rows={2} height={120} />}
      {places.data?.length === 0 && <Empty icon={I.heart} title={t("Nothing saved yet")} action={<Link to="/" className="btn btn-primary btn-sm">{t("Explore places")}</Link>}>{t("Tap the heart on any place to keep it here.")}</Empty>}
      <div className="grid3" style={{ gap: 16 }}>
        {places.data?.map((p) => <PlaceTile key={p.slug} place={p} showAddress onSaved={(s) => { if (!s) places.set(places.data!.filter((x) => x.slug !== p.slug)); }} />)}
      </div>
    </>
  );
}

const NOTE_ICON: Record<Notification['type'], [string, string, string]> = {
  confirmed: [I.check, 'var(--success-tint)', 'var(--success)'], reminder: [I.clock, 'var(--warn-tint)', 'var(--warn)'],
  booking: [I.calendar, 'var(--accent-tint)', 'var(--accent)'], offer: [I.tag, 'var(--accent-tint)', 'var(--accent)'],
  review: [I.starLine, 'var(--warn-tint)', 'var(--warn)'], cancelled: [I.cancel, 'var(--danger-tint)', 'var(--danger)'],
  declined: [I.cancel, 'var(--danger-tint)', 'var(--danger)'], updated: [I.calendar, 'var(--accent-tint)', 'var(--accent)'],
  waitlist: [I.bell, 'var(--success-tint)', 'var(--success)'],
};

export function Notifications() {
  const res = useLoad(() => api.notifications(), []);
  const [tab, setTab] = useState<'all' | 'bookings' | 'offers'>('all');
  const navigate = useNavigate();
  const now = nowInTz();
  const local = (iso: string) => nowInTz(new Date(iso));
  const list = (res.data ?? []).filter((n) => tab === 'all' || n.group === tab);
  const groups: [string, Notification[]][] = [
    [t('Today'), list.filter((n) => local(n.createdAt).date === now.date)],
    [t('Earlier'), list.filter((n) => local(n.createdAt).date !== now.date)],
  ];
  const openNote = async (n: Notification) => {
    if (!n.read) { await api.markRead(n.id).catch(() => undefined); res.set(res.data!.map((x) => (x.id === n.id ? { ...x, read: true } : x))); }
    if (n.link) navigate(n.link);
  };
  return (
    <>
      <PageTitle title={t("Notifications")} />
      <div className="col g16">
        <div className="row between">
          <div className="tabs grow" style={{ marginRight: 16 }} role="tablist">
            {(['all', 'bookings', 'offers'] as const).map((t) => (
              <button type="button" key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{t[0]!.toUpperCase() + t.slice(1)}</button>
            ))}
          </div>
          <button type="button" className="btn btn-subtle btn-sm" disabled={!res.data?.some((n) => !n.read)}
            onClick={async () => { await api.markRead(); res.set(res.data!.map((n) => ({ ...n, read: true }))); }}>{t("Mark all as read")}</button>
        </div>
        {res.error && <ErrorBox error={res.error} onRetry={res.reload} />}
        {!res.data && !res.error && <Skeleton rows={3} height={64} />}
        {res.data && list.length === 0 && <Empty icon={I.bell} title={t("No notifications")}>{t("Booking updates and offers will show up here.")}</Empty>}
        {list.length > 0 && (
          <div className="card" style={{ overflow: 'hidden' }}>
            {groups.map(([label, items]) => items.length > 0 && (
              <div key={label}>
                <div className="up" style={{ padding: '12px 16px', background: 'var(--surface-2)' }}>{label}</div>
                {items.map((n) => {
                  const [icon, bg, color] = NOTE_ICON[n.type];
                  const at = local(n.createdAt);
                  return (
                    <button type="button" key={n.id} className="row g12 start" onClick={() => void openNote(n)}
                      style={{ padding: 16, borderBottom: '1px solid var(--line)', background: n.read ? '#fff' : '#FAFCFF', width: '100%', textAlign: 'left' }}>
                      <span aria-label={n.read ? undefined : t("Unread")} style={{ width: 8, height: 8, borderRadius: '50%', background: n.read ? 'transparent' : 'var(--accent)', flexShrink: 0, marginTop: 14 }} />
                      <span style={{ width: 36, height: 36, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon n={icon} size={18} color={color} /></span>
                      <div className="col grow"><span className="b">{noteText(n).title}</span><span className="muted">{noteText(n).body}</span></div>
                      <span className="sm subtle">{at.date === now.date ? at.time : fmtMd(at.date)}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export function Settings() {
  const prefs = usePrefs();
  const { user, setUser, toast } = useApp();
  const navigate = useNavigate();
  const [del, setDel] = useState(false);
  const [password, setPassword] = useState('');
  const form = useSubmit();
  const s = user!.settings;
  const [failed, setFailed] = useState('');
  const toggle = async (key: 'notifyUpdates' | 'notifyReminders' | 'notifyOffers', value: boolean) => {
    setFailed('');
    try { setUser((await api.updateSettings({ [key]: value })).user); } catch (e) { setFailed((e as Error).message); }
  };
  const rows: ['notifyUpdates' | 'notifyReminders' | 'notifyOffers', string, string][] = [
    ['notifyUpdates', 'Booking updates', 'Confirmations and changes in your Notifications.'],
    ['notifyReminders', 'Reminders', 'A reminder on the day of your booking.'],
    ['notifyOffers', 'Offers near you', 'Deals from places you like, at most once a week.'],
  ];
  return (
    <>
      <PageTitle title={t("Settings")} />
      <div className="col g24">
        <section className="card" style={{ padding: '8px 24px' }}>
          <div style={{ padding: '16px 0 0' }}><h2 className="h2">{t("Notify me about")}</h2></div>
          <div className="lines">
            {rows.map(([key, title, note]) => (
              <div key={key} className="line-row" style={{ padding: '16px 0' }}>
                <div className="col grow"><span className="b">{t(title)}</span><span className="muted sm">{t(note)}</span></div>
                <Toggle on={s[key]} onChange={(v) => void toggle(key, v)} label={title} />
              </div>
            ))}
          </div>
        </section>
        {failed && <Banner kind="danger" title={t("Could not save the setting")}>{failed}</Banner>}
        <section className="card" style={{ padding: 24 }}>
          <h2 className="h2" style={{ marginBottom: 16 }}>{t('Language and appearance')}</h2>
          <div className="row g16 start">
            <Field label={t('Language')}>
              <div className="input"><Icon n={I.languages} color="var(--ink-3)" />
                <select value={prefs.lang} onChange={(e) => { const l = e.target.value as Lang; prefs.setLang(l); void api.updateSettings({ language: l }).then((r) => setUser(r.user)).catch(() => undefined); }}>
                  {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
              </div>
            </Field>
            <Field label={t('Theme')}>
              <div className="input"><Icon n={prefs.theme === 'dark' ? 'moon' : 'i60'} color="var(--ink-3)" />
                <select value={prefs.theme} onChange={(e) => prefs.setTheme(e.target.value as Theme)}>
                  <option value="light">{t('Day')}</option>
                  <option value="dark">{t('Night')}</option>
                </select>
              </div>
            </Field>
            <Field label={t('Currency')} help={t('Prices are shown in US dollars')}><div className="input dis"><Icon n={I.card} color="var(--ink-3)" /><span>{t('US dollar ($)')}</span></div></Field>
          </div>
        </section>
        <section className="card" style={{ padding: '8px 24px' }}>
          <div className="lines">
            <div className="line-row" style={{ padding: '16px 0' }}>
              <div className="col"><span className="b">{t("Email and password")}</span><span className="muted sm">{user!.email}</span></div>
              <Link to="/account/profile" className="btn btn-secondary btn-sm">{t("Change in profile")}</Link>
            </div>
            <div className="line-row" style={{ padding: '16px 0' }}>
              <div className="col"><span className="b">{t("Delete account")}</span><span className="muted sm">{t("Removes your profile, cancels upcoming bookings and anonymises your history.")}</span></div>
              <button type="button" className="btn btn-danger-o btn-sm" onClick={() => setDel(true)}>{t("Delete")}</button>
            </div>
          </div>
        </section>
        <span className="sm subtle row g4"><Icon n={I.check} size={14} />{' '}{t("Changes are saved automatically.")}</span>
      </div>
      {del && (
        <Modal label={t("Delete account")} onClose={() => setDel(false)}>
          <div className="col g4"><span className="h3">{t("Delete your account?")}</span><span className="muted">{t("This cannot be undone. Upcoming bookings will be cancelled.")}</span></div>
          <Field label={t("Confirm with your password")} error={form.fields.password}><PasswordInput value={password} onChange={setPassword} error={!!form.fields.password} /></Field>
          {form.error && !form.fields.password && <Banner kind="danger" title={t("Could not delete")}>{form.error.message}</Banner>}
          <div className="row g8 end">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDel(false)}>{t("Keep account")}</button>
            <button type="button" className="btn btn-danger btn-sm" disabled={form.busy || !password}
              onClick={async () => { if (await form.run(() => api.deleteMe(password))) { setUser(null); navigate('/'); toast(t('Account deleted')); } }}>{t("Delete account")}</button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function Payments() {
  return (
    <>
      <PageTitle title={t("Payment methods")} />
      <Empty icon={I.card} title={t("No card needed")}>{t("Bookings on qwerttclients are free to make. You pay the venue directly when you visit, so there is nothing to store here.")}</Empty>
    </>
  );
}

/** Уменьшает фото до 256 px и сохраняет как JPEG, чтобы не хранить мегабайты. */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = 256;
  const scale = Math.max(side / bitmap.width, side / bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d')!;
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, (side - w) / 2, (side - h) / 2, w, h);
  return canvas.toDataURL('image/jpeg', 0.85);
}

function PhotoButtons() {
  const { user, setUser, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    if (!file.type.startsWith('image/')) { setError(t('Choose an image file.')); return; }
    setBusy(true);
    try {
      const r = await api.setAvatar(await shrink(file));
      setUser(r.user);
      toast(t('Photo updated'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="col g4">
      <div className="row g8">
        <label className={`btn btn-secondary btn-sm ${busy ? 'dis' : ''}`} style={{ cursor: 'pointer' }}>
          <Icon n={I.camera} size={14} /> {user?.avatar ? t('Change photo') : t('Add photo')}
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={busy} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {user?.avatar && <button type="button" className="btn btn-subtle btn-sm" onClick={async () => setUser((await api.removeAvatar()).user)}>{t('Remove')}</button>}
      </div>
      {error && <span className="help err">{error}</span>}
    </div>
  );
}

/** Двухфакторный вход: QR-код для приложения-аутентификатора, проверка кода, отключение по паролю. */
function TwoFactorRow() {
  const { user, setUser, toast } = useApp();
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [off, setOff] = useState(false);
  const [password, setPassword] = useState('');
  const form = useSubmit();
  const on = !!user?.twoFactor;
  const start = async () => { const r = await form.run(() => api.twoFactorSetup()); if (r) setSetup(r); };
  return (
    <>
      <div className="line-row">
        <div className="col"><span className="b">{t('Two-step verification')}</span><span className="sm muted">{on ? t('On · a code from your app is needed to log in') : t('Confirm log-ins with a code')}</span></div>
        <Toggle on={on} label={t('Two-step verification')} onChange={(v) => (v ? void start() : setOff(true))} />
      </div>
      {setup && (
        <Modal label={t('Turn on two-step verification')} onClose={() => { setSetup(null); form.clear(); }} width={460}>
          <span className="h3">{t('Turn on two-step verification')}</span>
          <ol className="col g8 muted" style={{ paddingLeft: 18, listStyle: 'decimal' }}>
            <li>{t('Open an authenticator app (Google Authenticator, 1Password, Authy).')}</li>
            <li>{t('Scan the QR code or enter the key manually.')}</li>
            <li>{t('Enter the 6-digit code the app shows.')}</li>
          </ol>
          <div className="row g16">
            <div style={{ width: 180, height: 180, background: '#fff', borderRadius: 'var(--r)', padding: 4, flexShrink: 0 }} dangerouslySetInnerHTML={{ __html: setup.qr }} />
            <div className="col g8 grow">
              <span className="label">{t('Key')}</span>
              <code className="sm" style={{ wordBreak: 'break-all', background: 'var(--surface-2)', padding: 8, borderRadius: 'var(--r)' }}>{setup.secret.match(/.{1,4}/g)!.join(' ')}</code>
            </div>
          </div>
          <Field label={t('Code')} error={form.fields.code}>
            <TextInput value={code} onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} error={!!form.fields.code} autoComplete="one-time-code" placeholder="123456" autoFocus />
          </Field>
          <div className="row g8 end">
            <button type="button" className="btn btn-secondary" onClick={() => { setSetup(null); form.clear(); }}>{t('Cancel')}</button>
            <button type="button" className="btn btn-primary" disabled={code.length !== 6 || form.busy}
              onClick={async () => { const r = await form.run(() => api.twoFactorEnable(code)); if (r) { setUser(r.user); setSetup(null); setCode(''); toast(t('Two-step verification is on')); } }}>{t('Turn on')}</button>
          </div>
        </Modal>
      )}
      {off && (
        <Modal label={t('Turn off two-step verification')} onClose={() => { setOff(false); form.clear(); }}>
          <span className="h3">{t('Turn off two-step verification?')}</span>
          <span className="muted">{t('Your account will be protected by the password only.')}</span>
          <Field label={t('Password')} error={form.fields.password}><PasswordInput value={password} onChange={setPassword} error={!!form.fields.password} /></Field>
          <div className="row g8 end">
            <button type="button" className="btn btn-secondary" onClick={() => { setOff(false); form.clear(); }}>{t('Keep it on')}</button>
            <button type="button" className="btn btn-danger" disabled={!password || form.busy}
              onClick={async () => { const r = await form.run(() => api.twoFactorDisable(password)); if (r) { setUser(r.user); setOff(false); setPassword(''); toast(t('Two-step verification is off')); } }}>{t('Turn off')}</button>
          </div>
        </Modal>
      )}
    </>
  );
}

/** Текст уведомления на языке интерфейса по его типу и данным; старые записи без данных показываются как есть. */
function noteText(n: Notification): { title: string; body: string } {
  const d = n.data;
  if (!d) return { title: n.title, body: n.body };
  const when = d.date ? (d.kind === 'hotel' && d.endDate ? `${fmtRange(d.date, d.endDate)}` : [fmtShort(d.date), d.time, d.party && d.kind !== 'salon' ? plural(d.party, d.kind === 'event' ? 'place' : 'guest') : ''].filter(Boolean).join(' · ')) : '';
  const name = d.place;
  switch (n.type) {
    case 'confirmed': return { title: t('Booking confirmed at {name}', { name }), body: when };
    case 'booking': return { title: t('Request sent to {name}', { name }), body: when };
    case 'updated': return { title: t('Booking at {name} updated', { name }), body: when };
    case 'cancelled': return { title: t('Booking at {name} cancelled', { name }), body: when };
    case 'declined': return { title: t('{name} could not accept your booking', { name }), body: when };
    case 'reminder': return { title: t('Reminder: {name} today', { name }), body: when };
    case 'waitlist': return { title: t('A spot opened up at {name}', { name }), body: t('{date} · book before someone else does', { date: d.date ? fmtShort(d.date) : '' }) };
    case 'review': return { title: t('How was {name}?', { name }), body: t('Leave a review for your recent visit') };
    case 'offer': return { title: t('Weekend offer near you'), body: t('15% off spa treatments at {name}', { name }) };
    default: return { title: n.title, body: n.body };
  }
}
