// Сборка HTTP-приложения: контекст, единый формат ошибок, сессии, маршруты.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { openDb } from './db.ts';
import { type Config, COOKIE, type Ctx, HttpError, iso, sha256, token, type UserRow } from './lib.ts';
import { accountRoutes } from './routes/account.ts';
import { authRoutes } from './routes/auth.ts';
import { bookingRoutes } from './routes/bookings.ts';
import { businessRoutes } from './routes/business.ts';
import { catalogRoutes } from './routes/catalog.ts';
import { extraRoutes } from './routes/extra.ts';
import { applyOverride, placeBySlug, resetCatalog, type VenueOverride } from './catalog.ts';
import { seedDemo } from './seed.ts';

export function buildApp(cfg: Config): { app: FastifyInstance; ctx: Ctx } {
  const db = openDb(cfg.dbPath);
  // Каталог общий для процесса: возвращаем исходные данные и накладываем правки площадок из этой базы.
  resetCatalog();
  for (const row of db.prepare('SELECT place, data FROM place_overrides').all() as { place: string; data: string }[]) {
    const p = placeBySlug.get(row.place);
    if (p) applyOverride(p, JSON.parse(row.data) as VenueOverride);
  }
  const now = cfg.now ?? (() => new Date());
  const app = Fastify({ logger: cfg.production ? { level: 'info' } : false, trustProxy: cfg.production });

  const readSession = (req: FastifyRequest): { user: UserRow | null; expired: boolean } => {
    const raw = req.cookies[COOKIE];
    if (!raw) return { user: null, expired: false };
    const hash = sha256(raw);
    const row = db.prepare('SELECT user_id, last_seen_at FROM sessions WHERE token_hash = ?').get(hash) as { user_id: number; last_seen_at: string } | undefined;
    if (!row) return { user: null, expired: true };
    if (now().getTime() - Date.parse(row.last_seen_at) > cfg.sessionIdleMin * 60000) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash);
      return { user: null, expired: true };
    }
    db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').run(iso(now()), hash);
    return { user: db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id) as unknown as UserRow, expired: false };
  };

  const ctx: Ctx = {
    db,
    cfg,
    eng: { demoLoad: cfg.demoLoad, now },
    user: (req) => readSession(req).user,
    requireUser(req) {
      const s = readSession(req);
      if (s.user) return s.user;
      throw s.expired
        ? new HttpError(401, 'session_expired', 'Your session timed out. Log in again.')
        : new HttpError(401, 'unauthorized', 'Log in to continue.');
    },
    startSession(reply, userId) {
      const raw = token();
      db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)').run(sha256(raw), userId, iso(now()), iso(now()));
      reply.setCookie(COOKIE, raw, { path: '/', httpOnly: true, sameSite: 'lax', secure: cfg.production, maxAge: 60 * 60 * 24 * 30 });
    },
    endSession(req, reply) {
      const raw = req.cookies[COOKIE];
      if (raw) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(raw));
      reply.clearCookie(COOKIE, { path: '/' });
    },
  };

  app.register(cookie);

  // Защита от CSRF: изменяющие запросы принимаются только с того же origin.
  app.addHook('onRequest', async (req) => {
    if (req.method === 'GET' || req.method === 'HEAD') return;
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) {
      throw new HttpError(403, 'forbidden_origin', 'Request from another site was blocked.');
    }
  });

  app.setErrorHandler((err: unknown, _req, reply) => {
    if (err instanceof HttpError) {
      return reply.status(err.status).send({ error: err.code, message: err.message, ...err.extra });
    }
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode && e.statusCode < 500) {
      return reply.status(e.statusCode).send({ error: 'bad_request', message: e.message ?? 'Bad request' });
    }
    app.log.error(err);
    if (!cfg.production) console.error(err);
    return reply.status(500).send({ error: 'server_error', message: 'Something went wrong on our side. Try again.' });
  });

  app.register(async (api) => {
    authRoutes(api, ctx);
    catalogRoutes(api, ctx);
    bookingRoutes(api, ctx);
    accountRoutes(api, ctx);
    businessRoutes(api, ctx);
    extraRoutes(api, ctx);
    api.get('/health', async () => ({ ok: true }));
    api.setNotFoundHandler(() => { throw new HttpError(404, 'not_found', 'Not found.'); });
  }, { prefix: '/api' });

  // В production сервер сам отдаёт собранный фронтенд.
  const webDir = cfg.webDir ?? join(import.meta.dirname, '..', 'dist');
  if (existsSync(join(webDir, 'index.html'))) {
    app.register(fastifyStatic, { root: webDir });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api')) throw new HttpError(404, 'not_found', 'Not found.');
      return reply.sendFile('index.html');
    });
  }

  if (cfg.seedDemo) seedDemo(ctx);
  app.addHook('onClose', async () => db.close());
  return { app, ctx };
}
