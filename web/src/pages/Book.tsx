// Макеты «07–13 · Бронь по категориям», «18 · Данные гостя», «19 · Состояния брони».
import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { addDays, addMonths, diffDays, fmtDayMonth, fmtDow, fmtRange, fmtShort, plural, toDate, toMin, TZ_LABEL } from '../../../shared/dates.ts';
import { money, quote, ticketCount } from '../../../shared/pricing.ts';
import type {
  Availability, EventConfig, HotelConfig, PlaceDetail, RestaurantConfig, SalonConfig, Selection, SportConfig,
} from '../../../shared/types.ts';
import { api } from '../api.ts';
import { today } from '../search.tsx';
import { clearDraft, type Draft, loginUrl, useApp, useDraft } from '../state.tsx';
import {
  Art, Banner, Calendar, Check, ErrorBox, Field, I, Icon, Lines, Rate, Seg, Skeleton, Spinner, Stepper, Steps, TextInput, Thumb, useLoad, useSubmit,
} from '../ui.tsx';
import { t, tl } from '../i18n.tsx';

const STEPS: Record<string, string[]> = {
  restaurant: ['Date & time', 'Your details', 'Confirm'],
  salon: ['Service & specialist', 'Date & time', 'Your details'],
  hotel: ['Dates & guests', 'Room & extras', 'Your details'],
  sport: ['Slot & time', 'Your details', 'Confirm'],
  event: ['Tickets', 'Your details', 'Confirm'],
};

interface StepProps {
  p: PlaceDetail;
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
}

const setSel = (draft: Draft, update: StepProps['update'], patch: Selection) => update({ selection: { ...draft.selection, ...patch } });

function Section({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="card" style={{ padding: 24 }}>
      <div className="col g4" style={{ marginBottom: 16 }}>
        <h2 className="h2">{title}</h2>
        {note && <span className="sm muted">{note}</span>}
      </div>
      {children}
    </section>
  );
}

function SlotGrid({ slots, value, onPick, cols = 3, showLeft }: {
  slots: { time: string; left: number }[]; value?: string; onPick: (t: string) => void; cols?: number; showLeft?: boolean;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols},1fr)`, gap: 8 }}>
      {slots.map((s) => {
        const few = showLeft && s.left > 0 && s.left <= 2;
        return (
          <button type="button" key={s.time} disabled={s.left === 0} aria-pressed={value === s.time}
            className={`slot ${s.left === 0 ? 'off' : value === s.time ? 'sel' : few ? 'few' : ''}`} onClick={() => onPick(s.time)}>
            {s.time}{few && value !== s.time && <small>{s.left}{' '}{t("left")}</small>}
          </button>
        );
      })}
    </div>
  );
}

/** Календарь слева, время справа — общий блок ресторана и салона. */
function DateTime({ p, draft, update, groups, slots, avail, heading, note, calendarOpts }: StepProps & {
  groups: { name: string; times: string[] }[]; slots: Map<string, number>; avail: { loading: boolean; error?: Error; reload: () => void };
  heading?: string; note?: string; calendarOpts?: { service?: string };
}) {
  const date = draft.date ?? today();
  const [month, setMonth] = useState(date.slice(0, 7));
  const cal = useLoad(() => api.calendar(p.slug, { month, ...calendarOpts }), [p.slug, month, calendarOpts?.service]);
  const empty = !avail.loading && [...slots.values()].every((n) => n === 0);
  const nextFree = Object.entries(cal.data ?? {}).filter(([d, s]) => s === 'av' && d > date).slice(0, 3).map(([d]) => d);
  return (
    <Section title={t("Date and time")} note={note}>
      <div className="row start" style={{ gap: 32 }}>
        <div style={{ width: 392, flexShrink: 0 }}>
          <Calendar month={month} onMonth={setMonth} states={cal.data} today={today()} selected={date} onPick={(d) => update({ date: d, time: undefined })} />
        </div>
        <div className="vr" />
        <div className="col g16 grow">
          <div className="col">
            <span className="h3">{fmtDayMonth(date)}{heading ? ` · ${heading}` : ''}</span>
            <span className="sm muted">{t("Pick a time that works for you")}</span>
          </div>
          {avail.error ? <ErrorBox error={avail.error} onRetry={avail.reload} />
            : avail.loading && slots.size === 0 ? <Skeleton rows={3} />
              : empty ? (
                <div className="col g12" style={{ alignItems: 'center', textAlign: 'center', padding: '16px 0' }}>
                  <span style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon n={I.calendar} size={22} color="var(--ink-2)" /></span>
                  <span className="h3">{t("Nothing free on")}{' '}{fmtShort(date)}</span>
                  <span className="muted">{p.name}{' '}{t("is fully booked that day.")}{nextFree.length ? t(" Closest free dates:") : ''}</span>
                  <div className="row g8">{nextFree.map((d) => <button type="button" key={d} className="chip" onClick={() => { update({ date: d, time: undefined }); setMonth(d.slice(0, 7)); }}>{fmtShort(d)}</button>)}</div>
                </div>
              ) : groups.map((g) => g.times.length > 0 && (
                <div key={t(g.name)} className="col g8">
                  <span className="up">{t(g.name)}</span>
                  <SlotGrid slots={g.times.map((t) => ({ time: t, left: slots.get(t) ?? 0 }))} value={draft.time} onPick={(time) => update({ time })} showLeft={p.kind === 'restaurant'} />
                </div>
              ))}
          <span className="sm subtle row g4"><Icon n={I.globe} size={12} />{' '}{t("Times shown in")}{' '}{t(TZ_LABEL)}</span>
        </div>
      </div>
    </Section>
  );
}

function RestaurantStep({ p, draft, update }: StepProps) {
  const cfg = p.config as RestaurantConfig;
  const date = draft.date ?? today();
  const avail = useLoad(() => api.availability(p.slug, { date }), [p.slug, date]);
  const a = avail.data?.date === date ? avail.data : undefined;
  const slots = new Map((a?.times ?? []).map((t) => [t, a!.resources.reduce((n, r) => n + (r.left[t] ?? 0), 0)]));
  const leftIn = (area: string) => (draft.time ? a?.resources.find((r) => r.id === area)?.left[draft.time] ?? 0 : null);

  // Если выбранная зона на это время занята — подставляем первую свободную.
  useEffect(() => {
    if (!a || !draft.time) return;
    const free = (id: string) => (a.resources.find((r) => r.id === id)?.left[draft.time!] ?? 0) > 0;
    if (!draft.resource || !free(draft.resource)) update({ resource: cfg.areas.find((x) => free(x.id))?.id });
  }, [a, draft.time]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <DateTime p={p} draft={{ ...draft, date }} update={update} groups={cfg.periods} slots={slots} avail={avail} />
      <Section title={t("Party size and seating")}>
        <div className="line-row" style={{ paddingTop: 0 }}>
          <div className="col"><span className="b">{t("Guests")}</span><span className="sm muted">{t("Tables seat up to")}{' '}{cfg.maxParty}{draft.party >= 8 ? t(" · groups of 8+ are confirmed by the restaurant") : ''}</span></div>
          <Stepper value={draft.party} min={1} max={cfg.maxParty} onChange={(party) => update({ party })} label="guests" />
        </div>
        <div className="col g8" style={{ marginTop: 16 }} role="radiogroup" aria-label={t("Seating area")}>
          <span className="label">{t("Seating area")}</span>
          {cfg.areas.map((area) => {
            const left = leftIn(area.id);
            const full = left === 0;
            return (
              <button type="button" key={area.id} role="radio" aria-checked={draft.resource === area.id} disabled={full} className={`opt ${draft.resource === area.id ? 'on' : ''}`} onClick={() => update({ resource: area.id })}>
                <span className={`rad ${draft.resource === area.id ? 'on' : ''}`} />
                <span style={{ width: 40, height: 40, borderRadius: 'var(--r)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon n={area.icon} size={20} color="var(--ink-2)" /></span>
                <div className="col grow">
                  <span className="b">{t(area.name)}</span>
                  <span className="sm muted">{t(area.note)}{left != null && left > 0 ? ` · ${t('{n} free', { n: plural(left, 'table') })}` : ''}</span>
                </div>
                {left != null && <span className={`badge ${full ? '' : left <= 3 ? 'warn' : 'success'}`}>{full ? t("Full") : left <= 3 ? t("Few left") : t("Available")}</span>}
              </button>
            );
          })}
          {!draft.time && <span className="help">{t("Choose a time to see free tables in each area.")}</span>}
        </div>
      </Section>
    </>
  );
}

function SalonServiceStep({ p, draft, update }: StepProps) {
  const cfg = p.config as SalonConfig;
  const sel = draft.selection;
  const pick = (patch: Selection) => update({ selection: { ...sel, ...patch }, time: undefined });
  return (
    <>
      <Section title={t("Choose a service")} note={t("Select one service for this visit")}>
        <div className="col g8" role="radiogroup" aria-label={t("Service")}>
          {cfg.services.map((s) => (
            <button type="button" key={s.id} role="radio" aria-checked={sel.service === s.id} className={`opt ${sel.service === s.id ? 'on' : ''}`} onClick={() => pick({ service: s.id })}>
              <span className={`rad ${sel.service === s.id ? 'on' : ''}`} />
              <div className="col grow"><span className="b">{t(s.name)}</span><span className="sm muted">{[t('{n} min', { n: s.minutes }), s.note && t(s.note)].filter(Boolean).join(' · ')}</span></div>
              <span className="b">{money(s.price)}</span>
            </button>
          ))}
        </div>
      </Section>
      <Section title={t("Choose a specialist")}>
        <div className="row g12" style={{ alignItems: 'stretch' }} role="radiogroup" aria-label={t("Specialist")}>
          {[{ id: 'any', name: t("Any specialist"), title: t("First available · fastest"), rating: 0 }, ...cfg.specialists].map((s) => {
            const on = (sel.specialist ?? 'any') === s.id;
            return (
              <button type="button" key={s.id} role="radio" aria-checked={on} className={`opt ${on ? 'on' : ''}`} style={{ flexDirection: 'column', gap: 8, textAlign: 'center', padding: on ? 15 : 16 }} onClick={() => pick({ specialist: s.id })}>
                <span className="avatar lg">{s.id === 'any' ? '?' : s.name.replace('Dr. ', '')[0]}</span>
                <span className="b">{t(s.name)}</span>
                <span className="sm muted">{tl(s.title)}</span>
                {s.rating > 0 && <span className="rate"><Icon n={I.star} size={12} color="#946F00" sw={1} /> {s.rating.toFixed(1)}</span>}
              </button>
            );
          })}
        </div>
      </Section>
    </>
  );
}

function SalonTimeStep({ p, draft, update }: StepProps) {
  const cfg = p.config as SalonConfig;
  const sel = draft.selection;
  const date = draft.date ?? today();
  const service = cfg.services.find((s) => s.id === sel.service);
  const spec = cfg.specialists.find((s) => s.id === sel.specialist);
  const avail = useLoad(() => api.availability(p.slug, { date, service: sel.service }), [p.slug, date, sel.service]);
  const a = avail.data?.date === date ? avail.data : undefined;
  const pool = (a?.resources ?? []).filter((r) => !spec || r.id === spec.id);
  const slots = new Map((a?.times ?? []).map((t) => [t, pool.reduce((n, r) => n + (r.left[t] ?? 0), 0)]));
  const times = a?.times ?? [];
  const groups = [
    { name: 'Morning', times: times.filter((t) => toMin(t) < 720) },
    { name: 'Afternoon', times: times.filter((t) => toMin(t) >= 720 && toMin(t) < 1020) },
    { name: 'Evening', times: times.filter((t) => toMin(t) >= 1020) },
  ];
  return (
    <DateTime p={p} draft={{ ...draft, date }} update={update} groups={groups} slots={slots} avail={avail}
      heading={spec ? `with ${spec.name}` : undefined} note={service ? `${service.minutes} min · ${service.name}` : undefined} calendarOpts={{ service: sel.service }} />
  );
}

function HotelDatesStep({ p, draft, update }: StepProps) {
  const cfg = p.config as HotelConfig;
  const sel = draft.selection;
  const [month, setMonth] = useState((draft.date ?? today()).slice(0, 7));
  const next = addMonths(month, 1);
  const cal1 = useLoad(() => api.calendar(p.slug, { month }), [p.slug, month]);
  const cal2 = useLoad(() => api.calendar(p.slug, { month: next }), [p.slug, next]);
  const nights = draft.date && draft.endDate ? diffDays(draft.date, draft.endDate) : 0;
  // Первый клик — заезд, второй — выезд; клик раньше заезда начинает выбор заново.
  const pick = (d: string) => {
    if (!draft.date || draft.endDate || d <= draft.date) update({ date: d, endDate: undefined, selection: { ...sel, room: undefined } });
    else update({ endDate: d, selection: { ...sel, room: undefined } });
  };
  const range: [string | undefined, string | undefined] = [draft.date, draft.endDate];
  const maxRooms = 4;
  return (
    <>
      <Section title={t("When are you staying?")}>
        <div className="row g8" style={{ marginBottom: 16 }}>
          <div className="field grow"><span className="label">{t("Check-in")}</span>
            <div className={`input ${!draft.date || draft.endDate ? 'focus' : ''}`}><Icon n={I.calendar} color="var(--ink-3)" /><span className={draft.date ? '' : 'phd'}>{draft.date ? fmtShort(draft.date) : t("Add date")}</span></div>
          </div>
          <div className="field grow"><span className="label">{t("Check-out")}</span>
            <div className={`input ${draft.date && !draft.endDate ? 'focus' : ''}`}><Icon n={I.calendar} color="var(--ink-3)" /><span className={draft.endDate ? '' : 'phd'}>{draft.endDate ? fmtShort(draft.endDate) : t("Add date")}</span></div>
          </div>
        </div>
        <div className="row g32 start">
          <div className="grow"><Calendar plain month={month} onMonth={setMonth} hideNav="next" states={cal1.data} today={today()} range={range} onPick={pick} /></div>
          <div className="grow"><Calendar plain month={next} onMonth={(m) => setMonth(addMonths(m, -1))} hideNav="prev" states={cal2.data} today={today()} range={range} onPick={pick} /></div>
        </div>
        <div className="row between" style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <span className="row g8">
            {nights > 0 && <span className={`badge ${nights >= cfg.minNights ? 'info' : 'danger'}`}>{plural(nights, 'night')}</span>}
            <span className="sm muted">{t("Min. stay")}{' '}{plural(cfg.minNights, 'night')}</span>
          </span>
          <button type="button" className="btn btn-subtle btn-sm" disabled={!draft.date} onClick={() => update({ date: undefined, endDate: undefined })}>{t("Clear dates")}</button>
        </div>
      </Section>
      <Section title={t("Who is coming?")}>
        <div className="lines">
          {([['adults', t("Adults"), t("Age 13+"), 1, 10], ['children', t("Children"), t("Age 0–12"), 0, 6], ['rooms', t("Rooms"), '', 1, maxRooms]] as const).map(([key, label, note, min, max]) => (
            <div key={key} className="line-row">
              <div className="col"><span className="b">{t(label)}</span>{note && <span className="sm muted">{t(note)}</span>}</div>
              <Stepper value={sel[key] ?? (key === 'adults' ? 2 : key === 'rooms' ? 1 : 0)} min={min} max={max} onChange={(v) => setSel(draft, update, { [key]: v })} label={label.toLowerCase()} />
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

function HotelRoomStep({ p, draft, update }: StepProps) {
  const cfg = p.config as HotelConfig;
  const sel = draft.selection;
  const avail = useLoad(() => api.availability(p.slug, { date: draft.date!, endDate: draft.endDate }), [p.slug, draft.date, draft.endDate]);
  const nights = diffDays(draft.date!, draft.endDate!);
  const guests = (sel.adults ?? 2) + (sel.children ?? 0);
  const rooms = sel.rooms ?? 1;
  const room = cfg.rooms.find((r) => r.id === sel.room);
  if (avail.error) return <ErrorBox error={avail.error} onRetry={avail.reload} />;
  if (!avail.data) return <section className="card" style={{ padding: 24 }}><Skeleton rows={3} height={96} /></section>;
  const leftOf = (id: string) => avail.data!.resources.find((r) => r.id === id)?.left.stay ?? 0;
  return (
    <>
      <Section title={t("Choose a room")} note={`${fmtRange(draft.date!, draft.endDate!)} · ${plural(nights, 'night')} · ${plural(guests, 'guest')}`}>
        <div className="col g12">
          {cfg.rooms.map((r) => {
            const left = leftOf(r.id);
            const fits = guests <= r.sleeps * rooms;
            const ok = left >= rooms && fits;
            const on = sel.room === r.id;
            return (
              <div key={r.id} className="row" style={{ border: on ? '2px solid var(--accent)' : '1px solid var(--line)', borderRadius: 'var(--r-lg)', overflow: 'hidden', background: 'var(--surface)', opacity: ok ? 1 : 0.55, alignItems: 'stretch' }}>
                <div className="ph" style={{ '--c': p.color, width: 160, flex: '0 0 auto', borderRadius: 0, position: 'relative', overflow: 'hidden', minHeight: 120 } as CSSProperties}><Art n={r.photo ?? p.art} /></div>
                <div className="col g8 grow" style={{ padding: 16 }}>
                  <div className="row between">
                    <span className="h3">{t(r.name)}</span>
                    {left < rooms ? <span className="badge">{t("Sold out")}</span> : left <= 2 && <span className="badge warn">{left}{' '}{t("left")}</span>}
                  </div>
                  <span className="sm muted row g12"><span>{t(r.bed)}</span><span>{r.size}</span><span>{t("Sleeps")}{' '}{r.sleeps}</span></span>
                  <div className="row g4 wrap">{r.tags.map((tag) => <span key={tag} className="tag">{t(tag)}</span>)}</div>
                  {!fits && left >= rooms && <span className="sm err">{t("Too small for")}{' '}{plural(guests, 'guest')}{' '}{t("in")}{' '}{plural(rooms, 'room')}</span>}
                </div>
                <div className="col" style={{ width: 180, padding: 16, justifyContent: 'space-between', alignItems: 'flex-end', borderLeft: '1px solid var(--line)' }}>
                  <div className="col" style={{ alignItems: 'flex-end' }}><span className="h2">{money(r.price)}</span><span className="sm subtle">{t("per night")}</span></div>
                  <button type="button" className={`btn ${on ? 'btn-primary' : 'btn-secondary'} btn-sm`} disabled={!ok} aria-pressed={on} onClick={() => setSel(draft, update, { room: r.id })}>{on ? t("Selected") : t("Select")}</button>
                </div>
              </div>
            );
          })}
        </div>
      </Section>
      <Section title={t("Rate")}>
        <div className="col g8" role="radiogroup" aria-label={t("Rate")}>
          {cfg.rates.map((rate) => {
            const on = (sel.rate ?? cfg.rates[0]!.id) === rate.id;
            return (
              <button type="button" key={rate.id} role="radio" aria-checked={on} className={`opt ${on ? 'on' : ''}`} onClick={() => setSel(draft, update, { rate: rate.id })}>
                <span className={`rad ${on ? 'on' : ''}`} />
                <div className="col grow"><span className="b">{t(rate.name)}</span><span className="sm muted">{t(rate.note)}</span></div>
                {room && <span className="b">{money(Math.round(room.price * rate.factor * 100) / 100)}</span>}
              </button>
            );
          })}
        </div>
      </Section>
      <Section title={t("Extras")} note={t("Optional")}>
        <div className="lines">
          {cfg.extras.map((e) => {
            const on = (sel.extras ?? []).includes(e.id);
            return (
              <div key={e.id} className="line-row">
                <Check checked={on} onChange={(v) => setSel(draft, update, { extras: v ? [...(sel.extras ?? []), e.id] : (sel.extras ?? []).filter((x) => x !== e.id) })}>
                  <div className="col" style={{ marginLeft: 4 }}><span className="b">{t(e.name)}</span><span className="sm muted">{t(e.note)}</span></div>
                </Check>
                <span className="sb">{money(e.price)}{e.per === 'person_night' ? ' / person / night' : ''}</span>
              </div>
            );
          })}
        </div>
      </Section>
    </>
  );
}

function SportStep({ p, draft, update }: StepProps) {
  const cfg = p.config as SportConfig;
  const date = draft.date ?? today();
  const duration = draft.selection.duration ?? cfg.durations[0]!;
  const avail = useLoad(() => api.availability(p.slug, { date, duration }), [p.slug, date, duration]);
  const a = avail.data?.date === date ? avail.data : undefined;
  const left = (court: string, t: string) => a?.resources.find((r) => r.id === court)?.left[t] ?? 0;
  const anyFree = (court: string) => (a?.times ?? []).some((t) => left(court, t) > 0);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today(), i));
  const label = t(cfg.resourceLabel);
  return (
    <>
      <Section title={label}>
        <div className="row g12" style={{ alignItems: 'stretch' }} role="radiogroup" aria-label={label}>
          {cfg.courts.map((c) => {
            const on = draft.resource === c.id;
            const booked = !!a && !anyFree(c.id);
            return (
              <button type="button" key={c.id} role="radio" aria-checked={on} disabled={booked} className={`opt ${on ? 'on' : ''}`} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }} onClick={() => update({ resource: c.id, time: undefined })}>
                <span className="row between"><span className="b">{t(c.name)}</span><span className={`rad ${on ? 'on' : ''}`} /></span>
                <span className="sm muted">{t(c.note)}</span>
                <span className="sb">{booked ? t("Booked") : `${money(c.price)} ${t('/ hour')}`}</span>
              </button>
            );
          })}
        </div>
      </Section>
      <Section title={t("Date, time and duration")}>
        <div className="col g16">
          <div className="row g8" role="radiogroup" aria-label={t("Date")}>
            {days.map((d) => (
              <button type="button" key={d} role="radio" aria-checked={d === date} className={`pick ${d === date ? 'on' : ''}`} onClick={() => update({ date: d, time: undefined })}>
                <span className="sm">{fmtDow(d)}</span>
                <span className="h3" style={{ color: 'inherit' }}>{toDate(d).getUTCDate()}</span>
              </button>
            ))}
          </div>
          <div className="col g8">
            <span className="label">{t("Duration")}</span>
            <Seg value={duration} onChange={(v) => update({ selection: { ...draft.selection, duration: v }, time: undefined })} options={cfg.durations.map((m) => ({ value: m, label: t('{n} min', { n: m }) }))} />
          </div>
          <div className="col g8">
            <span className="label">{t("Start time")}</span>
            {avail.error ? <ErrorBox error={avail.error} onRetry={avail.reload} />
              : !a ? <div className="skel" style={{ height: 88 }} />
                : !draft.resource ? <span className="help">{t("Choose a")}{' '}{label.toLowerCase()}{' '}{t("to see free times.")}</span>
                  : a.times.every((t) => left(draft.resource!, t) === 0) ? <Banner kind="warn" title={t("Nothing free on {a}", { a: fmtShort(date) })}>{t("Try another day, a shorter duration or a different")}{' '}{label.toLowerCase()}.</Banner>
                    : <SlotGrid cols={6} slots={a.times.map((t) => ({ time: t, left: left(draft.resource!, t) }))} value={draft.time} onPick={(time) => update({ time })} />}
          </div>
        </div>
      </Section>
    </>
  );
}

function EventStep({ p, draft, update }: StepProps) {
  const cfg = p.config as EventConfig;
  const avail = useLoad(() => api.availability(p.slug, { date: today() }), [p.slug]);
  const tickets = draft.selection.tickets ?? {};
  const count = ticketCount(draft.selection);
  if (avail.error) return <ErrorBox error={avail.error} onRetry={avail.reload} />;
  if (!avail.data) return <section className="card" style={{ padding: 24 }}><Skeleton rows={3} height={56} /></section>;
  return (
    <>
      <Section title={t("Choose a date")}>
        <div className="col g8" role="radiogroup" aria-label={t("Date")}>
          {avail.data.resources.map((s) => {
            const left = s.left.tickets ?? 0;
            const on = draft.date === s.id;
            return (
              <button type="button" key={s.id} role="radio" aria-checked={on} disabled={left === 0} className={`opt ${on ? 'on' : ''}`} onClick={() => update({ date: s.id })}>
                <span className={`rad ${on ? 'on' : ''}`} />
                <div className="col grow"><span className="b">{fmtShort(s.id)} · {cfg.time}</span><span className="sm muted">{t(cfg.hall)}{' '}{t("· Doors")}{' '}{cfg.doors}</span></div>
                <span className={`badge ${left === 0 ? '' : left <= 20 ? 'warn' : 'success'}`}>{left === 0 ? t("Sold out") : left <= 20 ? t('{n} left', { n: left }) : t("Available")}</span>
              </button>
            );
          })}
        </div>
      </Section>
      <Section title={t("Tickets")}>
        <div className="lines">
          {cfg.tickets.map((ticket) => (
            <div key={ticket.id} className="line-row">
              <div className="col"><span className="b">{t(ticket.name)} · {money(ticket.price)}</span><span className="sm muted">{tl(ticket.note)}</span></div>
              <Stepper value={tickets[ticket.id] ?? 0} min={0} max={(tickets[ticket.id] ?? 0) + cfg.maxTickets - count} onChange={(v) => setSel(draft, update, { tickets: { ...tickets, [ticket.id]: v } })} label={`${ticket.name} tickets`} />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16 }}>
          <Banner kind="info">{t("Max")}{' '}{cfg.maxTickets}{' '}{t("tickets per order. Tickets are kept in My bookings; payment is taken at the door.")}</Banner>
        </div>
      </Section>
    </>
  );
}

function DetailsStep({ p, draft, update, form, agree, setAgree, remind, setRemind, onRepick }: StepProps & {
  form: ReturnType<typeof useSubmit>; agree: boolean; setAgree: (v: boolean) => void; remind: boolean; setRemind: (v: boolean) => void; onRepick: () => void;
}) {
  const { user } = useApp();
  const c = draft.contact ?? {};
  const set = (patch: Partial<NonNullable<Draft['contact']>>) => update({ contact: { ...c, ...patch } });
  // Данные аккаунта подставляются в пустые поля.
  useEffect(() => {
    if (!user) return;
    update({ contact: { firstName: c.firstName || user.firstName, lastName: c.lastName || user.lastName, phone: c.phone || user.phone, email: c.email || user.email } });
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps
  const f = form.fields;
  const taken = form.error?.code === 'slot_taken';
  const venue = { restaurant: 'restaurant', salon: 'venue', hotel: 'hotel', sport: 'venue', event: 'organiser' }[p.kind];
  return (
    <>
      {!user && (
        <div className="banner info row" style={{ alignItems: 'center' }}>
          <Icon n={I.user} size={18} color="var(--accent)" />
          <div className="col grow"><span className="b">{t("Have an account?")}</span><span className="sm muted">{t("Log in to fill this in automatically and keep the booking in My bookings.")}</span></div>
          <Link to={loginUrl(`/book/${p.slug}/details`)} className="btn btn-secondary btn-sm">{t("Log in")}</Link>
        </div>
      )}
      {taken && (
        <div className="col g12">
          <Banner kind="warn" title={form.error!.message.split('.')[0]}>{t("Someone confirmed it a moment ago. Pick another option.")}</Banner>
          <div><button type="button" className="btn btn-secondary" onClick={onRepick}>{t("Choose again")}</button></div>
        </div>
      )}
      {form.error && !taken && form.error.code !== 'validation' && (
        <div className="col g8">
          <Banner kind="danger" title={t("We could not confirm your booking")}>{t("Nothing was charged.")}{' '}{form.error.message}</Banner>
          <span className="sm subtle">{t("Error code")}{' '}{form.error.code}{form.error.status ? ` · ${form.error.status}` : ''}</span>
        </div>
      )}
      <Section title={t("Your details")}>
        <div className="col g16">
          <div className="row g16 start">
            <Field label={t("First name *")} error={f['contact.firstName']}><TextInput value={c.firstName ?? ''} onChange={(v) => set({ firstName: v })} error={!!f['contact.firstName']} autoComplete="given-name" /></Field>
            <Field label={t("Last name *")} error={f['contact.lastName']}><TextInput value={c.lastName ?? ''} onChange={(v) => set({ lastName: v })} error={!!f['contact.lastName']} autoComplete="family-name" /></Field>
          </div>
          <div className="row g16 start">
            <Field label={t("Phone *")} error={f['contact.phone']}><TextInput type="tel" icon={I.phone} value={c.phone ?? ''} onChange={(v) => set({ phone: v })} error={!!f['contact.phone']} placeholder="+998 90 123 45 67" autoComplete="tel" /></Field>
            <Field label={t("Email *")} error={f['contact.email']} help={t("Your booking is linked to this address")}><TextInput type="email" icon={I.mail} value={c.email ?? ''} onChange={(v) => set({ email: v })} error={!!f['contact.email']} placeholder="name@mail.com" autoComplete="email" /></Field>
          </div>
          <Field label={t("Special requests (optional)")} help={t("The {a} sees this, but cannot promise every request.", { a: t(venue!) })}>
            <div className="input ta"><textarea value={draft.requests ?? ''} maxLength={500} onChange={(e) => update({ requests: e.target.value })} placeholder={t("Allergies, accessibility, celebration…")} /></div>
          </Field>
        </div>
      </Section>
      <Section title={t("Cancellation policy")}>
        <p className="muted" style={{ marginBottom: 16 }}>{p.policies}</p>
        <div className="col g12">
          <Check checked={remind} onChange={setRemind}><span>{t("Remind me in Notifications on the day of the booking")}</span></Check>
          <Check checked={agree} onChange={setAgree} align="start">
            <span className="muted">{t("I agree to the")}{' '}<Link className="link" to="/help#terms" target="_blank">{t("booking terms")}</Link>{' '}{t("and the {venue}'s cancellation policy.", { venue: t(venue) })}</span>
          </Check>
          {f.agree && <span className="help err"><Icon n={I.alert} size={12} />{f.agree}</span>}
        </div>
      </Section>
    </>
  );
}

function initialDraft(p: PlaceDetail): Draft {
  if (p.kind === 'hotel') return { party: 2, selection: { adults: 2, children: 0, rooms: 1, rate: 'flex', extras: [] } };
  if (p.kind === 'event') return { party: 1, selection: { tickets: {} } };
  if (p.kind === 'salon') return { date: today(), party: 1, selection: { specialist: 'any' } };
  if (p.kind === 'sport') return { date: today(), party: 1, resource: (p.config as SportConfig).courts[0]!.id, selection: { duration: (p.config as SportConfig).durations[0]! } };
  return { date: today(), party: 2, selection: {} };
}

function Flow({ p, step }: { p: PlaceDetail; step: string }) {
  const navigate = useNavigate();
  const { user } = useApp();
  const [sp, setSp] = useSearchParams();
  const [draft, update] = useDraft(p.slug, () => initialDraft(p));
  const form = useSubmit();
  const [agree, setAgree] = useState(false);
  const [remind, setRemind] = useState(true);

  // Параметры из поиска и со страницы места (дата, время, гости) переносятся в черновик один раз.
  useEffect(() => {
    const patch: Partial<Draft> = {};
    const d = sp.get('date');
    if (d && d >= today() && p.kind !== 'hotel' && p.kind !== 'event') patch.date = d;
    if (sp.get('time')) patch.time = sp.get('time')!;
    else if (d && d !== draft.date) patch.time = undefined;
    const g = Number(sp.get('guests'));
    if (g && p.kind === 'restaurant') patch.party = Math.min(g, (p.config as RestaurantConfig).maxParty);
    if (draft.date && draft.date < today()) { patch.date = p.kind === 'hotel' || p.kind === 'event' ? undefined : today(); patch.time = undefined; patch.endDate = undefined; }
    if (Object.keys(patch).length) update(patch);
    if (sp.size) setSp({}, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const two = p.kind === 'salon' || p.kind === 'hotel';
  const second = p.kind === 'salon' ? 'time' : 'room';
  const index = step === 'details' ? (two ? 2 : 1) : step === '' ? 0 : 1;
  const sel = draft.selection;
  const q = quote(p.kind, p.name, p.config, { date: draft.date, time: draft.time, endDate: draft.endDate, party: draft.party, resource: draft.resource, selection: sel });

  // Что мешает перейти дальше на текущем шаге.
  let missing: string | null = q.missing;
  if (step === '' && p.kind === 'salon') missing = sel.service ? null : 'Choose a service';
  if (step === '' && p.kind === 'hotel') {
    const nights = draft.date && draft.endDate ? diffDays(draft.date, draft.endDate) : 0;
    const min = (p.config as HotelConfig).minNights;
    missing = !nights ? 'Choose check-in and check-out' : nights < min ? t('Minimum stay is {n}', { n: plural(min, 'night') }) : null;
  }
  if (step === 'details' && !missing && !agree) missing = 'Accept the booking terms to continue';

  // На поздний шаг нельзя попасть, пока не пройдены предыдущие.
  if (step === second && two && (p.kind === 'salon' ? !sel.service : !(draft.date && draft.endDate))) return <Navigate to={`/book/${p.slug}`} replace />;
  if (step === 'details' && q.missing) return <Navigate to={`/book/${p.slug}${two ? `/${second}` : ''}`} replace />;

  const back = step === '' ? `/place/${p.slug}` : step === 'details' && two ? `/book/${p.slug}/${second}` : `/book/${p.slug}`;
  const next = step === '' && two ? `/book/${p.slug}/${second}` : `/book/${p.slug}/details`;
  const cta = step === 'details' ? (p.instant && draft.party < 8 ? 'Confirm booking' : 'Send booking request')
    : p.kind === 'hotel' && step === '' ? 'See available rooms' : 'Continue';

  const submit = async () => {
    const c = draft.contact ?? {};
    const booking = await form.run(() => api.book({
      slug: p.slug, date: draft.date!, time: draft.time, endDate: draft.endDate, party: draft.party, resource: draft.resource, selection: sel,
      contact: { firstName: c.firstName ?? '', lastName: c.lastName ?? '', phone: c.phone ?? '', email: c.email ?? '' },
      requests: draft.requests, remind, agree,
    }));
    if (booking) {
      clearDraft(p.slug);
      navigate(`/confirmation/${booking.ref}${user ? '' : `?key=${booking.key}`}`, { replace: true });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const props = { p, draft, update };
  return (
    <>
      <div className="white bb">
        <div className="row between px" style={{ height: 56 }}>
          <Link to={back} className="row g8 sb muted"><Icon n={I.left} /> {step === '' ? t("Back to {a}", { a: p.name }) : t("Back")}</Link>
          <Steps labels={STEPS[p.kind]!} current={index} />
          <span className="row g8 sm subtle"><Icon n={I.lock} size={14} />{' '}{t("Secure booking")}</span>
        </div>
      </div>
      <div className="row start px" style={{ gap: 32, paddingTop: 24, paddingBottom: 48 }}>
        <main className="grow col g24">
          {step === 'details' ? <DetailsStep {...props} form={form} agree={agree} setAgree={setAgree} remind={remind} setRemind={setRemind} onRepick={() => { update({ time: undefined }); navigate(two && p.kind === 'salon' ? `/book/${p.slug}/time` : two ? `/book/${p.slug}/room` : `/book/${p.slug}`); }} />
            : p.kind === 'restaurant' ? <RestaurantStep {...props} />
              : p.kind === 'salon' ? (step === '' ? <SalonServiceStep {...props} /> : <SalonTimeStep {...props} />)
                : p.kind === 'hotel' ? (step === '' ? <HotelDatesStep {...props} /> : <HotelRoomStep {...props} />)
                  : p.kind === 'sport' ? <SportStep {...props} /> : <EventStep {...props} />}
        </main>
        <aside className="card sticky" style={{ width: 340, flexShrink: 0 }} aria-label={t("Booking summary")}>
          <div className="row g12" style={{ padding: 16 }}>
            <Thumb color={p.color} icon={p.icon} />
            <div className="col">
              <span className="h3">{p.name}</span>
              <span className="sm muted">{t(p.subtitle.split(' · ')[0]!)} · {p.address}</span>
              <span className="row g4 sm" style={{ marginTop: 2 }}><Rate value={p.rating} count={p.reviews} /></span>
            </div>
          </div>
          <hr className="hr" />
          <div className="col g12" style={{ padding: 16 }}><Lines items={q.summary} />{q.priceLines.length > 0 && <><hr className="hr" /><Lines items={q.priceLines} /></>}</div>
          {q.total > 0 && (
            <>
              <hr className="hr" />
              <div style={{ padding: 16 }}><Lines bold items={[{ label: q.totalLabel, value: q.totalLabel === 'From' ? `${money(q.total)} ${t('/ night')}` : money(q.total) }]} /></div>
            </>
          )}
          <hr className="hr" />
          <div style={{ padding: 16 }} className="col g12">
            {step === 'details'
              ? <button type="button" className="btn btn-primary btn-lg btn-block" disabled={!!missing || form.busy} onClick={() => void submit()}>{form.busy ? <><Spinner />{' '}{t("Confirming…")}</> : t(cta)}</button>
              : missing ? <button type="button" className="btn btn-primary btn-lg btn-block" disabled>{t(cta)}</button>
                : <Link to={next} className="btn btn-primary btn-lg btn-block">{t(cta)}</Link>}
            {missing && <span className="sm subtle" style={{ textAlign: 'center' }}>{t(missing)}</span>}
            <span className="sm subtle row g4 center"><Icon n={I.shield} size={14} />{' '}{t("No payment now")}{q.total > 0 ? t(" · pay at the venue") : ''}</span>
          </div>
        </aside>
      </div>
    </>
  );
}

export function Book() {
  const { slug = '', step = '' } = useParams();
  const place = useLoad(() => api.place(slug), [slug]);
  useEffect(() => { if (place.data) document.title = `Book ${place.data.name} — qwerttclients`; }, [place.data]);
  if (place.error) return <div className="px" style={{ paddingTop: 48 }}><ErrorBox error={place.error} onRetry={place.reload} /></div>;
  if (!place.data) return <div className="px col g16" style={{ paddingTop: 24 }}><div className="skel" style={{ height: 56 }} /><div className="skel" style={{ height: 420 }} /></div>;
  return <Flow key={slug} p={place.data} step={step} />;
}
