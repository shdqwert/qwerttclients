// Типизированный клиент API.
import { tMsg } from './i18n.tsx';
import type {
  ApiError, Availability, Booking, BookingInput, BusinessOverview, Category, DayState, Notification, PlaceDetail,
  SearchResult, Suggestion, User, UserSettings,
} from '../../shared/types.ts';

export class ApiErr extends Error {
  status: number;
  code: string;
  fields: Record<string, string>;
  retryAfter?: number;
  constructor(status: number, body: Partial<ApiError>) {
    super(tMsg(body.message ?? 'Something went wrong. Try again.'));
    this.status = status;
    this.code = body.error ?? 'error';
    this.fields = Object.fromEntries(Object.entries(body.fields ?? {}).map(([k, v]) => [k, tMsg(v)]));
    this.retryAfter = body.retryAfter;
  }
}

export const SESSION_EXPIRED = 'qw:session-expired';

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${url}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiErr(0, { error: 'network', message: 'Check your connection and try again.' });
  }
  // Ответ не от нашего API: прокси разработки не достучался до сервера (5xx)
  // или сайт выложен без сервера и вместо данных пришла HTML-страница.
  if (!res.headers.get('content-type')?.includes('json')) {
    throw new ApiErr(503, res.status >= 500
      ? { error: 'server_unavailable', message: 'The server is not responding. It may still be starting — try again in a few seconds.' }
      : { error: 'server_missing', message: 'The booking server is not running at this address. Only the pages were published, without the server.' });
  }
  const data: unknown = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) {
    const err = new ApiErr(res.status, (data ?? {}) as Partial<ApiError>);
    if (err.code === 'session_expired') window.dispatchEvent(new Event(SESSION_EXPIRED));
    throw err;
  }
  return data as T;
}

const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    u.set(k, v === true ? '1' : String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : '';
};

type UserRes = { user: User };
export interface Stats { upcoming: number; past: number; saved: number; unread: number }
export interface BusinessWeek {
  start: string;
  days: { date: string; bookings: number; guests: number; pending: number; revenue: number; items: { ref: string; time: string | null; name: string; party: number; status: string }[] }[];
}
export interface BusinessCustomer { email: string; name: string; phone: string; bookings: number; visits: number; upcoming: number; last: string; spent: number }
export interface Venue {
  slug: string; name: string; kind: string; about: string; phone: string; openUntil: string; policies: string; instant: boolean; cancelHours: number;
  items: { id: string; name: string; group: string; price: number }[];
  areas: { id: string; name: string; tables: number }[];
}
export interface BookingLists { upcoming: Booking[]; past: Booking[]; cancelled: Booking[] }

export const api = {
  me: () => req<{ user: User | null }>('GET', '/auth/me'),
  login: (email: string, password: string) => req<UserRes | { twoFactor: true; ticket: string }>('POST', '/auth/login', { email, password }),
  login2fa: (ticket: string, code: string) => req<UserRes>('POST', '/auth/login/2fa', { ticket, code }),
  signup: (b: { name: string; email: string; password: string; agree: boolean }) => req<UserRes>('POST', '/auth/signup', b),
  logout: () => req<{ ok: true }>('POST', '/auth/logout', {}),
  forgot: (email: string) => req<{ ok: true; expiresInMinutes: number; devLink?: string }>('POST', '/auth/forgot', { email }),
  reset: (token: string, password: string) => req<UserRes>('POST', '/auth/reset', { token, password }),

  categories: () => req<Category[]>('GET', '/categories'),
  neighbourhoods: () => req<{ name: string; count: number }[]>('GET', '/neighbourhoods'),
  suggest: (q: string) => req<Suggestion[]>('GET', `/suggest${qs({ q })}`),
  places: (p: Record<string, string | number | boolean | undefined | null>) => req<SearchResult>('GET', `/places${qs(p)}`),
  place: (slug: string) => req<PlaceDetail>('GET', `/places/${slug}`),
  availability: (slug: string, p: { date: string; endDate?: string; service?: string; duration?: number; exclude?: string }) =>
    req<Availability>('GET', `/places/${slug}/availability${qs(p)}`),
  calendar: (slug: string, p: { month: string; service?: string; duration?: number }) =>
    req<Record<string, DayState>>('GET', `/places/${slug}/calendar${qs(p)}`),
  review: (slug: string, b: { rating: number; text: string }) => req<{ ok: true }>('POST', `/places/${slug}/reviews`, b),

  book: (b: BookingInput & { agree: boolean }) => req<Booking>('POST', '/bookings', b),
  bookings: () => req<BookingLists>('GET', '/bookings'),
  booking: (ref: string, key?: string | null) => req<Booking>('GET', `/bookings/${ref}${qs({ key })}`),
  changeBooking: (ref: string, b: { date?: string; time?: string; party?: number }, key?: string | null) =>
    req<Booking>('PATCH', `/bookings/${ref}${qs({ key })}`, b),
  cancelBooking: (ref: string, key?: string | null) => req<Booking>('POST', `/bookings/${ref}/cancel${qs({ key })}`, {}),
  icsUrl: (ref: string, key?: string | null) => `/api/bookings/${ref}/calendar.ics${qs({ key })}`,

  updateMe: (b: { firstName: string; lastName: string; email: string; phone: string }) => req<UserRes>('PATCH', '/me', b),
  updateSettings: (b: Partial<UserSettings>) => req<UserRes>('PATCH', '/me/settings', b),
  changePassword: (current: string, password: string) => req<UserRes>('POST', '/me/password', { current, password }),
  revokeOthers: () => req<UserRes>('POST', '/me/sessions/revoke-others', {}),
  deleteMe: (password: string) => req<{ ok: true }>('DELETE', '/me', { password }),
  stats: () => req<Stats>('GET', '/me/stats'),
  saved: () => req<string[]>('GET', '/saved'),
  save: (slug: string, on: boolean) => req<{ saved: boolean }>(on ? 'PUT' : 'DELETE', `/saved/${slug}`, on ? {} : undefined),
  notifications: () => req<Notification[]>('GET', '/notifications'),
  markRead: (id?: number) => req<{ ok: true }>('POST', '/notifications/read', id ? { id } : {}),

  waitlist: (slug: string, date: string, email?: string) => req<{ ok: true }>('POST', '/waitlist', { slug, date, email }),
  contact: (b: { name: string; email: string; topic: string; message: string }) => req<{ ok: true }>('POST', '/contact', b),
  partner: (b: { business: string; category: string; contactName: string; email: string; phone: string; neighbourhood: string; message: string }) =>
    req<{ ok: true }>('POST', '/partners', b),
  setAvatar: (image: string) => req<UserRes>('PUT', '/me/avatar', { image }),
  removeAvatar: () => req<UserRes>('DELETE', '/me/avatar'),
  twoFactorSetup: () => req<{ secret: string; url: string; qr: string }>('POST', '/me/2fa/setup', {}),
  twoFactorEnable: (code: string) => req<UserRes>('POST', '/me/2fa/enable', { code }),
  twoFactorDisable: (password: string) => req<UserRes>('POST', '/me/2fa/disable', { password }),
  businessWeek: (start?: string) => req<BusinessWeek>('GET', `/business/week${qs({ start })}`),
  businessCustomers: () => req<BusinessCustomer[]>('GET', '/business/customers'),
  businessReviews: () => req<{ id: number; author: string; rating: number; text: string; createdAt: string }[]>('GET', '/business/reviews'),
  venue: () => req<Venue>('GET', '/business/venue'),
  updateVenue: (b: Partial<Omit<Venue, 'items' | 'areas' | 'slug' | 'name' | 'kind'>> & { prices?: Record<string, number>; tables?: Record<string, number> }) =>
    req<Venue>('PATCH', '/business/venue', b),
  business: (date?: string) => req<BusinessOverview>('GET', `/business/overview${qs({ date })}`),
  decide: (ref: string, accept: boolean) => req<{ ok: true }>('POST', `/business/bookings/${ref}/decision`, { accept }),
};
