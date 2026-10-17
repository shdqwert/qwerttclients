// Заставка при загрузке сайта.
// На главной — полноэкранный экран, который держится, пока пользователь не прокрутит колёсико
// (или не потянет пальцем, или не нажмёт ↓ / Space / Enter): экран уезжает вверх, слои внутри
// двигаются с разной скоростью (параллакс), а сайт под ним приближается и проявляется.
// На остальных страницах — короткая заставка, которая скрывается сама.
// Переходы по ссылкам страницу не перезагружают, поэтому заставку не вызывают.
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { t } from './i18n.tsx';
import { Icon } from './ui.tsx';

type Mode = 'curtain' | 'brief' | null;

/** Решение принимается один раз при загрузке страницы. */
const MODE: Mode = matchMedia('(prefers-reduced-motion: reduce)').matches ? null : location.pathname === '/' ? 'curtain' : 'brief';

/** Сайт под короткой заставкой появляется с задержкой. */
export const introShown = MODE === 'brief';

export function Intro() {
  if (MODE === 'curtain') return <Curtain />;
  if (MODE === 'brief') return <Brief />;
  return null;
}

function Logo() {
  return (
    <div className="intro-logo">
      <span className="intro-mark" />
      <span className="intro-word">
        {'qwerttclients'.split('').map((ch, i) => <span key={i} style={{ animationDelay: `${0.25 + i * 0.035}s` }}>{ch}</span>)}
      </span>
    </div>
  );
}

function Brief() {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setGone(true), 2000);
    return () => clearTimeout(timer);
  }, []);
  if (gone) return null;
  return (
    <div className="intro" aria-hidden="true">
      <Logo />
      <div className="intro-bar"><i /></div>
      <span className="intro-tag">{t('Book anything nearby')}</span>
    </div>
  );
}

/** Категории, «парящие» вокруг логотипа: смещение от центра и глубина (чем больше, тем быстрее слой). */
const CHIPS: [string, string, string, number, number, number][] = [
  ['Restaurants', 'i7', '#B5622E', -30, -24, 1.3],
  ['Hotels', 'i9', '#3B5BA9', 27, -27, 0.8],
  ['Beauty', 'i8', '#8E5A9E', -34, 16, 0.6],
  ['Sports', 'i18', '#A8456B', 31, 19, 1.1],
  ['Events', 'i11', '#5B49A8', -10, 31, 0.9],
  ['Cafes', 'i17', '#8A6248', 13, -35, 0.7],
];

function Curtain() {
  const ref = useRef<HTMLDivElement>(null);
  const open = useRef<() => void>(() => undefined);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const el = ref.current!;
    const root = document.documentElement;
    root.classList.add('splash-on');
    window.scrollTo(0, 0);

    // p — текущее положение (0 — экран на месте, 1 — уехал), target — куда тянет пользователь.
    let p = 0;
    let target = 0;
    let mx = 0, my = 0, cx = 0, cy = 0;
    let raf = 0;
    let idle: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    // Если браузер притормаживает кадры (вкладка в фоне), экран всё равно уезжает до конца.
    let force: ReturnType<typeof setTimeout> | undefined;
    const commit = () => { clearTimeout(force); force = setTimeout(() => { if (target === 1) finish(); }, 1400); };

    const finish = () => {
      if (finished) return;
      finished = true;
      cleanup();
      setDone(true);
    };
    const tick = () => {
      p += (target - p) * 0.12;
      cx += (mx - cx) * 0.06;
      cy += (my - cy) * 0.06;
      if (Math.abs(target - p) < 0.002 || (target === 1 && p > 0.985)) p = target;
      el.style.setProperty('--p', p.toFixed(4));
      el.style.setProperty('--mx', cx.toFixed(3));
      el.style.setProperty('--my', cy.toFixed(3));
      root.style.setProperty('--sp', p.toFixed(4));
      if (p >= 1) { finish(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // Экран следует за колёсиком; когда пользователь остановился — доезжает до конца или возвращается.
    const push = (delta: number) => {
      target = Math.min(1, Math.max(0, target + delta));
      clearTimeout(idle);
      idle = setTimeout(() => { target = target > 0.08 ? 1 : 0; if (target === 1) commit(); }, 140);
    };
    open.current = () => { clearTimeout(idle); target = 1; commit(); };

    const onWheel = (e: WheelEvent) => { e.preventDefault(); push(e.deltaY / (innerHeight * 0.8)); };
    let touchY = 0;
    const onTouchStart = (e: TouchEvent) => { touchY = e.touches[0]!.clientY; };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const y = e.touches[0]!.clientY;
      push((touchY - y) / innerHeight);
      touchY = y;
    };
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); open.current(); }
    };
    const onMove = (e: MouseEvent) => { mx = (e.clientX / innerWidth) * 2 - 1; my = (e.clientY / innerHeight) * 2 - 1; };

    addEventListener('wheel', onWheel, { passive: false });
    addEventListener('touchstart', onTouchStart, { passive: true });
    addEventListener('touchmove', onTouchMove, { passive: false });
    addEventListener('keydown', onKey);
    addEventListener('mousemove', onMove);

    function cleanup() {
      cancelAnimationFrame(raf);
      clearTimeout(idle);
      clearTimeout(force);
      removeEventListener('wheel', onWheel);
      removeEventListener('touchstart', onTouchStart);
      removeEventListener('touchmove', onTouchMove);
      removeEventListener('keydown', onKey);
      removeEventListener('mousemove', onMove);
      root.classList.remove('splash-on');
      root.style.removeProperty('--sp');
    }
    return cleanup;
  }, []);

  if (done) return null;
  return (
    <div ref={ref} className="splash" role="region" aria-label="qwerttclients">
      <div className="splash-grid" />
      <div className="splash-glow a" />
      <div className="splash-glow b" />
      {CHIPS.map(([name, icon, color, x, y, d], i) => (
        <div key={name} className="splash-chip" aria-hidden="true" style={{ '--x': `${x}vw`, '--y': `${y}vh`, '--d': d } as CSSProperties}>
          <span style={{ animationDelay: `${0.7 + i * 0.09}s, ${i * 0.8}s` }}>
            <i style={{ background: color }}><Icon n={icon} size={14} color="#fff" sw={1.8} /></i>{t(name)}
          </span>
        </div>
      ))}
      <div className="splash-center">
        <Logo />
        <div className="col g8" style={{ alignItems: 'center', textAlign: 'center' }}>
          <h1 className="splash-title">{t('Book anything nearby')}</h1>
          <p className="splash-sub">{t('Restaurants, salons, hotels, courts and events. Real-time availability, instant confirmation.')}</p>
        </div>
      </div>
      <button type="button" className="splash-hint" onClick={() => open.current()}>
        <span className="splash-mouse" />
        {t('Scroll to explore')}
      </button>
    </div>
  );
}
