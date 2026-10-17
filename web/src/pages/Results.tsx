// Макет «05 · Результаты и фильтры».
import { type CSSProperties, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { plural } from '../../../shared/dates.ts';
import type { PlaceCard } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { Crumbs, SaveButton } from '../layout.tsx';
import { dateLabel, locate, type Query, queryParams, readQuery, SearchFields } from '../search.tsx';
import { Art, Banner, Check, Empty, ErrorBox, I, Icon, Rate, Seg, Toggle, useLoad } from '../ui.tsx';
import { t, tl } from '../i18n.tsx';

const WIDTH: Record<string, number> = { where: 250, date: 170, time: 145, guests: 130 };
const CTA: Record<string, string> = { restaurant: 'Book a table', salon: 'Book a visit', hotel: 'See rooms', sport: 'Book a slot', event: 'Get tickets' };
const UNIT: Record<string, string> = { restaurant: 'per guest, avg.', salon: 'from', hotel: 'per night, from', sport: 'from', event: 'per ticket, from' };
const SORTS = [['recommended', 'Recommended'], ['rating', 'Rating'], ['price', 'Price'], ['distance', 'Distance']] as const;

function ResultRow({ p, query }: { p: PlaceCard; query: Query }) {
  const bookUrl = (time?: string) => `/book/${p.slug}?${new URLSearchParams({ date: query.date, guests: String(query.guests), ...(time ? { time } : {}) })}`;
  return (
    <div className="card row" style={{ overflow: 'hidden', alignItems: 'stretch' }}>
      <Link to={`/place/${p.slug}`} className="ph" aria-label={p.name} style={{ '--c': p.color, width: 220, flex: '0 0 auto', borderRadius: 0, position: 'relative', overflow: 'hidden', minHeight: 168 } as CSSProperties}>
        <Art n={p.art} />
      </Link>
      <div className="col g8 grow" style={{ padding: 16 }}>
        <div className="row">
          <Link to={`/place/${p.slug}`} className="h3" style={{ fontSize: 18 }}>{p.name}</Link>
          {p.badge && <span className={`badge ${p.badge === 'New' ? 'info' : 'success'}`} style={{ marginLeft: 8 }}>{t(p.badge)}</span>}
          {p.deal && <span className="badge warn" style={{ marginLeft: 8 }}>{t("Deal")}</span>}
        </div>
        <div className="row g8 sm">
          <Rate value={p.rating} count={p.reviews} />
          <span className="muted">· {tl(p.subtitle)}</span>
        </div>
        <span className="row g4 sm muted"><Icon n={I.pin} size={14} />{p.address}, {t(p.neighbourhood)}{p.distanceKm != null && <b style={{ marginLeft: 6, color: 'var(--accent)' }}>· {t('{n} km', { n: p.distanceKm })}</b>}</span>
        {p.deal && <span className="sm sb" style={{ color: 'var(--warn)' }}>{p.deal}</span>}
        <div className="row g4 wrap">
          {(p.instant ? ['Instant confirmation', ...p.tags] : p.tags).slice(0, 3).map((tag) => <span key={tag} className="tag">{t(tag)}</span>)}
        </div>
        {p.slots.length > 0 && (
          <div className="col g4" style={{ marginTop: 'auto' }}>
            <span className="sm subtle">{t("Available")}{' '}{dateLabel(query.date).split(',')[0]!.toLowerCase()}</span>
            <div className="row g4 wrap">
              {p.slots.map((s) => <Link key={s.time} to={bookUrl(s.time)} className={`slot mini ${s.left <= 2 ? 'few' : ''}`}>{s.time}</Link>)}
            </div>
          </div>
        )}
      </div>
      <div className="col" style={{ width: 200, padding: 16, borderLeft: '1px solid var(--line)', justifyContent: 'space-between', alignItems: 'flex-end', textAlign: 'right' }}>
        <SaveButton place={p} variant="icon" />
        <div className="col g4" style={{ alignItems: 'flex-end' }}>
          <span className="sm subtle">{t(UNIT[p.kind]!)}</span>
          <span className="h2">${p.priceFrom}</span>
          <Link to={`/place/${p.slug}`} className="btn btn-primary btn-sm" style={{ marginTop: 8 }}>{t(CTA[p.kind]!)}</Link>
        </div>
      </div>
    </div>
  );
}

function MapView({ items }: { items: PlaceCard[] }) {
  const [active, setActive] = useState<string | null>(null);
  return (
    <div className="card" style={{ height: 520, position: 'relative', overflow: 'hidden' }}>
      <Art n="i78" />
      {items.map((p) => (
        <Link key={p.slug} to={`/place/${p.slug}`} className={`pin ${active === p.slug ? 'on' : ''}`} style={{ left: `${p.x}%`, top: `${p.y}%` }}
          onMouseEnter={() => setActive(p.slug)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(p.slug)} onBlur={() => setActive(null)}>
          <b>{p.name} · ${p.priceFrom}</b>
          <Icon n={I.pin} size={20} color="var(--accent)" sw={2} />
        </Link>
      ))}
      <span className="badge" style={{ position: 'absolute', left: 12, bottom: 12, background: 'var(--surface)' }}>{t("Schematic map · positions are approximate")}</span>
    </div>
  );
}

export function Results() {
  const [sp, setSp] = useSearchParams();
  const query = readQuery(sp);
  const [draft, setDraft] = useState<Query>(query);
  const [locating, setLocating] = useState(false);
  const [geoDenied, setGeoDenied] = useState(false);
  const key = sp.toString();
  useEffect(() => setDraft(readQuery(sp)), [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = (name: string) => (sp.get(name) ?? '').split(',').filter(Boolean);
  const f = {
    minRating: sp.get('minRating') ?? '', priceMin: sp.get('priceMin') ?? '', priceMax: sp.get('priceMax') ?? '',
    cuisine: list('cuisine'), features: list('features'), freeCancel: sp.get('freeCancel') === '1', instant: sp.get('instant') === '1',
    openAt: sp.get('openAt') === '1', deals: sp.get('deals') === '1', sort: sp.get('sort') ?? 'recommended',
    page: Number(sp.get('page')) || 1, near: sp.get('near') ?? '', view: sp.get('view') === 'map' ? 'map' : 'list',
  };

  /** Меняет параметры адреса; любая смена фильтра возвращает на первую страницу. */
  const set = (patch: Record<string, string | null>, keepPage = false) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    if (!keepPage) next.delete('page');
    setSp(next);
  };
  const toggleIn = (name: 'cuisine' | 'features', value: string) => {
    const cur = f[name];
    set({ [name]: (cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value]).join(',') || null });
  };
  const clearAll = () => setSp(new URLSearchParams(queryParams(query)));

  const res = useLoad(() => api.places({
    category: query.category, q: query.q, neighbourhood: query.where, date: query.date, time: query.time,
    minRating: f.minRating, priceMin: f.priceMin, priceMax: f.priceMax, cuisine: f.cuisine.join(','), features: f.features.join(','),
    freeCancel: f.freeCancel, instant: f.instant, openAt: f.openAt, deals: f.deals, sort: f.sort, page: f.page, near: f.near,
    perPage: f.view === 'map' ? 50 : 5,
  }), [key]);
  const cats = useLoad(() => api.categories(), []);
  // Ничего не нашлось в выбранной категории — проверяем, есть ли подходящие места в других.
  const noneHere = res.data?.total === 0 && !!query.category;
  const elsewhere = useLoad(() => (noneHere
    ? api.places({ q: query.q, neighbourhood: query.where, date: query.date, perPage: 1 }).then((r) => r.total)
    : Promise.resolve(0)), [key, noneHere]);
  const allCategories = () => set({ category: null, cuisine: null, features: null, priceMin: null, priceMax: null });

  const rawCat = cats.data?.find((c) => c.id === query.category)?.name;
  const catName = rawCat ? t(rawCat) : undefined;
  const title = t('{what} in {where}', { what: f.deals ? t('Deals') : catName ?? t('All places'), where: t(query.where || 'Tashkent') });
  useEffect(() => { document.title = `${title} — qwerttclients`; }, [title]);

  const facets = res.data?.facets;
  const lo = facets?.priceMin ?? 0;
  const hi = Math.max(facets?.priceMax ?? 0, lo + 1);
  const priceMin = Number(f.priceMin) || lo;
  const priceMax = Number(f.priceMax) || hi;
  const pct = (v: number) => ((v - lo) / (hi - lo)) * 100;
  // Ползунок двигается сразу, а запрос уходит, когда пользователь остановился.
  const [price, setPrice] = useState<[number, number]>([priceMin, priceMax]);
  useEffect(() => setPrice([priceMin, priceMax]), [priceMin, priceMax]);
  useEffect(() => {
    if (price[0] === priceMin && price[1] === priceMax) return;
    const timer = setTimeout(() => set({ priceMin: price[0] > lo ? String(price[0]) : null, priceMax: price[1] < hi ? String(price[1]) : null }), 350);
    return () => clearTimeout(timer);
  }, [price]); // eslint-disable-line react-hooks/exhaustive-deps
  const priceInput = (i: 0 | 1, label: string) => (
    <label className="input" style={{ width: 96, height: 32 }}>
      $<input key={price[i]} type="number" aria-label={label} min={lo} max={hi} defaultValue={price[i]}
        onBlur={(e) => {
          const v = Math.max(lo, Math.min(hi, Number(e.target.value) || (i === 0 ? lo : hi)));
          setPrice((p) => (i === 0 ? [Math.min(v, p[1]), p[1]] : [p[0], Math.max(v, p[0])]));
          e.target.value = String(price[i]);
        }}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
        style={{ border: 0, outline: 0, background: 'transparent', font: 'inherit', color: 'inherit', width: '100%', padding: 0 }} />
    </label>
  );

  const chips: [string, () => void][] = [
    ...(f.minRating ? [[`${f.minRating}+`, () => set({ minRating: null })] as [string, () => void]] : []),
    ...f.cuisine.map((c) => [t(c), () => toggleIn('cuisine', c)] as [string, () => void]),
    ...f.features.map((c) => [t(c), () => toggleIn('features', c)] as [string, () => void]),
    ...(f.freeCancel ? [[t('Free cancellation'), () => set({ freeCancel: null })] as [string, () => void]] : []),
    ...(f.instant ? [[t('Instant confirmation'), () => set({ instant: null })] as [string, () => void]] : []),
    ...(f.openAt ? [[t('Open at selected time'), () => set({ openAt: null })] as [string, () => void]] : []),
    ...(f.deals ? [[t('Deals'), () => set({ deals: null })] as [string, () => void]] : []),
    ...(f.priceMin || f.priceMax ? [[`$${priceMin} – $${priceMax}`, () => set({ priceMin: null, priceMax: null })] as [string, () => void]] : []),
  ];

  const pages = res.data?.pages ?? 1;
  const pageList = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - f.page) <= 1);

  return (
    <>
      <div className="white bb">
        <form className="row g8 px" style={{ paddingTop: 12, paddingBottom: 12 }}
          onSubmit={(e) => { e.preventDefault(); const next = new URLSearchParams(sp); ['category', 'q', 'where', 'date', 'time', 'guests', 'page'].forEach((k) => next.delete(k)); for (const [k, v] of Object.entries(queryParams(draft))) next.set(k, v); setSp(next); }}>
          <SearchFields value={draft} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} cell={(k, _label, icon, content, popover) => (
            <div key={k} style={{ position: 'relative', width: WIDTH[k] }}>
              <div className="input" style={{ whiteSpace: 'nowrap' }}><Icon n={icon} color="var(--ink-3)" />{content}</div>
              {popover}
            </div>
          )} />
          <button type="submit" className="btn btn-primary" style={{ width: 120 }}>{t("Update")}</button>
          <div className="row g8 grow end">
            <Seg value={f.view} onChange={(v) => set({ view: v === 'map' ? 'map' : null })} options={[
              { value: 'list', label: <><Icon n={I.list} size={14} />{' '}{t("List")}</> }, { value: 'map', label: <><Icon n={I.map} size={14} />{' '}{t("Map")}</> },
            ]} />
          </div>
        </form>
      </div>

      <div className="page" style={{ paddingBottom: 56 }}>
        <Crumbs items={[['Home', '/'], ['Tashkent', '/search'], ...(query.where ? [[query.where, `/search?where=${encodeURIComponent(query.where)}`] as [string, string]] : []), [f.deals ? 'Deals' : catName ?? 'All places']]} />
        <div className="row start" style={{ gap: 32 }}>
          <aside className="col" style={{ width: 264, flexShrink: 0 }} aria-label={t("Filters")}>
            <div className="row between" style={{ paddingBottom: 12 }}>
              <span className="h2">{t("Filters")}</span>
              <button type="button" className="link" onClick={clearAll}>{t("Clear all")}</button>
            </div>
            <div className="card" style={{ padding: '12px 16px' }}>
              <div className="row between g12">
                <span className="col"><span className="b">{t("Open at selected time")}</span><span className="sm muted">{t("Show only places with a free slot")}</span></span>
                <Toggle on={f.openAt} onChange={(v) => set({ openAt: v ? '1' : null })} label={t("Open at selected time")} />
              </div>
            </div>
            <div className="col g12" style={{ padding: '16px 0', borderBottom: '1px solid var(--line)' }}>
              <span className="h3" style={{ fontSize: 14 }}>{t("Category")}</span>
              <div className="row g8 wrap">
                <button type="button" className={`chip ${!query.category ? 'on' : ''}`} onClick={() => set({ category: null, cuisine: null, features: null, priceMin: null, priceMax: null })}>{t("All")}</button>
                {(cats.data ?? []).filter((c) => c.count > 0).map((c) => (
                  <button type="button" key={c.id} className={`chip ${query.category === c.id ? 'on' : ''}`} onClick={() => set({ category: c.id, cuisine: null, features: null, priceMin: null, priceMax: null })}>{t(c.name)}</button>
                ))}
              </div>
            </div>
            {facets && hi - lo > 1 && (
              <div className="col g12" style={{ padding: '16px 0', borderBottom: '1px solid var(--line)' }}>
                <span className="h3" style={{ fontSize: 14 }}>{t("Price from")}</span>
                <div className="range">
                  <div style={{ position: 'absolute', top: 9, left: 0, right: 0, height: 2, background: 'var(--line-strong)' }} />
                  <div style={{ position: 'absolute', top: 9, left: `${pct(price[0])}%`, right: `${100 - pct(price[1])}%`, height: 2, background: 'var(--accent)' }} />
                  <input type="range" aria-label={t("Minimum price")} min={lo} max={hi} value={price[0]} onChange={(e) => setPrice((p) => [Math.min(Number(e.target.value), p[1]), p[1]])} />
                  <input type="range" aria-label={t("Maximum price")} min={lo} max={hi} value={price[1]} onChange={(e) => setPrice((p) => [p[0], Math.max(Number(e.target.value), p[0])])} />
                </div>
                <div className="row between">
                  {priceInput(0, t("Minimum price"))}
                  <span className="subtle">–</span>
                  {priceInput(1, t("Maximum price"))}
                </div>
              </div>
            )}
            <div className="col g8" style={{ padding: '16px 0', borderBottom: '1px solid var(--line)' }}>
              <span className="h3" style={{ fontSize: 14 }}>{t("Guest rating")}</span>
              <div className="row g8">
                {['', '4.8', '4.5', '4.0'].map((r) => (
                  <button type="button" key={r} className={`chip ${f.minRating === r ? 'on' : ''}`} aria-pressed={f.minRating === r} onClick={() => set({ minRating: r || null })}>{r ? `${r}+` : t("Any")}</button>
                ))}
              </div>
            </div>
            {facets && facets.cuisines.length > 0 && (
              <div className="col g12" style={{ padding: '16px 0', borderBottom: '1px solid var(--line)' }}>
                <span className="h3" style={{ fontSize: 14 }}>{t("Cuisine")}</span>
                {facets.cuisines.map((c) => (
                  <Check key={c.name} checked={f.cuisine.includes(c.name)} onChange={() => toggleIn('cuisine', c.name)}>
                    <span className="grow">{t(c.name)}</span><span className="sm subtle">{c.count}</span>
                  </Check>
                ))}
              </div>
            )}
            {facets && facets.features.length > 0 && (
              <div className="col g12" style={{ padding: '16px 0', borderBottom: '1px solid var(--line)' }}>
                <span className="h3" style={{ fontSize: 14 }}>{t("Features")}</span>
                {facets.features.map((c) => (
                  <Check key={c.name} checked={f.features.includes(c.name)} onChange={() => toggleIn('features', c.name)}>
                    <span className="grow">{t(c.name)}</span><span className="sm subtle">{c.count}</span>
                  </Check>
                ))}
              </div>
            )}
            {facets && (
              <div className="col g12" style={{ padding: '16px 0', borderBottom: '1px solid var(--line)' }}>
                <span className="h3" style={{ fontSize: 14 }}>{t("Booking")}</span>
                <Check checked={f.freeCancel} onChange={(v) => set({ freeCancel: v ? '1' : null })}><span className="grow">{t("Free cancellation")}</span><span className="sm subtle">{facets.freeCancel}</span></Check>
                <Check checked={f.instant} onChange={(v) => set({ instant: v ? '1' : null })}><span className="grow">{t("Instant confirmation")}</span><span className="sm subtle">{facets.instant}</span></Check>
                <Check checked={f.deals} onChange={(v) => set({ deals: v ? '1' : null })}><span className="grow">{t("Deals only")}</span></Check>
              </div>
            )}
          </aside>

          <div className="col g16 grow">
            <div className="row between">
              <div className="col">
                <h1 className="h2">{title}</h1>
                <span className="sm muted">
                  {res.data ? plural(res.data.total, 'place') : t("Searching…")} · {dateLabel(query.date)}{query.time ? `, ${query.time}` : ''} · {plural(query.guests, 'guest')}
                </span>
              </div>
              <div className="row g8">
                <span className="sm muted">{t("Sort by")}</span>
                <button type="button" className={`chip ${f.near ? 'on' : ''}`} disabled={locating} onClick={async () => {
                  if (f.near) { set({ near: null, sort: null }); return; }
                  setLocating(true);
                  const near = await locate();
                  setLocating(false);
                  if (near) set({ near, sort: 'distance' });
                  else { set({ sort: 'distance' }); setGeoDenied(true); }
                }}><Icon n={I.locate} size={14} /> {locating ? t('Locating…') : t('Near me')}</button>
                <Seg value={f.sort} onChange={(v) => set({ sort: v === 'recommended' ? null : v })} options={SORTS.map(([value, label]) => ({ value, label: t(label) }))} />
              </div>
            </div>
            {chips.length > 0 && (
              <div className="row g8 wrap">
                {chips.map(([label, remove]) => (
                  <button type="button" key={label} className="chip on" aria-label={t("Remove filter {a}", { a: label })} onClick={remove}>{label} <Icon n={I.x} size={12} /></button>
                ))}
                <button type="button" className="link" onClick={clearAll}>{t("Clear all")}</button>
              </div>
            )}
            {geoDenied && !f.near && <Banner kind="info" title={t('Location is off')}>{t('Sorted by distance from the city centre. Allow location access in the browser to sort from where you are.')}</Banner>}
            {res.error && <ErrorBox error={res.error} onRetry={res.reload} />}
            {res.loading && !res.data && <div className="col g16">{[0, 1, 2].map((i) => <div key={i} className="skel" style={{ height: 168 }} />)}</div>}
            {res.data && res.data.total === 0 && (
              <Empty icon={I.search} title={t("No places match these filters")} action={noneHere && (elsewhere.data ?? 0) > 0
                ? <button type="button" className="btn btn-primary btn-sm" onClick={allCategories}>{t('Show {n} in other categories', { n: plural(elsewhere.data!, 'place') })}</button>
                : <button type="button" className="btn btn-secondary btn-sm" onClick={clearAll}>{t("Clear filters")}</button>}>
                {t("Try another date or time, or remove a filter.")}
              </Empty>
            )}
            {res.data && res.data.total > 0 && (f.view === 'map'
              ? <MapView items={res.data.items} />
              : <div className="col g16 stagger" style={{ opacity: res.loading ? 0.6 : 1 }}>{res.data.items.map((p) => <ResultRow key={p.slug} p={p} query={query} />)}</div>)}
            {f.view === 'list' && pages > 1 && (
              <nav className="row g4 center" style={{ paddingTop: 8 }} aria-label={t("Pagination")}>
                <button type="button" className="btn btn-secondary btn-sm btn-icon" aria-label={t("Previous")} disabled={f.page <= 1} onClick={() => set({ page: String(f.page - 1) }, true)}><Icon n={I.left} /></button>
                {pageList.map((n, i) => (
                  <span key={n} className="row g4">
                    {i > 0 && n - pageList[i - 1]! > 1 && <span className="subtle" style={{ padding: '0 4px' }}>…</span>}
                    <button type="button" className={`btn ${n === f.page ? 'btn-primary' : 'btn-secondary'} btn-sm btn-icon`} aria-current={n === f.page ? 'page' : undefined} onClick={() => set({ page: String(n) }, true)}>{n}</button>
                  </span>
                ))}
                <button type="button" className="btn btn-secondary btn-sm btn-icon" aria-label={t("Next")} disabled={f.page >= pages} onClick={() => set({ page: String(f.page + 1) }, true)}><Icon n={I.right} /></button>
              </nav>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
