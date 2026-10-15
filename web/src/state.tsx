// Глобальное состояние: текущий пользователь, всплывающие уведомления, истечение сессии, черновик брони.
import {
  createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Contact, Selection, User } from '../../shared/types.ts';
import { api, SESSION_EXPIRED } from './api.ts';
import { I, Icon, Modal } from './ui.tsx';
import { t } from './i18n.tsx';

interface Toast { id: number; title: string; body?: string; undo?: () => void }

interface AppState {
  user: User | null;
  ready: boolean;
  setUser: (u: User | null) => void;
  logout: () => Promise<void>;
  toast: (title: string, body?: string, undo?: () => void) => void;
  /** Сохранить или убрать место; гостя отправляет на вход. Возвращает новое состояние. */
  toggleSave: (slug: string, saved: boolean) => Promise<boolean>;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppProvider is missing');
  return v;
}

/** Адрес входа с возвратом на текущую страницу. */
export const loginUrl = (next: string) => `/login?next=${encodeURIComponent(next)}`;

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [expired, setExpired] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    api.me().then((r) => setUser(r.user)).catch(() => undefined).finally(() => setReady(true));
  }, []);

  useEffect(() => {
    const onExpired = () => { setUser((u) => { if (u) setExpired(true); return null; }); };
    window.addEventListener(SESSION_EXPIRED, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED, onExpired);
  }, []);

  const toast = useCallback((title: string, body?: string, undo?: () => void) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, title, body, undo }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  const logout = useCallback(async () => {
    const name = user?.firstName;
    await api.logout().catch(() => undefined);
    setUser(null);
    navigate('/');
    toast(t("You've been logged out"), name ? t('See you soon, {name}.', { name }) : undefined);
  }, [user, navigate, toast]);

  const toggleSave = useCallback(async (slug: string, saved: boolean) => {
    if (!user) {
      navigate(loginUrl(location.pathname + location.search));
      return saved;
    }
    await api.save(slug, !saved);
    if (!saved) toast(t('Saved'), t('Added to Saved places'));
    return !saved;
  }, [user, navigate, location, toast]);

  const value = useMemo(() => ({ user, ready, setUser, logout, toast, toggleSave }), [user, ready, logout, toast, toggleSave]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((item) => (
          <div key={item.id} className="card overlay row g12 toast" style={{ padding: '12px 16px', width: 360, borderLeft: '4px solid var(--success)' }}>
            <Icon n={I.check} size={18} color="var(--success)" />
            <div className="col grow">
              <span className="b">{item.title}</span>
              {item.body && <span className="sm muted">{item.body}</span>}
            </div>
            {item.undo && <button type="button" className="btn btn-subtle btn-sm" onClick={item.undo}>{t("Undo")}</button>}
          </div>
        ))}
      </div>
      {expired && (
        <Modal label={t("Session expired")} onClose={() => setExpired(false)}>
          <div className="row g12 start">
            <Icon n={I.clock} size={22} color="var(--warn)" />
            <div className="col">
              <span className="h3">{t("Session expired")}</span>
              <span className="sm muted">{t("For your security you were logged out after a period of inactivity. Anything you selected is saved.")}</span>
            </div>
          </div>
          <div className="row g8 end">
            <button type="button" className="btn btn-secondary" onClick={() => setExpired(false)}>{t("Close")}</button>
            <button type="button" className="btn btn-primary" onClick={() => { setExpired(false); navigate(loginUrl(location.pathname + location.search)); }}>{t("Log in again")}</button>
          </div>
        </Modal>
      )}
    </Ctx.Provider>
  );
}

// --- Черновик брони: живёт в sessionStorage, поэтому переживает вход в аккаунт и перезагрузку. ---

export interface Draft {
  date?: string;
  time?: string;
  endDate?: string;
  party: number;
  resource?: string;
  selection: Selection;
  contact?: Partial<Contact>;
  requests?: string;
}

const key = (slug: string) => `qw:draft:${slug}`;

export function readDraft(slug: string): Draft | null {
  try {
    const raw = sessionStorage.getItem(key(slug));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

export function writeDraft(slug: string, d: Draft) {
  try { sessionStorage.setItem(key(slug), JSON.stringify(d)); } catch { /* хранилище недоступно — черновик останется в памяти */ }
}

export function clearDraft(slug: string) {
  try { sessionStorage.removeItem(key(slug)); } catch { /* нечего очищать */ }
}

export function useDraft(slug: string, initial: () => Draft): [Draft, (patch: Partial<Draft>) => void] {
  const [draft, setDraft] = useState<Draft>(() => readDraft(slug) ?? initial());
  const update = useCallback((patch: Partial<Draft>) => {
    setDraft((d) => {
      const next = { ...d, ...patch };
      writeDraft(slug, next);
      return next;
    });
  }, [slug]);
  return [draft, update];
}

/** Сегодняшняя дата в часовом поясе площадок. */
export { nowInTz } from '../../shared/dates.ts';
