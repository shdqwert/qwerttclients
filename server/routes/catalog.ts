// Каталог: категории, поиск с фильтрами, подсказки, страница места, доступность, отзывы.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { nowInTz } from '../../shared/dates.ts';
import type { Category, PlaceCard, PlaceDetail, Review, SearchResult, Suggestion } from '../../shared/types.ts';
import { type Ctx, HttpError, iso, parse, zDate, zTime } from '../lib.ts';
import { getAvailability, getCalendar, todaySlots } from '../availability.ts';
import { CATEGORIES, NEIGHBOURHOODS, PLACES, type PlaceDef, placeBySlug } from '../catalog.ts';
import { sweepCompleted } from '../core.ts';

const csv = z.string().optional().transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []));
const flag = z.enum(['0', '1']).optional().transform((v) => v === '1');

const searchSchema = z.object({
  category: z.string().optional(),
  q: z.string().trim().max(80).optional(),
  neighbourhood: z.string().optional(),
  date: zDate.optional(),
  time: zTime.optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  priceMin: z.coerce.number().min(0).optional(),
  priceMax: z.coerce.number().min(0).optional(),
  cuisine: csv,
  features: csv,
  freeCancel: flag,
  instant: flag,
  openAt: flag,
  deals: flag,
  sort: z.enum(['recommended', 'rating', 'price', 'distance']).default('recommended'),
  /** Координаты пользователя «lat,lng» для расстояний и сортировки «рядом со мной». */
  near: z.string().regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(5),
});

/** Расстояние по прямой между двумя точками, км. */
function km([a1, o1]: [number, number], [a2, o2]: [number, number]): number {
  const r = Math.PI / 180;
  const h = Math.sin(((a2 - a1) * r) / 2) ** 2 + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(((o2 - o1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** Центр Ташкента — точка отсчёта, если пользователь не поделился местоположением. */
const CENTRE: [number, number] = [41.3111, 69.2797];

export function catalogRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db, eng } = ctx;
  const today = () => nowInTz(eng.now()).date;

  const place = (slug: string): PlaceDef => {
    const p = placeBySlug.get(slug);
    if (!p) throw new HttpError(404, 'place_not_found', 'This place does not exist.');
    return p;
  };

  /** Рейтинг: исходные данные каталога плюс отзывы, оставленные пользователями сайта. */
  const rating = (p: PlaceDef) => {
    const r = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(rating), 0) AS s FROM reviews WHERE place = ? AND user_id IS NOT NULL').get(p.slug) as { n: number; s: number };
    const reviews = p.reviews + r.n;
    return { reviews, rating: Math.round(((p.rating * p.reviews + r.s) / reviews) * 10) / 10 };
  };

  const savedSet = (userId: number | undefined) => new Set(
    userId ? (db.prepare('SELECT place FROM saved WHERE user_id = ?').all(userId) as { place: string }[]).map((r) => r.place) : [],
  );

  const card = (p: PlaceDef, saved: Set<string>, date: string, around?: string, near?: [number, number]): PlaceCard => ({
    slug: p.slug, name: p.name, category: p.category, kind: p.kind, subtitle: p.subtitle, cuisine: p.cuisine, address: p.address,
    neighbourhood: p.neighbourhood, ...rating(p), priceFrom: p.priceFrom, priceUnit: p.priceUnit, color: p.color, icon: p.icon,
    art: p.art, badge: p.badge, deal: p.deal, tags: p.tags, instant: p.instant, freeCancel: p.cancelHours > 0, x: p.x, y: p.y,
    lat: p.lat, lng: p.lng, distanceKm: near ? Math.round(km(near, [p.lat, p.lng]) * 10) / 10 : null,
    saved: saved.has(p.slug), slots: todaySlots(db, p, date, eng, 3, around),
  });

  app.get('/categories', async (): Promise<Category[]> => CATEGORIES.map((c) => ({
    ...c, count: PLACES.filter((p) => p.category === c.id).length,
  })));

  app.get('/neighbourhoods', async () => NEIGHBOURHOODS
    .map((name) => ({ name, count: PLACES.filter((p) => p.neighbourhood === name).length }))
    .filter((n) => n.count > 0));

  app.get('/suggest', async (req): Promise<Suggestion[]> => {
    const { q } = parse(z.object({ q: z.string().trim().max(80).default('') }), req.query);
    const needle = q.toLowerCase();
    const hoods: Suggestion[] = NEIGHBOURHOODS
      .filter((n) => !needle || n.toLowerCase().includes(needle))
      .map((n) => ({ type: 'neighbourhood', title: `${n}, Tashkent`, note: `Neighbourhood · ${PLACES.filter((p) => p.neighbourhood === n).length} places`, icon: 'i14' }));
    const places: Suggestion[] = needle
      ? PLACES.filter((p) => p.name.toLowerCase().includes(needle) || p.subtitle.toLowerCase().includes(needle))
        .map((p) => ({ type: 'place', title: p.name, note: p.subtitle.split(' · ').reverse().join(' · '), icon: p.icon, slug: p.slug }))
      : [];
    return [...hoods.slice(0, needle ? 2 : 6), ...places.slice(0, 5)];
  });

  app.get('/places', async (req): Promise<SearchResult> => {
    const f = parse(searchSchema, req.query);
    const date = f.date && f.date >= today() ? f.date : today();
    const needle = f.q?.toLowerCase();
    const base = PLACES.filter((p) => (!f.category || p.category === f.category)
      && (!f.neighbourhood || p.neighbourhood === f.neighbourhood)
      && (!needle || [p.name, p.subtitle, p.neighbourhood, p.address, p.cuisine ?? ''].some((s) => s.toLowerCase().includes(needle))));

    const count = (pred: (p: PlaceDef) => boolean) => base.filter(pred).length;
    const names = (pick: (p: PlaceDef) => string[]) => [...new Set(base.flatMap(pick))].sort();
    const prices = base.map((p) => p.priceFrom);
    const facets: SearchResult['facets'] = {
      cuisines: names((p) => (p.cuisine ? [p.cuisine] : [])).map((name) => ({ name, count: count((p) => p.cuisine === name) })),
      features: names((p) => p.tags).map((name) => ({ name, count: count((p) => p.tags.includes(name)) })),
      freeCancel: count((p) => p.cancelHours > 0),
      instant: count((p) => p.instant),
      priceMin: prices.length ? Math.min(...prices) : 0,
      priceMax: prices.length ? Math.max(...prices) : 0,
    };

    const saved = savedSet(ctx.user(req)?.id);
    const near = f.near ? (f.near.split(',').map(Number) as [number, number]) : undefined;
    let items = base
      .filter((p) => (f.priceMin == null || p.priceFrom >= f.priceMin) && (f.priceMax == null || p.priceFrom <= f.priceMax)
        && (!f.cuisine.length || (p.cuisine != null && f.cuisine.includes(p.cuisine)))
        && f.features.every((t) => p.tags.includes(t))
        && (!f.freeCancel || p.cancelHours > 0) && (!f.instant || p.instant) && (!f.deals || p.deal != null))
      .map((p) => card(p, saved, date, f.time, near))
      .filter((c) => f.minRating == null || c.rating >= f.minRating);

    if (f.openAt) {
      items = items.filter((c) => {
        const p = placeBySlug.get(c.slug)!;
        const a = getAvailability(db, p, date, {}, eng);
        if (p.kind === 'hotel' || p.kind === 'event' || !f.time) return a.resources.some((r) => Object.values(r.left).some((n) => n > 0));
        return a.resources.some((r) => (r.left[f.time!] ?? 0) > 0);
      });
    }

    const dist = (c: PlaceCard) => km(near ?? CENTRE, [c.lat, c.lng]);
    const score = (c: PlaceCard) => c.rating * Math.log10(c.reviews + 10) + (c.badge ? 0.5 : 0);
    items.sort({
      recommended: (a: PlaceCard, b: PlaceCard) => score(b) - score(a),
      rating: (a: PlaceCard, b: PlaceCard) => b.rating - a.rating || b.reviews - a.reviews,
      price: (a: PlaceCard, b: PlaceCard) => a.priceFrom - b.priceFrom,
      distance: (a: PlaceCard, b: PlaceCard) => dist(a) - dist(b),
    }[f.sort]);

    const pages = Math.max(1, Math.ceil(items.length / f.perPage));
    const page = Math.min(f.page, pages);
    return { items: items.slice((page - 1) * f.perPage, page * f.perPage), total: items.length, page, pages, facets };
  });

  app.get('/places/:slug', async (req): Promise<PlaceDetail> => {
    const p = place((req.params as { slug: string }).slug);
    const user = ctx.user(req);
    sweepCompleted(ctx);
    const date = today();
    const r = rating(p);
    const reviewList = (db.prepare('SELECT id, author, rating, text, created_at FROM reviews WHERE place = ? ORDER BY created_at DESC LIMIT 20').all(p.slug) as
      { id: number; author: string; rating: number; text: string; created_at: string }[])
      .map((x): Review => ({ id: x.id, author: x.author, rating: x.rating, text: x.text, date: x.created_at.slice(0, 10) }));
    // Распределение оценок: оценка по среднему рейтингу каталога.
    const p5 = Math.min(0.95, 0.82 * ((r.rating - 3) / 1.8) ** 2);
    const rest = 1 - p5;
    const ratingBars = [p5, rest * 0.65, rest * 0.22, rest * 0.07, rest * 0.06].map((v) => Math.round(v * 100));
    const bookedToday = (db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE place = ? AND created_at >= ? AND status != 'cancelled'")
      .get(p.slug, `${iso(eng.now()).slice(0, 10)}T00:00:00.000Z`) as { n: number }).n;
    const canReview = !!user
      && !!db.prepare("SELECT 1 FROM bookings WHERE user_id = ? AND place = ? AND status = 'completed'").get(user.id, p.slug)
      && !db.prepare('SELECT 1 FROM reviews WHERE user_id = ? AND place = ?').get(user.id, p.slug);
    return {
      ...card(p, savedSet(user?.id), date, undefined), about: p.about, priceLevel: p.priceLevel, openUntil: p.openUntil, phone: p.phone,
      amenities: p.amenities, highlightsTitle: p.highlightsTitle, highlights: p.highlights, policies: p.policies,
      cancelHours: p.cancelHours, gallery: p.gallery, config: p.config, reviewList, ratingBars, bookedToday, canReview,
    };
  });

  const availQuery = z.object({
    date: zDate, endDate: zDate.optional(), service: z.string().optional(),
    duration: z.coerce.number().int().positive().optional(), exclude: z.string().optional(),
  });

  app.get('/places/:slug/availability', async (req) => {
    const p = place((req.params as { slug: string }).slug);
    const q = parse(availQuery, req.query);
    return getAvailability(db, p, q.date, { service: q.service, duration: q.duration, endDate: q.endDate, excludeRef: q.exclude }, eng);
  });

  app.get('/places/:slug/calendar', async (req) => {
    const p = place((req.params as { slug: string }).slug);
    const q = parse(z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/), service: z.string().optional(), duration: z.coerce.number().int().positive().optional(),
    }), req.query);
    return getCalendar(db, p, q.month, { service: q.service, duration: q.duration }, eng);
  });

  app.post('/places/:slug/reviews', async (req, reply) => {
    const p = place((req.params as { slug: string }).slug);
    const user = ctx.requireUser(req);
    const body = parse(z.object({
      rating: z.number().min(1).max(5),
      text: z.string().trim().min(10, 'Write at least a sentence').max(1000),
    }), req.body);
    sweepCompleted(ctx);
    if (!db.prepare("SELECT 1 FROM bookings WHERE user_id = ? AND place = ? AND status = 'completed'").get(user.id, p.slug)) {
      throw new HttpError(403, 'review_not_allowed', 'Only guests who booked and visited can review.');
    }
    if (db.prepare('SELECT 1 FROM reviews WHERE user_id = ? AND place = ?').get(user.id, p.slug)) {
      throw new HttpError(409, 'review_exists', 'You have already reviewed this place.');
    }
    const author = `${user.first_name} ${user.last_name ? `${user.last_name[0]}.` : ''}`.trim();
    db.prepare('INSERT INTO reviews (place, user_id, author, rating, text, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(p.slug, user.id, author, body.rating, body.text, iso(eng.now()));
    return reply.status(201).send({ ok: true });
  });
}
