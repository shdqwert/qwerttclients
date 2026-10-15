// Макеты «03 · Главная», «34 · Поиск: состояния» и «33 · Категории».
import { type CSSProperties, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.ts';
import { Crumbs, PlaceTile } from '../layout.tsx';
import { locate, type Query, queryParams, quickPicks, readQuery, SearchFields } from '../search.tsx';
import { Art, ErrorBox, I, Icon, useLoad } from '../ui.tsx';
import { plural } from '../../../shared/dates.ts';
import { t } from '../i18n.tsx';

const TABS: [string, string, string][] = [
  ['restaurants', 'Restaurants', 'i7'], ['beauty', 'Beauty', 'i8'], ['hotels', 'Hotels', 'i9'],
  ['sports', 'Sports', 'i10'], ['events', 'Events', 'i11'], ['wellness', 'Wellness', 'i13'],
];

const FLEX: Record<string, number> = { where: 1.4, date: 1, time: 0.8, guests: 0.9 };

export function Home() {
  const navigate = useNavigate();
  const [query, setQuery] = useState<Query>(() => ({ ...readQuery(new URLSearchParams()), category: 'restaurants' }));
  const [filter, setFilter] = useState('');
  const [locating, setLocating] = useState(false);
  const patch = (p: Partial<Query>) => setQuery((q) => ({ ...q, ...p }));
  const go = (q: Query) => navigate(`/search?${new URLSearchParams(queryParams(q))}`);

  const cats = useLoad(() => api.categories(), []);
  const places = useLoad(() => api.places({ perPage: 50 }), []);
  const hoods = useLoad(() => api.neighbourhoods(), []);
  useEffect(() => { document.title = 'qwerttclients — book anything nearby'; }, []);

  const all = places.data?.items ?? [];
  const withSlots = all.filter((p) => p.slots.length > 0);
  const todayTabs = ['restaurants', 'beauty', 'wellness', 'sports'].filter((c) => withSlots.some((p) => p.category === c));
  const available = withSlots.filter((p) => !filter || p.category === filter).slice(0, 4);
  const longer = ['hotels', 'sports', 'coworking', 'health', 'events']
    .map((c) => all.find((p) => p.category === c && !available.includes(p)))
    .filter((p) => p != null).slice(0, 4);
  const catName = (id: string) => t(cats.data?.find((c) => c.id === id)?.name ?? id);

  return (
    <>
      <section className="px hero" style={{ paddingTop: 40, paddingBottom: 40 }}>
        <div className="col g16">
          <div className="col g4">
            <h1 className="h1-lg">{t("Book anything nearby")}</h1>
            <p style={{ color: '#CFE1FD', fontSize: 16, lineHeight: '24px' }}>{t("Restaurants, salons, hotels, courts and events. Real-time availability, instant confirmation.")}</p>
          </div>
          <form className="card raised" onSubmit={(e) => { e.preventDefault(); go(query); }}>
            <div className="tabs" style={{ padding: '0 16px', gap: 28 }} role="tablist" aria-label={t("Category")}>
              {TABS.map(([id, name, icon]) => (
                <button type="button" key={id} role="tab" aria-selected={query.category === id} className={`tab ${query.category === id ? 'on' : ''}`} onClick={() => patch({ category: id })}>
                  <Icon n={icon} size={18} />{t(name)}
                </button>
              ))}
            </div>
            <div className="row" style={{ padding: 16, gap: 0 }}>
              <div className="row grow" style={{ border: '1px solid var(--line-strong)', borderRadius: 'var(--r)' }}>
                <SearchFields value={query} onChange={patch} cell={(key, label, icon, content, popover) => (
                  <div key={key} className="col" style={{ padding: '8px 16px', borderRight: key === 'guests' ? 0 : '1px solid var(--line)', flex: FLEX[key], position: 'relative', minWidth: 0 }}>
                    <span className="label subtle">{label}</span>
                    <span className="row g8 sb" style={{ height: 24 }}><Icon n={icon} color="var(--ink-3)" />{content}</span>
                    {popover}
                  </div>
                )} />
                <button type="submit" className="btn btn-primary btn-lg" style={{ margin: 4 }}><Icon n={I.search} size={18} color="#fff" />{' '}{t("Search")}</button>
              </div>
            </div>
            <div className="row g8" style={{ padding: '0 16px 16px' }}>
              <span className="sm subtle">{t("Quick pick:")}</span>
              {quickPicks().map((p) => (
                <button type="button" key={p.label} className="chip" onClick={() => go({ ...query, ...p.patch })}>{p.label}</button>
              ))}
              <button type="button" className="chip" disabled={locating} onClick={async () => {
                setLocating(true);
                const near = await locate();
                setLocating(false);
                navigate(`/search?${new URLSearchParams({ ...queryParams(query), sort: 'distance', ...(near ? { near } : {}) })}`);
              }}><Icon n={I.locate} size={14} /> {locating ? t('Locating…') : t('Near me')}</button>
            </div>
          </form>
        </div>
      </section>

      <div className="page col" style={{ gap: 48, paddingTop: 40, paddingBottom: 56 }}>
        <section className="col g16" aria-label={t("Categories")}>
          <div className="row g12">
            {(cats.data ?? []).map((c) => (
              <Link key={c.id} to={`/search?category=${c.id}`} className="card col g8 cat-card" style={{ flex: 1, padding: '16px 8px', alignItems: 'center', textAlign: 'center' }}>
                <span style={{ width: 44, height: 44, borderRadius: 'var(--r)', background: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon n={c.icon} size={22} color="#fff" sw={1.6} />
                </span>
                <span className="sb" style={{ fontSize: 13, lineHeight: '16px' }}>{t(c.name)}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="card row between" style={{ padding: '20px 24px' }}>
          <div className="row g16">
            <span style={{ width: 44, height: 44, borderRadius: 'var(--r)', background: 'var(--accent-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon n={I.calendar} size={22} color="var(--accent)" /></span>
            <div className="col g4">
              <span className="h3">{t('See how booking works')}</span>
              <span className="sm muted">{t('Five ready examples: a restaurant table, a barber, a hotel room, a tennis court and concert tickets.')}</span>
            </div>
          </div>
          <Link to="/examples" className="btn btn-secondary">{t('Open examples')}</Link>
        </section>

        {places.error && <ErrorBox error={places.error} onRetry={places.reload} />}

        <section className="col g16">
          <div className="row between" style={{ alignItems: 'flex-end' }}>
            <div className="col g4">
              <h2 className="h2">{t("Available today near you")}</h2>
              <span className="sm muted">{t("Tables and appointments you can still get today")}</span>
            </div>
            <Link to="/search?openAt=1" className="link row g4">{t("See all")}<Icon n={I.right} size={14} /></Link>
          </div>
          <div className="tabs" style={{ gap: 20 }} role="tablist" aria-label={t("Available today")}>
            {['', ...todayTabs].map((c) => (
              <button type="button" key={c} role="tab" aria-selected={filter === c} className={`tab ${filter === c ? 'on' : ''}`} onClick={() => setFilter(c)}>{c ? catName(c) : t("All")}</button>
            ))}
          </div>
          {places.loading && !places.data
            ? <div className="grid4">{[0, 1, 2, 3].map((i) => <div key={i} className="skel" style={{ height: 280 }} />)}</div>
            : available.length
              ? <div className="grid4 stagger">{available.map((p) => <PlaceTile key={p.slug} place={p} />)}</div>
              : !places.error && <p className="muted">{t("Nothing is left for today. Pick another date in the search above.")}</p>}
        </section>

        {longer.length > 0 && (
          <section className="col g16">
            <div className="row between" style={{ alignItems: 'flex-end' }}>
              <div className="col g4">
                <h2 className="h2">{t("Hotels, courts and offices")}</h2>
                <span className="sm muted">{t("Longer stays and shared spaces")}</span>
              </div>
              <Link to="/search" className="link row g4">{t("Browse all")}<Icon n={I.right} size={14} /></Link>
            </div>
            <div className="grid4 stagger">{longer.map((p) => <PlaceTile key={p.slug} place={{ ...p, slots: [] }} showAddress />)}</div>
          </section>
        )}

        <section className="row g32 start">
          <div className="col g8 grow">
            <h2 className="h2">{t("Browse by neighbourhood")}</h2>
            <div>
              {(hoods.data ?? []).map((n) => (
                <Link key={n.name} to={`/search?where=${encodeURIComponent(n.name)}`} className="line-row">
                  <span className="row g8 sb"><Icon n={I.pin} color="var(--ink-3)" />{t(n.name)}</span>
                  <span className="sm subtle">{plural(n.count, 'place')}</span>
                </Link>
              ))}
            </div>
          </div>
          <div className="col g16" style={{ width: 520 }}>
            <h2 className="h2">{t("Why book here")}</h2>
            <div className="card col g16 card-p24">
              {([
                [I.check, t("Instant confirmation"), t("Most places confirm in seconds, no phone calls.")],
                [I.refresh, t("Free cancellation"), t("Change or cancel up to the time shown on each place.")],
                [I.shield, t("Verified reviews"), t("Only people who booked and visited can review.")],
              ] as const).map(([icon, title, text]) => (
                <div key={title} className="row g12 start">
                  <Icon n={icon} size={24} color="var(--accent)" />
                  <div className="col"><span className="b">{t(title)}</span><span className="sm muted">{t(text)}</span></div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="card row between" style={{ padding: '24px 32px', background: 'var(--accent-tint)', borderColor: 'var(--accent-tint-2)' }}>
          <div className="col g4">
            <h2 className="h2">{t("Run a restaurant, salon, hotel or club?")}</h2>
            <span className="muted">{t("Take bookings online and manage your day in one schedule.")}</span>
          </div>
          <Link to="/business" className="btn btn-primary">{t("List your business")}</Link>
        </section>
      </div>
    </>
  );
}

const FLOWS: [string, string][] = [
  ['Restaurants, cafes', 'Date → time → guests → table'], ['Beauty, spa, health', 'Service → specialist → date → time'],
  ['Hotels', 'Dates → guests → room → extras'], ['Sports', 'Court → date → time → duration'], ['Events', 'Date → tickets'],
];

export function Categories() {
  const cats = useLoad(() => api.categories(), []);
  useEffect(() => { document.title = 'All categories — qwerttclients'; }, []);
  return (
    <div className="page col g32" style={{ paddingBottom: 56 }}>
      <div>
        <Crumbs items={[['Home', '/'], ['All categories']]} />
        <h1 className="h1">{t("All categories")}</h1>
      </div>
      {cats.error && <ErrorBox error={cats.error} onRetry={cats.reload} />}
      <div className="grid4">
        {(cats.data ?? []).map((c) => (
          <Link key={c.id} to={`/search?category=${c.id}`} className="card col cat-card" style={{ overflow: 'hidden' }}>
            <div className="ph" style={{ '--c': c.color, width: '100%', height: 96, borderRadius: 0, position: 'relative', overflow: 'hidden' } as CSSProperties}>
              <Art n={c.art} />
            </div>
            <div className="col g4" style={{ padding: 12 }}>
              <span className="h3">{t(c.name)}</span>
              <span className="sm muted">{plural(c.count, 'place')} · {t(c.unit)}</span>
            </div>
          </Link>
        ))}
      </div>
      <section className="col g8">
        <div className="row between"><h2 className="h2">{t("How booking works in each category")}</h2><Link to="/examples" className="link">{t('Open examples')}</Link></div>
        <span className="sm muted">{t("The steps adapt to what you book: three or four screens, never more.")}</span>
        <div className="card lines" style={{ padding: '0 16px' }}>
          {FLOWS.map(([name, flow]) => (
            <div key={name} className="line-row"><span className="sb">{t(name)}</span><span className="muted">{t(flow)}</span></div>
          ))}
        </div>
      </section>
    </div>
  );
}
