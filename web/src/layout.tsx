// Каркас страниц: шапка, подвал, раскладка аккаунта, карточка места.
import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import type { PlaceCard } from '../../shared/types.ts';
import { api } from './api.ts';
import { loginUrl, useApp } from './state.tsx';
import { Art, Avatar, I, Icon, Popover, Rate } from './ui.tsx';
import { LANGS, t, tl, usePrefs } from './i18n.tsx';

export function Logo({ badge }: { badge?: string }) {
  return <Link to="/" className="logo"><i />qwerttclients{badge && <span className="badge info">{badge}</span>}</Link>;
}

function UserMenu() {
  const { user, logout } = useApp();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const location = useLocation();
  useEffect(() => { setOpen(false); }, [location]);
  useEffect(() => { if (user) api.stats().then((s) => setUnread(s.unread)).catch(() => undefined); }, [location.pathname, user]);
  if (!user) return null;
  return (
    <>
      <Link to="/account/notifications" className="btn btn-subtle btn-sm btn-icon" aria-label={t("Notifications{a}", { a: unread ? `, ${unread} unread` : '' })} style={{ position: 'relative' }}>
        <Icon n={I.bell} size={18} />
        {unread > 0 && <span style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)' }} />}
      </Link>
      <div style={{ position: 'relative' }}>
        <button type="button" className="row g8 sb" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Avatar user={user} />{user.firstName}<Icon n={I.down} size={14} />
        </button>
        <Popover open={open} onClose={() => setOpen(false)} style={{ left: 'auto', right: 0 }}>
          <div className="menu" role="menu" style={{ width: 200 }}>
            <Link to="/account/profile" role="menuitem"><Icon n={I.user} />{' '}{t("Profile")}</Link>
            <Link to="/account/bookings" role="menuitem"><Icon n={I.calendar} />{' '}{t("My bookings")}</Link>
            <Link to="/account/settings" role="menuitem"><Icon n={I.settings} />{' '}{t("Settings")}</Link>
            <hr className="hr" style={{ margin: '4px 0' }} />
            <button type="button" className="mi" role="menuitem" onClick={() => void logout()}><Icon n={I.logout} />{' '}{t("Log out")}</button>
          </div>
        </Popover>
      </div>
    </>
  );
}

export function Header() {
  const { user, ready } = useApp();
  const { pathname, search } = useLocation();
  const cls = (on: boolean) => (on ? 'on' : undefined);
  const explore = pathname === '/' || pathname.startsWith('/categories') || pathname.startsWith('/place') || pathname.startsWith('/book')
    || (pathname.startsWith('/search') && !search.includes('deals=1'));
  return (
    <header className="hdr">
      <div className="row g24">
        <Logo />
        <nav className="nav" aria-label={t("Main")}>
          <Link to="/" className={cls(explore)}>{t("Explore")}</Link>
          <Link to="/search?deals=1" className={cls(pathname.startsWith('/search') && search.includes('deals=1'))}>{t("Deals")}</Link>
          <Link to="/account/bookings" className={cls(pathname.startsWith('/account'))}>{t("My bookings")}</Link>
          <Link to="/business" className={cls(pathname.startsWith('/business'))}>{t("For business")}</Link>
        </nav>
      </div>
      <div className="row g8">
        <LangMenu />
        <ThemeToggle />
        {ready && !user && (
          <>
            <Link to={loginUrl(pathname + search)} className="btn btn-secondary btn-sm">{t("Log in")}</Link>
            <Link to="/signup" className="btn btn-primary btn-sm">{t("Sign up")}</Link>
          </>
        )}
        <UserMenu />
      </div>
    </header>
  );
}

/** Выбор языка интерфейса; у вошедшего пользователя выбор сохраняется в аккаунте. */
export function LangMenu() {
  const { lang, setLang } = usePrefs();
  const { user, setUser } = useApp();
  const [open, setOpen] = useState(false);
  const current = LANGS.find((l) => l.code === lang)!;
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" className="btn btn-subtle btn-sm icon-swap" aria-haspopup="menu" aria-expanded={open} aria-label={t('Language')} onClick={() => setOpen(!open)}>
        <Icon n={I.globe} /> {current.short} · USD
      </button>
      <Popover open={open} onClose={() => setOpen(false)} style={{ left: 'auto', right: 0 }}>
        <div className="menu" role="menu" style={{ width: 180 }}>
          {LANGS.map((l) => (
            <button type="button" key={l.code} role="menuitemradio" aria-checked={l.code === lang} className={`mi ${l.code === lang ? 'on' : ''}`}
              onClick={() => {
                setOpen(false);
                setLang(l.code);
                if (user) void api.updateSettings({ language: l.code }).then((r) => setUser(r.user)).catch(() => undefined);
              }}>
              <span className="grow">{l.label}</span>{l.code === lang && <Icon n={I.check} />}
            </button>
          ))}
        </div>
      </Popover>
    </div>
  );
}

/** Переключатель «день / ночь». */
export function ThemeToggle() {
  const { theme, setTheme } = usePrefs();
  const dark = theme === 'dark';
  return (
    <button type="button" className="btn btn-subtle btn-sm btn-icon icon-swap" aria-label={dark ? t('Switch to day mode') : t('Switch to night mode')} title={dark ? t('Day') : t('Night')}
      onClick={() => setTheme(dark ? 'light' : 'dark')}>
      <Icon n={dark ? I.sun : I.moon} size={18} />
    </button>
  );
}

export function Footer() {
  const col = (title: string, links: [string, string][]) => (
    <div className="col g12 grow">
      <h4 className="h3" style={{ fontSize: 14 }}>{title}</h4>
      {links.map(([label, to]) => <Link key={label} to={to} className="muted">{label}</Link>)}
    </div>
  );
  return (
    <footer className="foot px" style={{ paddingTop: 40, paddingBottom: 24 }}>
      <div className="row start" style={{ gap: 48 }}>
        <div className="col g12" style={{ width: 260 }}>
          <Logo />
          <p className="muted">{t("One place to book restaurants, salons, hotels, sports and events.")}</p>
          <div className="row g8">
            <Link to="/apps" className="btn btn-secondary btn-sm">App Store</Link>
            <Link to="/apps" className="btn btn-secondary btn-sm">Google Play</Link>
          </div>
        </div>
        {col(t("Support"), [[t("Help centre"), '/help'], [t('Booking examples'), '/examples'], [t("Contact us"), '/contact'], [t("Cancellation policy"), '/help#cancellation'], [t("Safety & trust"), '/help#safety']])}
        {col(t("Company"), [[t("About"), '/about'], [t("Careers"), '/careers'], [t("Press"), '/press'], [t("Blog"), '/blog']])}
        {col(t("Explore"), [[t("Restaurants"), '/search?category=restaurants'], [t("Beauty"), '/search?category=beauty'], [t("Wellness"), '/search?category=wellness'],
          [t("Hotels"), '/search?category=hotels'], [t("Sports"), '/search?category=sports'], [t("Events"), '/search?category=events']])}
        {col(t("Business"), [[t("List your business"), '/partners'], [t("Partner dashboard"), '/business'], [t("All categories"), '/categories'], [t("Deals"), '/search?deals=1']])}
      </div>
      <hr className="hr" style={{ margin: '32px 0 16px' }} />
      <div className="row between sm subtle">
        <span>© {new Date().getFullYear()}{' '}{t("qwerttclients. All rights reserved.")}</span>
        <div className="row g24">
          <Link to="/terms">{t("Terms")}</Link>
          <Link to="/privacy">{t("Privacy")}</Link>
          <Link to="/cookies">{t('Cookies')}</Link>
          <Link to="/credits">{t('Photo credits')}</Link>
          <span className="row g4"><Icon n={I.lock} size={12} />{' '}{t("Secure booking")}</span>
        </div>
      </div>
    </footer>
  );
}

/** Прокрутка к началу при переходе между страницами и к якорю, если он есть. */
function ScrollReset() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

/** Содержимое страницы с анимацией появления при каждом переходе. */
function Routed() {
  const { pathname } = useLocation();
  return <div key={pathname} className="route"><Outlet /></div>;
}

export function Shell({ footer = true }: { footer?: boolean }) {
  return (
    <>
      <ScrollReset />
      <Header />
      <div className="shell"><Routed /></div>
      {footer && <Footer />}
    </>
  );
}

export function AuthShell() {
  return (
    <>
      <ScrollReset />
      <header className="hdr" style={{ height: 56 }}>
        <Logo />
        <Link to="/help" className="row g4 sb muted"><Icon n={I.help} />{' '}{t("Help")}</Link>
      </header>
      <div className="shell"><Outlet /></div>
    </>
  );
}

const ACCOUNT_NAV: [string, string, string][] = [
  ['Profile', '/account/profile', I.user], ['My bookings', '/account/bookings', I.calendar], ['Saved places', '/account/saved', I.heart],
  ['Notifications', '/account/notifications', I.bell], ['Payment methods', '/account/payments', I.card], ['Settings', '/account/settings', I.settings],
];

export function AccountLayout() {
  const { user, ready, logout } = useApp();
  const { pathname, search } = useLocation();
  if (!ready) return <div className="px" style={{ padding: '32px var(--px)' }}><div className="skel" style={{ height: 240 }} /></div>;
  if (!user) return <Navigate to={loginUrl(pathname + search)} replace />;
  return (
    <div className="row start px" style={{ gap: 32, paddingTop: 32, paddingBottom: 56, flex: 1 }}>
      <aside className="col g4" style={{ width: 240, flexShrink: 0 }} aria-label={t("Account")}>
        {ACCOUNT_NAV.map(([label, to, icon]) => (
          <NavLink key={to} to={to} className={({ isActive }) => `side-link ${isActive ? 'on' : ''}`}><Icon n={icon} size={18} />{t(label)}</NavLink>
        ))}
        <hr className="hr" style={{ margin: '8px 0' }} />
        <button type="button" className="side-link" onClick={() => void logout()}><Icon n={I.logout} size={18} />{' '}{t("Log out")}</button>
      </aside>
      <main className="grow"><Outlet /></main>
    </div>
  );
}

export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  useEffect(() => { document.title = `${title} — qwerttclients`; }, [title]);
  return (
    <div className="col g4" style={{ marginBottom: 24 }}>
      <h1 className="h1">{title}</h1>
      {children && <p className="muted">{children}</p>}
    </div>
  );
}

export function Crumbs({ items }: { items: [string, string?][] }) {
  return (
    <nav aria-label={t("Breadcrumb")} className="row g8 sm" style={{ padding: '16px 0' }}>
      {items.map(([label, to], i) => (
        <span key={label} className="row g8">
          {i > 0 && <span className="subtle">/</span>}
          {to ? <Link to={to} className="muted">{t(label)}</Link> : <span className="b" aria-current="page">{t(label)}</span>}
        </span>
      ))}
    </nav>
  );
}

export const priceLabel = (p: Pick<PlaceCard, 'priceFrom' | 'priceUnit'>) => `${t('From')} $${p.priceFrom}${p.priceUnit ? ` ${t(p.priceUnit)}` : ''}`;

export function SaveButton({ place, onChange, variant = 'round' }: { place: { slug: string; saved: boolean }; onChange?: (saved: boolean) => void; variant?: 'round' | 'icon' | 'text' }) {
  const { toggleSave } = useApp();
  const [saved, setSaved] = useState(place.saved);
  useEffect(() => setSaved(place.saved), [place.saved]);
  const click = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = await toggleSave(place.slug, saved).catch(() => saved);
    setSaved(next);
    onChange?.(next);
  };
  const label = saved ? t('Remove from saved') : t('Save');
  if (variant === 'text') {
    return <button type="button" className={`btn btn-secondary btn-sm ${saved ? 'on-heart' : ''}`} aria-pressed={saved} onClick={click}><Icon n={I.heart} size={14} /> {saved ? t("Saved") : t("Save")}</button>;
  }
  if (variant === 'icon') {
    return <button type="button" className={`btn btn-secondary btn-sm btn-icon ${saved ? 'on-heart' : ''}`} aria-label={label} aria-pressed={saved} onClick={click}><Icon n={I.heart} /></button>;
  }
  return (
    <button type="button" className={`heart ${saved ? 'on' : ''}`} aria-label={label} aria-pressed={saved} onClick={click} style={{ position: 'absolute', top: 8, right: 8 }}>
      <Icon n={I.heart} size={15} color="var(--ink-2)" />
    </button>
  );
}

/** Вертикальная карточка места из главной: иллюстрация, рейтинг, цена и свободные сегодня слоты. */
export function PlaceTile({ place, onSaved, showAddress }: { place: PlaceCard; onSaved?: (saved: boolean) => void; showAddress?: boolean }) {
  return (
    <Link to={`/place/${place.slug}`} className="card place-card">
      <div className="ph" style={{ '--c': place.color, width: '100%', height: 140, borderRadius: 0, position: 'relative', overflow: 'hidden' } as CSSProperties}>
        <Art n={place.art} />
        <SaveButton place={place} onChange={onSaved} />
      </div>
      <div className="col g4" style={{ padding: 12 }}>
        <div className="row between">
          <span className="h3">{place.name}</span>
          <Rate value={place.rating} />
        </div>
        <span className="sm muted">{tl(place.subtitle)}</span>
        <span className="sm subtle">{showAddress || !place.slots.length ? `${place.address} · ` : ''}{priceLabel(place)}</span>
        {place.slots.length > 0 && (
          <div className="col g4" style={{ marginTop: 4 }}>
            <span className="sm subtle">{t("Available today")}</span>
            <div className="row g4 wrap">
              {place.slots.map((s) => <span key={s.time} className={`slot mini ${s.left <= 2 ? 'few' : ''}`}>{s.time}</span>)}
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}
