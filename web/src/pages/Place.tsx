// Макет «06 · Страница места».
import { type CSSProperties, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fmtMd, fmtShort, plural } from '../../../shared/dates.ts';
import { money } from '../../../shared/pricing.ts';
import type { EventConfig, HotelConfig, PlaceDetail, SalonConfig, SportConfig } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { Crumbs, SaveButton } from '../layout.tsx';
import { dateLabel, today } from '../search.tsx';
import { useApp } from '../state.tsx';
import { Art, Banner, Calendar, ErrorBox, Field, I, Icon, Popover, Rate, Stepper, TextInput, useLoad, useSubmit } from '../ui.tsx';
import { t, tl } from '../i18n.tsx';
import { authorUrl, PHOTOS, UNSPLASH_URL } from '../photos.ts';

const CAT_LABEL: Record<string, string> = {
  restaurants: 'Restaurants', cafes: 'Cafes', beauty: 'Beauty', wellness: 'Wellness', hotels: 'Hotels', sports: 'Sports', events: 'Events', health: 'Health', coworking: 'Coworking',
};
const WIDGET_TITLE: Record<string, string> = { restaurant: 'Book a table', salon: 'Book a visit', hotel: 'Book a stay', sport: 'Book a slot', event: 'Get tickets' };
const WIDGET_CTA: Record<string, string> = { restaurant: 'Reserve a table', salon: 'Choose a service', hotel: 'Choose dates', sport: 'Continue', event: 'Choose tickets' };

/** Строки блока «меню / услуги / номера»: из описания места либо из настроек бронирования. */
function highlights(p: PlaceDetail): { name: string; note: string; price: string }[] {
  if (p.highlights.length) return p.highlights;
  if (p.kind === 'salon') return (p.config as SalonConfig).services.map((s) => ({ name: s.name, note: [t('{n} min', { n: s.minutes }), s.note && t(s.note)].filter(Boolean).join(' · '), price: money(s.price) }));
  if (p.kind === 'hotel') return (p.config as HotelConfig).rooms.map((r) => ({ name: r.name, note: `${t(r.bed)} · ${r.size}`, price: `${money(r.price)} ${t('/ night')}` }));
  if (p.kind === 'sport') return (p.config as SportConfig).courts.map((c) => ({ name: c.name, note: c.note, price: `${money(c.price)} ${t('/ hour')}` }));
  if (p.kind === 'event') return (p.config as EventConfig).tickets.map((x) => ({ name: x.name, note: x.note, price: money(x.price) }));
  return [];
}

function BookingWidget({ p }: { p: PlaceDetail }) {
  const navigate = useNavigate();
  const [date, setDate] = useState(today());
  const [month, setMonth] = useState(today().slice(0, 7));
  const [guests, setGuests] = useState(2);
  const [time, setTime] = useState<string>();
  const [open, setOpen] = useState<'date' | 'guests' | null>(null);
  const timed = p.kind === 'restaurant' || p.kind === 'salon' || p.kind === 'sport';
  const avail = useLoad(() => api.availability(p.slug, { date }), [p.slug, date]);
  const cal = useLoad(() => (timed ? api.calendar(p.slug, { month }) : Promise.resolve(undefined)), [p.slug, month, timed]);

  const slots = (avail.data?.times ?? []).map((t) => ({ time: t, left: avail.data!.resources.reduce((n, r) => n + (r.left[t] ?? 0), 0) }));
  // Показываем окно из девяти слотов, начиная с первого свободного.
  const firstFree = Math.max(0, slots.findIndex((s) => s.left > 0));
  const shown = slots.slice(Math.max(0, Math.min(firstFree, slots.length - 9)), Math.max(0, Math.min(firstFree, slots.length - 9)) + 9);
  const noneLeft = !avail.loading && slots.every((s) => s.left === 0);
  useEffect(() => setTime(undefined), [date]);

  const go = () => navigate(`/book/${p.slug}?${new URLSearchParams({ ...(timed ? { date } : {}), ...(time ? { time } : {}), guests: String(guests) })}`);

  return (
    <aside className="card" style={{ width: 360, flexShrink: 0, position: 'sticky', top: 60, alignSelf: 'flex-start', marginTop: 24 }}>
      <div className="col g16" style={{ padding: 16 }}>
        <div className="row between">
          <span className="h3">{t(WIDGET_TITLE[p.kind]!)}</span>
          <span className={`badge ${p.instant ? 'success' : 'info'}`}>{p.instant ? t("Instant confirmation") : t("Confirmed by venue")}</span>
        </div>

        {timed && (
          <>
            <div className="row g8">
              <div className="field grow" style={{ position: 'relative' }}>
                <span className="label">{t("Date")}</span>
                <button type="button" className="input btnlike" aria-haspopup="dialog" aria-expanded={open === 'date'} onClick={() => setOpen(open === 'date' ? null : 'date')}>
                  <Icon n={I.calendar} color="var(--ink-3)" /><span>{dateLabel(date)}</span>
                </button>
                <Popover open={open === 'date'} onClose={() => setOpen(null)} style={{ left: 'auto', right: 0 }}>
                  <div className="card overlay" style={{ width: 340, padding: 16 }}>
                    <Calendar month={month} onMonth={setMonth} states={cal.data} today={today()} selected={date} onPick={(d) => { setDate(d); setOpen(null); }} />
                  </div>
                </Popover>
              </div>
              {p.kind === 'restaurant' && (
                <div className="field" style={{ width: 120, position: 'relative' }}>
                  <span className="label">{t("Guests")}</span>
                  <button type="button" className="input btnlike" aria-haspopup="dialog" aria-expanded={open === 'guests'} onClick={() => setOpen(open === 'guests' ? null : 'guests')}>
                    <Icon n={I.users} color="var(--ink-3)" /><span>{guests}</span>
                  </button>
                  <Popover open={open === 'guests'} onClose={() => setOpen(null)} style={{ left: 'auto', right: 0 }}>
                    <div className="card overlay row between g16" style={{ width: 220, padding: 16 }}>
                      <span className="b">{t("Guests")}</span>
                      <Stepper value={guests} min={1} max={12} onChange={setGuests} label="guests" />
                    </div>
                  </Popover>
                </div>
              )}
            </div>
            <div className="col g8">
              <span className="label">{t("Choose a time")}</span>
              {avail.error ? <ErrorBox error={avail.error} onRetry={avail.reload} />
                : avail.loading && !avail.data ? <div className="grid3" style={{ gap: 8 }}>{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skel" style={{ height: 40 }} />)}</div>
                  : noneLeft ? <div className="col g8"><Banner kind="warn" title={t("Nothing free on {a}", { a: fmtShort(date) })}>{t("Pick another date in the calendar.")}</Banner><Waitlist slug={p.slug} date={date} /></div>
                    : (
                      <div className="grid3" style={{ gap: 8 }}>
                        {shown.map((s) => (
                          <button type="button" key={s.time} disabled={s.left === 0} aria-pressed={time === s.time}
                            className={`slot ${s.left === 0 ? 'off' : time === s.time ? 'sel' : s.left <= 2 && p.kind === 'restaurant' ? 'few' : ''}`} onClick={() => setTime(s.time)}>
                            {s.time}{s.left > 0 && s.left <= 2 && p.kind === 'restaurant' && time !== s.time && <small>{s.left}{' '}{t("left")}</small>}
                          </button>
                        ))}
                      </div>
                    )}
            </div>
          </>
        )}

        {p.kind === 'hotel' && (
          <div className="col g8">
            {(p.config as HotelConfig).rooms.map((r) => (
              <div key={r.id} className="row between"><span className="muted">{t(r.name)}</span><span className="sb">{money(r.price)}{' '}{t("/ night")}</span></div>
            ))}
          </div>
        )}

        {p.kind === 'event' && (
          <div className="col g8">
            {(avail.data?.resources ?? []).slice(0, 4).map((s) => (
              <div key={s.id} className="row between">
                <span className="sb">{fmtShort(s.id)} · {(p.config as EventConfig).time}</span>
                <span className={`badge ${s.left.tickets === 0 ? '' : s.left.tickets! <= 20 ? 'warn' : 'success'}`}>{s.left.tickets === 0 ? t("Sold out") : s.left.tickets! <= 20 ? t('{n} left', { n: s.left.tickets! }) : t("Available")}</span>
              </div>
            ))}
          </div>
        )}

        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={go}>{t(WIDGET_CTA[p.kind]!)}</button>
        <span className="sm subtle row g4 center">
          <Icon n={I.shield} size={14} />{' '}{t("No payment now. Free cancellation up to")}{' '}{plural(p.cancelHours, 'hour')}{' '}{t("before.")}
        </span>
      </div>
      {p.bookedToday > 0 && (
        <div className="row g8 sm muted" style={{ padding: '12px 16px', borderTop: '1px solid var(--line)', background: 'var(--surface-2)', borderRadius: '0 0 8px 8px' }}>
          <Icon n={I.info} size={14} />{' '}{t("Booked")}{' '}{plural(p.bookedToday, 'time')}{' '}{t("today")}
        </div>
      )}
    </aside>
  );
}

/** Просмотр фотографий: стрелки, клавиатура, счётчик. */
function Lightbox({ arts, color, start, name, onClose }: { arts: string[]; color: string; start: number; name: string; onClose: () => void }) {
  const [i, setI] = useState(start);
  const go = (d: number) => setI((x) => (x + d + arts.length) % arts.length);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={t('Photos of {name}', { name })} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div key={i} className="lightbox-frame ph" style={{ '--c': color } as CSSProperties}><Art n={arts[i]!} /></div>
      <button type="button" className="btn btn-secondary btn-icon" style={{ left: 24, top: '50%' }} aria-label={t('Previous photo')} onClick={() => go(-1)}><Icon n={I.left} /></button>
      <button type="button" className="btn btn-secondary btn-icon" style={{ right: 24, top: '50%' }} aria-label={t('Next photo')} onClick={() => go(1)}><Icon n={I.right} /></button>
      <button type="button" className="btn btn-secondary btn-sm" style={{ right: 24, top: 24 }} onClick={onClose}><Icon n={I.x} size={14} /> {t('Close')}</button>
      <span className="badge" style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--surface)' }}>{i + 1} / {arts.length}</span>
      {PHOTOS[arts[i]!] && (
        <span className="sm" style={{ position: 'absolute', bottom: 28, right: 24, color: '#DEE4EA' }}>
          {t('Photo')}: <a className="link" style={{ color: '#fff' }} href={authorUrl(PHOTOS[arts[i]!]!)} target="_blank" rel="noreferrer">{PHOTOS[arts[i]!]!.author}</a> / <a className="link" style={{ color: '#fff' }} href={UNSPLASH_URL} target="_blank" rel="noreferrer">Unsplash</a>
        </span>
      )}
    </div>
  );
}

/** Лист ожидания: сообщим, когда на этот день освободится место. */
function Waitlist({ slug, date }: { slug: string; date: string }) {
  const { user } = useApp();
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const form = useSubmit();
  if (done) return <Banner kind="success" title={t('You are on the waitlist')}>{t('We will notify you if a spot opens up on {d}.', { d: fmtShort(date) })}</Banner>;
  const join = async () => { if (await form.run(() => api.waitlist(slug, date, user ? undefined : email))) setDone(true); };
  return (
    <div className="col g8">
      {!user && <Field label={t('Email for the waitlist')} error={form.fields.email}><TextInput type="email" icon={I.mail} value={email} onChange={setEmail} placeholder="name@mail.com" error={!!form.fields.email} /></Field>}
      {form.error && !form.fields.email && <span className="help err">{form.error.message}</span>}
      <button type="button" className="btn btn-secondary btn-block" disabled={form.busy} onClick={() => void join()}><Icon n={I.bell} /> {t('Join the waitlist')}</button>
    </div>
  );
}

function ReviewForm({ slug, onDone }: { slug: string; onDone: () => void }) {
  const [rating, setRating] = useState(5);
  const [text, setText] = useState('');
  const form = useSubmit();
  return (
    <form className="card col g12" style={{ padding: 16 }} onSubmit={async (e) => { e.preventDefault(); if (await form.run(() => api.review(slug, { rating, text }))) onDone(); }}>
      <span className="h3">{t("How was your visit?")}</span>
      <div className="row g4" role="radiogroup" aria-label={t("Rating")}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button type="button" key={n} role="radio" aria-checked={rating === n} aria-label={plural(n, 'star')} onClick={() => setRating(n)}>
            <Icon n={n <= rating ? I.star : I.starLine} size={24} color="#946F00" sw={n <= rating ? 1 : 1.7} />
          </button>
        ))}
      </div>
      <div className={`input ta ${form.fields.text ? 'error' : ''}`}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t("What stood out? What could be better?")} aria-label={t("Your review")} maxLength={1000} />
      </div>
      {form.error && <span className="help err"><Icon n={I.alert} size={12} />{form.error.message}</span>}
      <div><button type="submit" className="btn btn-primary" disabled={form.busy}>{t("Post review")}</button></div>
    </form>
  );
}

export function Place() {
  const { slug = '' } = useParams();
  const { toast } = useApp();
  const place = useLoad(() => api.place(slug), [slug]);
  const [tab, setTab] = useState('about');
  const [photo, setPhoto] = useState<number | null>(null);
  const [allRows, setAllRows] = useState(false);
  const p = place.data;
  useEffect(() => { if (p) document.title = `${p.name} — qwerttclients`; }, [p]);

  if (place.error) return <div className="page" style={{ padding: '48px var(--px)' }}><ErrorBox error={place.error} onRetry={place.reload} /><p style={{ marginTop: 16 }}><Link to="/search" className="link">{t("Browse all places")}</Link></p></div>;
  if (!p) return <div className="page col g16" style={{ padding: '24px var(--px)' }}><div className="skel" style={{ height: 360 }} /><div className="skel" style={{ height: 32, width: '30%' }} /><div className="skel" style={{ height: 200 }} /></div>;

  const rows = highlights(p);
  const share = async () => {
    const url = window.location.href;
    if (navigator.share) await navigator.share({ title: p.name, url }).catch(() => undefined);
    else { await navigator.clipboard.writeText(url); toast(t('Link copied'), url); }
  };
  const jump = (id: string) => { setTab(id); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const radius = ['var(--r-lg) 0 0 var(--r-lg)', '0', '0 var(--r-lg) 0 0', '0', '0 0 var(--r-lg) 0'];
  const ratingWord = t(p.rating >= 4.7 ? 'Excellent' : p.rating >= 4.3 ? 'Very good' : 'Good');

  return (
    <div className="page" style={{ paddingBottom: 56 }}>
      <Crumbs items={[['Home', '/'], ['Tashkent', '/search'], [CAT_LABEL[p.category] ?? p.category, `/search?category=${p.category}`], [p.name]]} />
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 8, height: 360 }}>
        {p.gallery.slice(0, 5).map((art, i) => (
          <button type="button" key={i} aria-label={t('Open photo {n}', { n: i + 1 })} onClick={() => setPhoto(i)} style={{ display: 'flex', minHeight: 0, position: 'relative', gridRow: i === 0 ? '1 / span 2' : undefined, cursor: 'zoom-in' }}>
            <div className="ph" style={{ '--c': p.color, flex: 1, minHeight: 0, borderRadius: radius[i], position: 'relative', overflow: 'hidden' } as CSSProperties}><Art n={art} eager={i === 0} /></div>
            {i === 4 && <span className="btn btn-secondary btn-sm" style={{ position: 'absolute', right: 8, bottom: 8 }}><Icon n={I.list} size={14} /> {t('All {n} photos', { n: p.gallery.length })}</span>}
          </button>
        ))}
      </div>

      <div className="row between start" style={{ padding: '24px 0 16px' }}>
        <div className="col g8">
          <div className="row g8">
            <h1 className="h1">{p.name}</h1>
            {p.badge && <span className={`badge ${p.badge === 'New' ? 'info' : 'success'}`}>{t(p.badge)}</span>}
          </div>
          <div className="row g16 sm muted">
            <span className="row g4"><Icon n={I.star} size={14} color="#946F00" sw={1} /> <b style={{ color: 'var(--ink)' }}>{p.rating.toFixed(1)}</b> ({plural(p.reviews, 'review')})</span>
            <span className="row g4"><Icon n={I.pin} size={14} /> {p.address}, {t(p.neighbourhood)}</span>
            <span>{t(p.subtitle.split(' · ')[1] ?? '')} · {p.priceLevel}</span>
            <span className="ok sb row g4"><Icon n={I.clock} size={14} color="var(--success)" />{' '}{t("Open until")}{' '}{p.openUntil}</span>
          </div>
        </div>
        <div className="row g8">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void share()}><Icon n={I.share} size={14} />{' '}{t("Share")}</button>
          <SaveButton place={p} variant="text" />
        </div>
      </div>

      <div className="tabs white px" style={{ position: 'sticky', top: 0, zIndex: 5, margin: '0 calc(var(--px) * -1)' }}>
        {([['about', t("Overview")], ...(rows.length ? [['highlights', t(p.highlightsTitle.split(' ')[0]!)]] : []), ['reviews', t("Reviews")], ['location', t("Location")], ['policies', t("Policies")]] as [string, string][]).map(([id, label]) => (
          <button type="button" key={id} className={`tab ${tab === id ? 'on' : ''}`} onClick={() => jump(id)}>{label}</button>
        ))}
      </div>

      <div className="row g32 start">
        <div className="col g32 grow" style={{ paddingTop: 24 }}>
          {p.deal && <Banner kind="info" icon={I.tag} title={t("Offer")}>{t(p.deal)}</Banner>}
          <section className="col g12" id="about" style={{ scrollMarginTop: 60 }}>
            <h2 className="h2">{t("About")}</h2>
            <p className="lg muted">{t(p.about)}</p>
          </section>
          <section className="col g12">
            <h2 className="h2">{t("Amenities")}</h2>
            <div className="grid3">
              {p.amenities.map((a) => <div key={a.label} className="row g8"><Icon n={a.icon} size={18} color="var(--ink-2)" />{t(a.label)}</div>)}
            </div>
          </section>
          {rows.length > 0 && (
            <section className="col g8" id="highlights" style={{ scrollMarginTop: 60 }}>
              <div className="row between"><h2 className="h2">{t(p.highlightsTitle)}</h2>{rows.length > 4 && <button type="button" className="link" onClick={() => setAllRows(!allRows)}>{allRows ? t('Show less') : p.kind === 'restaurant' ? t('Full menu') : t('Show all')}</button>}</div>
              <div className="lines">
                {(allRows ? rows : rows.slice(0, 4)).map((m) => (
                  <div key={m.name} className="line-row">
                    <div className="col"><span className="sb">{t(m.name)}</span>{m.note && <span className="sm subtle">{tl(m.note)}</span>}</div>
                    <span className="sb">{m.price}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          <section className="col g8" id="reviews" style={{ scrollMarginTop: 60 }}>
            <h2 className="h2">{t("Reviews")}</h2>
            <div className="row g24" style={{ paddingBottom: 8 }}>
              <div className="col"><span className="h1-lg">{p.rating.toFixed(1)}</span><span className="sm muted">{ratingWord}</span></div>
              <div className="col g4 grow center">
                {p.ratingBars.map((w, i) => (
                  <div key={i} className="row g8 sm">
                    <span style={{ width: 16 }}>{5 - i}</span>
                    <div className="grow" style={{ height: 6, background: 'var(--surface-3)', borderRadius: 3 }}>
                      <div style={{ width: `${w}%`, height: 6, background: 'var(--warn)', borderRadius: 3, opacity: 0.7 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {p.canReview && <ReviewForm slug={p.slug} onDone={() => { toast(t('Review posted'), t('Thanks for sharing your experience.')); place.reload(); }} />}
            {p.reviewList.length === 0 && <span className="muted">{t("No written reviews yet. Guests can review after their visit.")}</span>}
            {p.reviewList.map((r) => (
              <div key={r.id} className="col g8" style={{ padding: '16px 0', borderBottom: '1px solid var(--line)' }}>
                <div className="row g12">
                  <span className="avatar">{r.author[0]}</span>
                  <div className="col"><span className="sb">{r.author}</span><span className="sm subtle">{t("Visited")}{' '}{fmtMd(r.date)}</span></div>
                  <span className="rate grow end"><Icon n={I.star} size={13} color="#946F00" sw={1} /> {r.rating.toFixed(1)}</span>
                </div>
                <p className="muted">{t(r.text)}</p>
              </div>
            ))}
          </section>
          <section className="col g12" id="location" style={{ scrollMarginTop: 60 }}>
            <h2 className="h2">{t("Location")}</h2>
            <div style={{ height: 200, borderRadius: 'var(--r-lg)', overflow: 'hidden', position: 'relative' }}>
              <Art n="i78" />
            </div>
            <div className="row between">
              <span className="muted row g4"><Icon n={I.pin} size={14} /> {p.address}, {t(p.neighbourhood)}, {t('Tashkent')}</span>
              <a className="link" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name}, ${p.address}, Tashkent`)}`}>{t("Open in Google Maps")}</a>
            </div>
          </section>
          <section className="col g8" id="policies" style={{ scrollMarginTop: 60 }}>
            <h2 className="h2">{t("Policies")}</h2>
            <div className="muted">{t(p.policies)}</div>
          </section>
        </div>
        <BookingWidget p={p} />
      </div>
      {photo != null && <Lightbox arts={p.gallery} color={p.color} start={photo} name={p.name} onClose={() => setPhoto(null)} />}
    </div>
  );
}
