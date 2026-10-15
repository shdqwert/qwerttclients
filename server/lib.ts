// Общие для сервера типы и помощники: контекст, ошибки, пароли, проверка входных данных.
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z, type ZodType } from 'zod';
import type { User, UserSettings } from '../shared/types.ts';
import type { Engine } from './availability.ts';
import type { Db } from './db.ts';

export interface Config {
  dbPath: string;
  /** Через сколько минут бездействия сессия истекает. */
  sessionIdleMin: number;
  demoLoad: boolean;
  seedDemo: boolean;
  production: boolean;
  now?: () => Date;
  webDir?: string;
}

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  phone: string;
  role: 'user' | 'business';
  business_place: string | null;
  settings: string;
  created_at: string;
  password_changed_at: string;
  avatar: string | null;
  totp_secret: string | null;
  totp_pending: string | null;
  totp_enabled: number;
}

export interface Ctx {
  db: Db;
  eng: Engine;
  cfg: Config;
  /** Пользователь по cookie сессии либо null. */
  user(req: FastifyRequest): UserRow | null;
  /** То же, но с ошибкой 401, если входа нет или сессия истекла. */
  requireUser(req: FastifyRequest): UserRow;
  startSession(reply: FastifyReply, userId: number): void;
  endSession(req: FastifyRequest, reply: FastifyReply): void;
}

export class HttpError extends Error {
  status: number;
  code: string;
  extra: Record<string, unknown>;
  constructor(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const COOKIE = 'qw_sid';
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const token = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const iso = (d: Date) => d.toISOString();

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [, salt, hash] = stored.split('$');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, Buffer.from(salt, 'hex'), expected.length);
  return timingSafeEqual(expected, actual);
}

export const DEFAULT_SETTINGS: UserSettings = {
  notifyUpdates: true, notifyReminders: true, notifyOffers: false, language: 'en', currency: 'USD',
};

export function userDto(db: Db, u: UserRow): User {
  const sessions = (db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?').get(u.id) as { n: number }).n;
  return {
    id: u.id, email: u.email, firstName: u.first_name, lastName: u.last_name, phone: u.phone, role: u.role,
    businessPlace: u.business_place, createdAt: u.created_at, passwordChangedAt: u.password_changed_at,
    settings: normalizeSettings(JSON.parse(u.settings) as Partial<UserSettings>), sessions,
    avatar: u.avatar, twoFactor: !!u.totp_enabled,
  };
}

/** Старые записи хранили язык и валюту названиями: приводим к кодам. */
export function normalizeSettings(s: Partial<UserSettings>): UserSettings {
  const out = { ...DEFAULT_SETTINGS, ...s };
  if (!['en', 'ru', 'uz'].includes(out.language)) out.language = 'en';
  out.currency = 'USD';
  return out;
}

/** Разбор тела запроса по схеме; ошибки возвращаются по полям. */
export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  const fields: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  throw new HttpError(400, 'validation', Object.values(fields)[0] ?? 'Check the form', { fields });
}

export const zEmail = z.string().trim().toLowerCase().regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'Enter a valid email, like name@mail.com');
export const zPassword = z.string().min(8, 'Use at least 8 characters').max(200).regex(/\d/, 'Add at least one number');
export const zPhone = z.string().trim().refine((v) => {
  const digits = v.replace(/\D/g, '');
  return v.replace(/\s/g, '').startsWith('+998') ? digits.length === 12 : digits.length >= 7 && digits.length <= 15;
}, 'Enter the full number, 9 digits after +998');
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date');
export const zTime = z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time');

/** Уведомление хранит английский текст и структурированные данные, по которым фронтенд строит текст на языке пользователя. */
export function notify(db: Db, userId: number | null, type: string, grp: 'bookings' | 'offers', title: string, body: string, link: string | null, at = new Date(), data: Record<string, unknown> | null = null) {
  if (userId == null) return;
  db.prepare('INSERT INTO notifications (user_id, type, grp, title, body, link, created_at, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(userId, type, grp, title, body, link, iso(at), data ? JSON.stringify(data) : null);
}
