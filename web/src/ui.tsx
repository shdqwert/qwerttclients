// Компоненты дизайн-системы: разметка и классы взяты из макета «04 · Дизайн-система».
import {
  type CSSProperties, type ReactNode, useCallback, useEffect, useId, useRef, useState,
} from 'react';
import { addMonths, fmtFull, fmtMonth, monthDays, toDate } from '../../shared/dates.ts';
import type { DayState, Line } from '../../shared/types.ts';
import { ApiErr } from './api.ts';
import { ICONS } from './icons.generated.ts';
import { PHOTOS, photoUrl } from './photos.ts';
import { t } from './i18n.tsx';

/** Имена иконок из макета. */
export const I = {
  arrow: 'i1', search: 'i2', calendar: 'i3', sparkle: 'i4', info: 'i5', right: 'i6', globe: 'i12', pin: 'i14', clock: 'i15',
  users: 'i16', heart: 'i21', star: 'i22', check: 'i30', refresh: 'i31', shield: 'i32', lock: 'i33', alert: 'i34', minus: 'i35',
  plus: 'i36', left: 'i37', sun: 'i60', moon: 'moon', briefcase: 'briefcase', book: 'book', download: 'download', locate: 'locate', send: 'send', phoneApp: 'smartphone', user: 'i38', settings: 'i39', logout: 'i40', list: 'i41', starLine: 'i42', x: 'i43', down: 'i44',
  card: 'i47', bell: 'i48', filters: 'i49', mail: 'i50', eye: 'i51', eyeOff: 'i52', calPlus: 'i53', share: 'i54', phone: 'i55',
  map: 'i56', receipt: 'i57', languages: 'i61', camera: 'i62', cancel: 'i63', home: 'i64', tag: 'i66', help: 'i67',
} as const;

const EXTRA: Record<string, { viewBox: string; body: string; filled?: boolean }> = {
  moon: { viewBox: '0 0 24 24', body: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>' },
  briefcase: { viewBox: '0 0 24 24', body: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>' },
  book: { viewBox: '0 0 24 24', body: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/>' },
  download: { viewBox: '0 0 24 24', body: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>' },
  locate: { viewBox: '0 0 24 24', body: '<line x1="2" x2="5" y1="12" y2="12"/><line x1="19" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="5"/><line x1="12" x2="12" y1="19" y2="22"/><circle cx="12" cy="12" r="7"/>' },
  send: { viewBox: '0 0 24 24', body: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>' },
  smartphone: { viewBox: '0 0 24 24', body: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>' },
};

export function Icon({ n, size = 16, color, sw = 1.7, style, className }: {
  n: string; size?: number; color?: string; sw?: number; style?: CSSProperties; className?: string;
}) {
  const d = ICONS[n] ?? EXTRA[n];
  if (!d) return null;
  return (
    <svg
      width={size} height={size} viewBox={d.viewBox} fill={d.filled ? color ?? 'currentColor' : 'none'} stroke={color ?? 'currentColor'}
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style} className={className}
      dangerouslySetInnerHTML={{ __html: d.body }}
    />
  );
}

/** Фото места (или плоская иллюстрация из макета), заполняет родительский блок. */
export function Art({ n, eager }: { n: string; eager?: boolean }) {
  const photo = PHOTOS[n];
  if (photo) {
    return (
      <img src={photoUrl(n)} alt={photo.alt} loading={eager ? 'eager' : 'lazy'} decoding="async" draggable={false}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
    );
  }
  const d = ICONS[n];
  if (!d) return null;
  return (
    <svg
      viewBox={d.viewBox} preserveAspectRatio="xMidYMid slice" width="100%" height="100%" aria-hidden="true"
      style={{ position: 'absolute', inset: 0, display: 'block' }} dangerouslySetInnerHTML={{ __html: d.body }}
    />
  );
}

export function Thumb({ color, icon, size = 56 }: { color: string; icon: string; size?: number }) {
  return (
    <div className="ph" style={{ '--c': color, width: size, height: size, borderRadius: 'var(--r)', position: 'relative' } as CSSProperties}>
      <Icon n={icon} size={size > 56 ? 24 : 22} color="#fff" sw={1.6} />
    </div>
  );
}

export function Rate({ value, count, size = 13 }: { value: number; count?: number; size?: number }) {
  return (
    <>
      <span className="rate"><Icon n={I.star} size={size} color="#946F00" sw={1} />{value.toFixed(1)}</span>
      {count != null && <span className="subtle"> ({count})</span>}
    </>
  );
}

export function Banner({ kind, title, children, icon }: { kind: 'info' | 'success' | 'warn' | 'danger'; title?: ReactNode; children?: ReactNode; icon?: string }) {
  const color = { info: 'var(--accent)', success: 'var(--success)', warn: 'var(--warn)', danger: 'var(--danger)' }[kind];
  return (
    <div className={`banner ${kind}`} role={kind === 'danger' ? 'alert' : 'status'}>
      <Icon n={icon ?? (kind === 'success' ? I.check : kind === 'info' ? I.info : I.alert)} size={18} color={color} />
      <div className="col">
        {title && <span className="b">{title}</span>}
        {children && <span className="sm">{children}</span>}
      </div>
    </div>
  );
}

export function Field({ label, error, help, children, aside, style }: {
  label: ReactNode; error?: string; help?: ReactNode; children: ReactNode; aside?: ReactNode; style?: CSSProperties;
}) {
  return (
    <label className="field" style={style}>
      {aside ? <div className="row between"><span className="label">{label}</span>{aside}</div> : <span className="label">{label}</span>}
      {children}
      {error ? <span className="help err" role="alert"><Icon n={I.alert} size={12} />{error}</span> : help ? <span className="help">{help}</span> : null}
    </label>
  );
}

export function TextInput({ value, onChange, icon, error, ok, type = 'text', placeholder, disabled, autoComplete, name, autoFocus }: {
  value: string; onChange: (v: string) => void; icon?: string; error?: boolean; ok?: boolean; type?: string; placeholder?: string;
  disabled?: boolean; autoComplete?: string; name?: string; autoFocus?: boolean;
}) {
  return (
    <div className={`input ${error ? 'error' : ok ? 'ok-s' : ''} ${disabled ? 'dis' : ''}`}>
      {icon && <Icon n={icon} size={16} color="var(--ink-3)" />}
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
        autoComplete={autoComplete} name={name} autoFocus={autoFocus} aria-invalid={error || undefined}
      />
    </div>
  );
}

export function PasswordInput({ value, onChange, error, disabled, placeholder, autoComplete = 'current-password' }: {
  value: string; onChange: (v: string) => void; error?: boolean; disabled?: boolean; placeholder?: string; autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className={`input ${error ? 'error' : ''} ${disabled ? 'dis' : ''}`}>
      <Icon n={I.lock} size={16} color="var(--ink-3)" />
      <input
        type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? t('Enter your password')}
        disabled={disabled} autoComplete={autoComplete} aria-invalid={error || undefined}
      />
      <button type="button" className="row" aria-label={show ? t("Hide password") : t("Show password")} onClick={() => setShow(!show)}>
        <Icon n={show ? I.eyeOff : I.eye} size={18} color="var(--ink-2)" />
      </button>
    </div>
  );
}

export function Check({ checked, onChange, children, align }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; align?: 'start' }) {
  return (
    <label className="row g8" style={align ? { alignItems: 'flex-start' } : undefined}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
      <span className={`chk ${checked ? 'on' : ''}`} style={align ? { marginTop: 2 } : undefined}>
        {checked && <Icon n={I.check} size={12} color="#fff" sw={3} />}
      </span>
      {children}
    </label>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" className={`tgl ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

export function Stepper({ value, min = 0, max = 99, onChange, label }: { value: number; min?: number; max?: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="stepper">
      <button type="button" aria-label={t("Decrease {a}", { a: label })} disabled={value <= min} onClick={() => onChange(value - 1)}><Icon n={I.minus} /></button>
      <span aria-live="polite">{value}</span>
      <button type="button" aria-label={t("Increase {a}", { a: label })} disabled={value >= max} onClick={() => onChange(value + 1)}><Icon n={I.plus} /></button>
    </div>
  );
}

export function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <span className="seg">
      {options.map((o) => (
        <button type="button" key={String(o.value)} className={`row g4 ${o.value === value ? 'on' : ''}`} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </span>
  );
}

export function Steps({ labels, current }: { labels: string[]; current: number }) {
  return (
    <div className="steps" role="list" aria-label={t("Booking steps")}>
      {labels.map((label, i) => (
        <div key={label} className="row g8" role="listitem">
          {i > 0 && <div className={`step-line ${i <= current ? 'done' : ''}`} />}
          <div className={`step ${i < current ? 'done' : i === current ? 'cur' : ''}`}>
            <b>{i < current ? <Icon n={I.check} size={12} color="#fff" sw={3} /> : i + 1}</b>{t(label)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Lines({ items, bold }: { items: Line[]; bold?: boolean }) {
  return (
    <>
      {items.map((l) => (
        <div key={l.label} className={`row between ${bold ? 'b' : ''}`} style={{ gap: 16 }}>
          <span className={bold ? '' : 'muted'}>{t(l.label)}</span>
          <span className={bold ? 'b' : 'sb'} style={{ textAlign: 'right' }}>{l.value}</span>
        </div>
      ))}
    </>
  );
}

/** Календарь месяца. Состояния дней приходят с сервера; без них доступны все дни с сегодняшнего. */
export function Calendar({ month, onMonth, states, selected, range, onPick, today, plain, hideNav }: {
  month: string; onMonth?: (m: string) => void; states?: Record<string, DayState>; selected?: string;
  range?: [string | undefined, string | undefined]; onPick: (d: string) => void; today: string; plain?: boolean; hideNav?: 'prev' | 'next';
}) {
  const { lead, days } = monthDays(month);
  const title = fmtMonth(month);
  const [a, b] = range ?? [];
  return (
    <div className="col">
      <div className="row between" style={{ marginBottom: 12 }}>
        <h3 className="h3">{title}</h3>
        {onMonth && (
          <div className="row g4">
            <button type="button" className="btn btn-secondary btn-sm btn-icon" aria-label={t("Previous month")} disabled={month <= today.slice(0, 7)}
              style={hideNav === 'prev' ? { visibility: 'hidden' } : undefined} onClick={() => onMonth(addMonths(month, -1))}><Icon n={I.left} /></button>
            <button type="button" className="btn btn-secondary btn-sm btn-icon" aria-label={t("Next month")} disabled={month >= addMonths(today.slice(0, 7), 3)}
              style={hideNav === 'next' ? { visibility: 'hidden' } : undefined} onClick={() => onMonth(addMonths(month, 1))}><Icon n={I.right} /></button>
          </div>
        )}
      </div>
      <div className={`cal ${plain ? 'plain' : ''}`} role="group" aria-label={title}>
        {[t("Mo"), t("Tu"), t("We"), t("Th"), t("Fr"), t("Sa"), t("Su")].map((d) => <div key={d} className="dow">{d}</div>)}
        {Array.from({ length: lead }, (_, i) => <div key={`e${i}`} />)}
        {days.map((d) => {
          const state: DayState = states?.[d] ?? (d < today ? 'off' : 'av');
          const cls = d === a && b ? 'rs' : d === b ? 're' : a && b && d > a && d < b ? 'rng' : d === selected || d === a ? 'sel' : state;
          const disabled = state !== 'av' && !(range && state === 'full' && a && !b && d > a);
          return (
            <button
              type="button" key={d} className={`day ${cls} ${d === today ? 'today' : ''}`} disabled={disabled} aria-pressed={cls !== state}
              aria-label={`${fmtFull(d)}, ${state === 'av' ? t('available') : t('unavailable')}`}
              onClick={() => onPick(d)}
            >{toDate(d).getUTCDate()}</button>
          );
        })}
      </div>
    </div>
  );
}

export function Modal({ children, onClose, width = 400, label }: { children: ReactNode; onClose: () => void; width?: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus(); };
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label} className="card overlay col g16" style={{ width, padding: 24, outline: 0 }}>
        {children}
      </div>
    </div>
  );
}

/** Всплывающий слой под элементом; закрывается кликом снаружи и клавишей Escape. */
export function Popover({ open, onClose, children, style }: { open: boolean; onClose: () => void; children: ReactNode; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.parentElement?.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, onClose]);
  if (!open) return null;
  return <div ref={ref} className="pop" style={style}>{children}</div>;
}

export function Skeleton({ rows = 3, height = 40 }: { rows?: number; height?: number }) {
  return (
    <div className="col g12" aria-busy="true" aria-label={t("Loading")}>
      <div className="skel" style={{ height: 20, width: '40%' }} />
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skel" style={{ height, width: '100%' }} />)}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="col g12">
      <Banner kind="danger" title={t("Something went wrong")}>{error.message}</Banner>
      {onRetry && <div><button type="button" className="btn btn-primary" onClick={onRetry}><Icon n={I.refresh} color="#fff" />{' '}{t("Try again")}</button></div>}
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card col g12" style={{ padding: 40, alignItems: 'center', textAlign: 'center' }}>
      <span style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon n={icon} size={22} color="var(--ink-2)" />
      </span>
      <span className="h3">{title}</span>
      {children && <span className="muted">{children}</span>}
      {action}
    </div>
  );
}

export function Spinner({ size = 18, color = 'currentColor' }: { size?: number; color?: string }) {
  return <Icon n={I.refresh} size={size} color={color} sw={2} className="spin" />;
}

export interface Loaded<T> { data: T | undefined; error: Error | undefined; loading: boolean; reload: () => void; set: (v: T) => void }

/** Загрузка данных с состояниями «загрузка / ошибка / готово»; устаревшие ответы отбрасываются. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): Loaded<T> {
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setState((s) => ({ data: s.data, loading: true }));
    // Пока сервер запускается или связь пропала, запрос повторяется ещё до трёх раз.
    const attempt = (left: number) => fn().then(
      (data) => alive && setState({ data, loading: false }),
      (error: Error) => {
        if (!alive) return;
        const transient = error instanceof ApiErr && (error.status === 0 || error.code === 'server_unavailable');
        if (transient && left > 0) timer = setTimeout(() => void attempt(left - 1), 1500);
        else setState({ error, loading: false });
      },
    );
    void attempt(3);
    return () => { alive = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const set = useCallback((data: T) => setState({ data, loading: false }), []);
  return { data: state.data, error: state.error, loading: state.loading, reload, set };
}

/** Отправка формы: состояние занятости, общая ошибка и ошибки по полям с сервера. */
export function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiErr | null>(null);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof ApiErr ? e : new ApiErr(0, { message: (e as Error).message }));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run, clear: () => setError(null), fields: error?.fields ?? {} };
}

export const useUid = useId;

/** Аватар: фото пользователя или первая буква имени. */
export function Avatar({ user, size }: { user: { firstName: string; avatar: string | null }; size?: 'lg' | 'xl' }) {
  const cls = `avatar ${size ?? ''}`;
  return user.avatar
    ? <img className={cls} src={user.avatar} alt="" style={{ objectFit: 'cover' }} />
    : <span className={cls}>{user.firstName[0]?.toUpperCase()}</span>;
}
