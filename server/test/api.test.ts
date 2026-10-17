// Интеграционные тесты API на базе в памяти, без демо-загрузки, с управляемыми часами.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { addDays } from '../../shared/dates.ts';
import type { Availability, Booking } from '../../shared/types.ts';
import { buildApp } from '../app.ts';

// «Сейчас» — 6 октября 2026, 10:00 по Ташкенту.
const START = new Date('2026-10-06T10:00:00+05:00');
const TODAY = '2026-10-06';

function setup() {
  const clock = { now: START };
  const { app } = buildApp({ dbPath: ':memory:', sessionIdleMin: 30, demoLoad: false, seedDemo: false, production: false, now: () => clock.now });
  return { app, clock };
}

interface Res<T> { status: number; body: T; cookie: string | undefined }

async function call<T = any>(app: FastifyInstance, method: string, url: string, body?: unknown, cookie?: string, headers: Record<string, string> = {}): Promise<Res<T>> {
  const res = await app.inject({
    method: method as 'GET', url: `/api${url}`, payload: body as object | undefined,
    headers: { ...(cookie ? { cookie } : {}), ...headers },
  });
  const set = res.cookies.find((c) => c.name === 'qw_sid');
  return { status: res.statusCode, body: (res.headers['content-type']?.toString().includes('json') ? res.json() : res.body) as T, cookie: set ? `qw_sid=${set.value}` : undefined };
}

const contact = { firstName: 'Marina', lastName: 'Karimova', phone: '+998 90 123 45 67', email: 'marina@mail.com' };
const base = { party: 2, selection: {}, contact, remind: true, agree: true };

async function signup(app: FastifyInstance, email = 'marina@mail.com') {
  const r = await call(app, 'POST', '/auth/signup', { name: 'Marina Karimova', email, password: 'Sunrise2026', agree: true });
  assert.equal(r.status, 201);
  return r.cookie!;
}

test('signup, session, logout and duplicate email', async () => {
  const { app } = setup();
  const cookie = await signup(app);
  const me = await call(app, 'GET', '/auth/me', undefined, cookie);
  assert.equal(me.body.user.firstName, 'Marina');
  assert.equal(me.body.user.lastName, 'Karimova');

  const dup = await call(app, 'POST', '/auth/signup', { name: 'Other Person', email: 'MARINA@mail.com', password: 'Sunrise2026', agree: true });
  assert.equal(dup.status, 409);
  assert.match(dup.body.fields.email, /already exists/);

  await call(app, 'POST', '/auth/logout', {}, cookie);
  assert.equal((await call(app, 'GET', '/auth/me', undefined, cookie)).body.user, null);
  await app.close();
});

test('signup validates email and password', async () => {
  const { app } = setup();
  const r = await call(app, 'POST', '/auth/signup', { name: 'Marina', email: 'marina@mail', password: 'short', agree: true });
  assert.equal(r.status, 400);
  assert.ok(r.body.fields.email && r.body.fields.password);
  await app.close();
});

test('wrong credentials and rate limit after five attempts', async () => {
  const { app, clock } = setup();
  await signup(app);
  for (let i = 0; i < 5; i++) {
    const r = await call(app, 'POST', '/auth/login', { email: 'marina@mail.com', password: 'wrong-pass1' });
    assert.equal(r.status, 401);
    assert.equal(r.body.error, 'bad_credentials');
  }
  const locked = await call(app, 'POST', '/auth/login', { email: 'marina@mail.com', password: 'Sunrise2026' });
  assert.equal(locked.status, 429);
  assert.equal(locked.body.retryAfter, 10);
  clock.now = new Date(START.getTime() + 11 * 60000);
  assert.equal((await call(app, 'POST', '/auth/login', { email: 'marina@mail.com', password: 'Sunrise2026' })).status, 200);
  await app.close();
});

test('session expires after idle timeout', async () => {
  const { app, clock } = setup();
  const cookie = await signup(app);
  clock.now = new Date(START.getTime() + 20 * 60000);
  assert.equal((await call(app, 'GET', '/bookings', undefined, cookie)).status, 200);
  clock.now = new Date(START.getTime() + 51 * 60000);
  const r = await call(app, 'GET', '/bookings', undefined, cookie);
  assert.equal(r.status, 401);
  assert.equal(r.body.error, 'session_expired');
  await app.close();
});

test('password reset replaces the password and old link stops working', async () => {
  const { app } = setup();
  await signup(app);
  const forgot = await call(app, 'POST', '/auth/forgot', { email: 'marina@mail.com' });
  const resetToken = new URLSearchParams(forgot.body.devLink.split('?')[1]).get('token');
  assert.equal((await call(app, 'POST', '/auth/reset', { token: resetToken, password: 'NewPass2027' })).status, 200);
  assert.equal((await call(app, 'POST', '/auth/reset', { token: resetToken, password: 'Another2028' })).status, 400);
  assert.equal((await call(app, 'POST', '/auth/login', { email: 'marina@mail.com', password: 'Sunrise2026' })).status, 401);
  assert.equal((await call(app, 'POST', '/auth/login', { email: 'marina@mail.com', password: 'NewPass2027' })).status, 200);
  // Для неизвестного адреса ответ такой же, но без ссылки.
  const unknown = await call(app, 'POST', '/auth/forgot', { email: 'nobody@mail.com' });
  assert.equal(unknown.status, 200);
  assert.equal(unknown.body.devLink, undefined);
  await app.close();
});

test('requests from another origin are rejected', async () => {
  const { app } = setup();
  const r = await call(app, 'POST', '/auth/login', { email: 'a@b.co', password: 'x' }, undefined, { origin: 'https://evil.example', host: 'localhost:4000' });
  assert.equal(r.status, 403);
  await app.close();
});

test('restaurant: availability, booking and conflict when the area is full', async () => {
  const { app } = setup();
  const before = await call<Availability>(app, 'GET', `/places/amber/availability?date=${TODAY}`);
  const bar = before.body.resources.find((r) => r.id === 'bar')!;
  assert.equal(bar.left['19:00'], 3);
  // Сегодня в 10:00 утренние слоты ещё впереди, а вчерашняя дата закрыта.
  assert.equal(bar.left['12:00'], 3);
  const input = { ...base, slug: 'amber', date: TODAY, time: '19:00', resource: 'bar' };
  for (let i = 0; i < 3; i++) assert.equal((await call(app, 'POST', '/bookings', input)).status, 201);
  const full = await call(app, 'POST', '/bookings', input);
  assert.equal(full.status, 409);
  assert.equal(full.body.error, 'slot_taken');
  const after = await call<Availability>(app, 'GET', `/places/amber/availability?date=${TODAY}`);
  assert.equal(after.body.resources.find((r) => r.id === 'bar')!.left['19:00'], 0);
  assert.equal(after.body.resources.find((r) => r.id === 'terrace')!.left['19:00'], 6);
  await app.close();
});

test('past slots and past dates cannot be booked', async () => {
  const { app, clock } = setup();
  clock.now = new Date('2026-10-06T18:45:00+05:00');
  const a = await call<Availability>(app, 'GET', `/places/amber/availability?date=${TODAY}`);
  assert.equal(a.body.resources[0]!.left['19:00'], 0, 'меньше 30 минут до начала');
  assert.ok(a.body.resources[0]!.left['19:30']! > 0);
  const late = await call(app, 'POST', '/bookings', { ...base, slug: 'amber', date: TODAY, time: '19:00', resource: 'terrace' });
  assert.equal(late.status, 409);
  const past = await call(app, 'POST', '/bookings', { ...base, slug: 'amber', date: '2026-10-05', time: '19:00', resource: 'terrace' });
  assert.equal(past.status, 400);
  await app.close();
});

test('salon: overlapping time is blocked, "any specialist" picks a free one', async () => {
  const { app } = setup();
  const date = addDays(TODAY, 1);
  const input = { ...base, party: 1, slug: 'studio-noir', date, time: '14:30', selection: { service: 'haircut-beard', specialist: 'dmitry' } };
  const first = await call<Booking>(app, 'POST', '/bookings', input);
  assert.equal(first.status, 201);
  assert.equal(first.body.endTime, '15:20');
  assert.equal(first.body.total, 20);
  // 15:00 пересекается с 14:30–15:20 у того же мастера.
  assert.equal((await call(app, 'POST', '/bookings', { ...input, time: '15:00' })).status, 409);
  const any = await call<Booking>(app, 'POST', '/bookings', { ...input, time: '15:00', selection: { service: 'haircut-beard', specialist: 'any' } });
  assert.equal(any.status, 201);
  assert.notEqual(any.body.resource, 'dmitry');
  const a = await call<Availability>(app, 'GET', `/places/studio-noir/availability?date=${date}&service=haircut-beard`);
  const dmitry = a.body.resources.find((r) => r.id === 'dmitry')!;
  assert.equal(dmitry.left['14:00'], 0);
  assert.equal(dmitry.left['15:30'], 1);
  await app.close();
});

test('hotel: price matches the design example and inventory is respected', async () => {
  const { app } = setup();
  const input = {
    ...base, slug: 'merion-hotel', date: '2026-10-12', endDate: '2026-10-15',
    selection: { room: 'family', rate: 'flex', extras: [], adults: 2, children: 0, rooms: 1 },
  };
  const deluxe = await call<Booking>(app, 'POST', '/bookings', { ...input, selection: { ...input.selection, room: 'deluxe', extras: ['breakfast'] } });
  assert.equal(deluxe.status, 201);
  assert.equal(deluxe.body.total, 388);
  assert.equal(deluxe.body.status, 'pending');
  assert.deepEqual(deluxe.body.priceLines.map((l) => l.value), ['3 nights', '$312', '$54', '$22']);
  // Семейных номеров два: третья бронь на пересекающиеся даты не проходит.
  assert.equal((await call(app, 'POST', '/bookings', input)).status, 201);
  assert.equal((await call(app, 'POST', '/bookings', { ...input, date: '2026-10-14', endDate: '2026-10-17' })).status, 201);
  assert.equal((await call(app, 'POST', '/bookings', { ...input, date: '2026-10-13', endDate: '2026-10-16' })).status, 409);
  // День выезда свободен для нового заезда.
  assert.equal((await call(app, 'POST', '/bookings', { ...input, date: '2026-10-17', endDate: '2026-10-19' })).status, 201);
  const short = await call(app, 'POST', '/bookings', { ...input, date: '2026-10-20', endDate: '2026-10-21' });
  assert.equal(short.status, 400);
  await app.close();
});

test('sport: duration blocks the following hours', async () => {
  const { app } = setup();
  const input = { ...base, slug: 'riverside-sports-club', date: TODAY, time: '17:00', resource: 'court-1', selection: { duration: 90 } };
  const b = await call<Booking>(app, 'POST', '/bookings', input);
  assert.equal(b.body.total, 22.5);
  assert.equal(b.body.endTime, '18:30');
  assert.equal((await call(app, 'POST', '/bookings', { ...input, time: '18:00', selection: { duration: 60 } })).status, 409);
  assert.equal((await call(app, 'POST', '/bookings', { ...input, time: '19:00', selection: { duration: 60 } })).status, 201);
  await app.close();
});

test('event: ticket limit and totals', async () => {
  const { app } = setup();
  const sessions = await call<Availability>(app, 'GET', `/places/blue-room-jazz-night/availability?date=${TODAY}`);
  const date = sessions.body.resources[0]!.id;
  assert.equal(date, '2026-10-09');
  const input = { ...base, slug: 'blue-room-jazz-night', date, selection: { tickets: { standard: 2 } } };
  const ok = await call<Booking>(app, 'POST', '/bookings', input);
  assert.equal(ok.status, 201);
  assert.equal(ok.body.total, 26);
  assert.equal((await call(app, 'POST', '/bookings', { ...input, selection: { tickets: { standard: 7 } } })).status, 400);
  assert.equal((await call(app, 'POST', '/bookings', { ...input, date: '2026-10-07' })).status, 400);
  await app.close();
});

test('booking access: owner, guest key, strangers; change and cancel', async () => {
  const { app } = setup();
  const cookie = await signup(app);
  const stranger = await signup(app, 'other@mail.com');
  const input = { ...base, slug: 'amber', date: TODAY, time: '19:00', resource: 'terrace' };
  const mine = (await call<Booking>(app, 'POST', '/bookings', input, cookie)).body;
  const guest = (await call<Booking>(app, 'POST', '/bookings', { ...input, contact: { ...contact, email: 'guest@mail.com' } })).body;

  assert.equal((await call(app, 'GET', `/bookings/${mine.ref}`, undefined, cookie)).status, 200);
  assert.equal((await call(app, 'GET', `/bookings/${mine.ref}`, undefined, stranger)).status, 404);
  assert.equal((await call(app, 'GET', `/bookings/${guest.ref}`)).status, 404);
  assert.equal((await call(app, 'GET', `/bookings/${guest.ref}?key=${guest.key}`)).status, 200);

  const list = await call(app, 'GET', '/bookings', undefined, cookie);
  assert.equal(list.body.upcoming.length, 1);

  const moved = await call<Booking>(app, 'PATCH', `/bookings/${mine.ref}`, { time: '20:30', party: 4 }, cookie);
  assert.equal(moved.body.time, '20:30');
  assert.equal(moved.body.party, 4);

  const ics = await call<string>(app, 'GET', `/bookings/${mine.ref}/calendar.ics`, undefined, cookie);
  assert.match(ics.body, /DTSTART:20261006T153000Z/);

  const cancelled = await call<Booking>(app, 'POST', `/bookings/${mine.ref}/cancel`, {}, cookie);
  assert.equal(cancelled.body.status, 'cancelled');
  assert.equal((await call(app, 'POST', `/bookings/${mine.ref}/cancel`, {}, cookie)).status, 409);
  const a = await call<Availability>(app, 'GET', `/places/amber/availability?date=${TODAY}`);
  assert.equal(a.body.resources.find((r) => r.id === 'terrace')!.left['20:30'], 6);

  // Гостевая бронь привязывается к аккаунту при регистрации на тот же email.
  const late = await signup(app, 'guest@mail.com');
  assert.equal((await call(app, 'GET', '/bookings', undefined, late)).body.upcoming.length, 1);
  await app.close();
});

test('booking validates contact details', async () => {
  const { app } = setup();
  const r = await call(app, 'POST', '/bookings', { ...base, slug: 'amber', date: TODAY, time: '19:00', resource: 'terrace', contact: { ...contact, phone: '+998 90 12' } });
  assert.equal(r.status, 400);
  assert.match(r.body.fields['contact.phone'], /9 digits after \+998/);
  await app.close();
});

test('search filters, facets and saved places', async () => {
  const { app } = setup();
  const cookie = await signup(app);
  const all = await call(app, 'GET', '/places?category=restaurants&perPage=50');
  assert.equal(all.body.total, 5);
  assert.ok(all.body.facets.cuisines.some((c: { name: string; count: number }) => c.name === 'Italian' && c.count === 2));
  const italian = await call(app, 'GET', '/places?category=restaurants&cuisine=Italian&features=Live%20music');
  assert.deepEqual(italian.body.items.map((p: { slug: string }) => p.slug), ['amber']);
  const cheap = await call(app, 'GET', '/places?category=restaurants&sort=price&perPage=2&page=2');
  assert.equal(cheap.body.pages, 3);
  assert.equal(cheap.body.items[0].slug, 'tavola');
  assert.equal((await call(app, 'GET', '/places?q=amb')).body.total, 3);

  assert.equal((await call(app, 'PUT', '/saved/amber', {})).status, 401);
  await call(app, 'PUT', '/saved/amber', {}, cookie);
  assert.deepEqual((await call(app, 'GET', '/saved', undefined, cookie)).body, ['amber']);
  assert.equal((await call(app, 'GET', '/places/amber', undefined, cookie)).body.saved, true);
  await call(app, 'DELETE', '/saved/amber', undefined, cookie);
  assert.deepEqual((await call(app, 'GET', '/saved', undefined, cookie)).body, []);
  await app.close();
});

test('reviews are only for guests whose visit is completed', async () => {
  const { app, clock } = setup();
  const cookie = await signup(app);
  const review = { rating: 5, text: 'Lovely terrace and quick service.' };
  assert.equal((await call(app, 'POST', '/places/amber/reviews', review, cookie)).status, 403);
  await call(app, 'POST', '/bookings', { ...base, slug: 'amber', date: TODAY, time: '19:00', resource: 'terrace' }, cookie);
  clock.now = new Date('2026-10-07T09:00:00+05:00');
  const fresh = (await call(app, 'POST', '/auth/login', { email: 'marina@mail.com', password: 'Sunrise2026' })).cookie!;
  assert.equal((await call(app, 'GET', '/places/amber', undefined, fresh)).body.canReview, true);
  assert.equal((await call(app, 'POST', '/places/amber/reviews', review, fresh)).status, 201);
  assert.equal((await call(app, 'POST', '/places/amber/reviews', review, fresh)).status, 409);
  const place = (await call(app, 'GET', '/places/amber')).body;
  assert.equal(place.reviews, 341);
  assert.equal(place.reviewList[0].author, 'Marina K.');
  await app.close();
});

test('demo seed and business dashboard', async () => {
  const clock = { now: START };
  const { app } = buildApp({ dbPath: ':memory:', sessionIdleMin: 30, demoLoad: true, seedDemo: true, production: false, now: () => clock.now });
  const user = (await call(app, 'POST', '/auth/login', { email: 'marina@mail.com', password: 'Sunrise2026' })).cookie!;
  const list = (await call(app, 'GET', '/bookings', undefined, user)).body;
  assert.equal(list.upcoming.length, 3);
  assert.equal(list.past.length, 1);
  assert.equal((await call(app, 'GET', '/business/overview', undefined, user)).status, 403);

  const owner = (await call(app, 'POST', '/auth/login', { email: 'owner@amber.example', password: 'Amber2026' })).cookie!;
  const overview = (await call(app, 'GET', '/business/overview', undefined, owner)).body;
  assert.equal(overview.stats.bookings, 5);
  assert.equal(overview.pending.length, 2);
  const ref = overview.pending[0].ref;
  assert.equal((await call(app, 'POST', `/business/bookings/${ref}/decision`, { accept: true }, owner)).status, 200);
  assert.equal((await call(app, 'GET', '/business/overview', undefined, owner)).body.pending.length, 1);
  await app.close();
});

test('two-step verification: setup, login with code, disable', async () => {
  const { app } = setup();
  const cookie = await signup(app);
  const { codeAt } = await import('../totp.ts');
  const s = await call(app, 'POST', '/me/2fa/setup', {}, cookie);
  assert.match(s.body.qr, /<svg/);
  assert.equal((await call(app, 'POST', '/me/2fa/enable', { code: '000000' }, cookie)).status, 400);
  const on = await call(app, 'POST', '/me/2fa/enable', { code: codeAt(s.body.secret, START.getTime()) }, cookie);
  assert.equal(on.body.user.twoFactor, true);

  const step1 = await call(app, 'POST', '/auth/login', { email: 'marina@mail.com', password: 'Sunrise2026' });
  assert.equal(step1.body.twoFactor, true);
  assert.equal(step1.cookie, undefined);
  assert.equal((await call(app, 'POST', '/auth/login/2fa', { ticket: step1.body.ticket, code: '123456' })).status, 400);
  const step2 = await call(app, 'POST', '/auth/login/2fa', { ticket: step1.body.ticket, code: codeAt(s.body.secret, START.getTime()) });
  assert.equal(step2.status, 200);
  assert.ok(step2.cookie);
  const off = await call(app, 'POST', '/me/2fa/disable', { password: 'Sunrise2026' }, step2.cookie);
  assert.equal(off.body.user.twoFactor, false);
  await app.close();
});

test('contact form, partner request and avatar', async () => {
  const { app } = setup();
  const cookie = await signup(app);
  assert.equal((await call(app, 'POST', '/contact', { name: 'Marina', email: 'marina@mail.com', topic: 'booking', message: 'Short' })).status, 400);
  assert.equal((await call(app, 'POST', '/contact', { name: 'Marina', email: 'marina@mail.com', topic: 'booking', message: 'Where do I find my booking reference?' })).status, 201);
  const partner = { business: 'Lagman House', category: 'restaurants', contactName: 'Aziz', email: 'aziz@mail.com', phone: '+998 90 555 44 33', neighbourhood: 'Chilanzar' };
  assert.equal((await call(app, 'POST', '/partners', partner)).status, 201);
  assert.equal((await call(app, 'POST', '/partners', { ...partner, neighbourhood: 'Paris' })).status, 400);
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  assert.equal((await call(app, 'PUT', '/me/avatar', { image: 'data:text/html;base64,PGI+' }, cookie)).status, 400);
  assert.equal((await call(app, 'PUT', '/me/avatar', { image: png }, cookie)).body.user.avatar, png);
  assert.equal((await call(app, 'DELETE', '/me/avatar', undefined, cookie)).body.user.avatar, null);
  await app.close();
});

test('waitlist is notified when a slot is released', async () => {
  const { app } = setup();
  const waiter = await signup(app, 'waiter@mail.com');
  const owner = await signup(app);
  const date = addDays(TODAY, 2);
  assert.equal((await call(app, 'POST', '/waitlist', { slug: 'amber', date }, waiter)).status, 201);
  const b = (await call<Booking>(app, 'POST', '/bookings', { ...base, slug: 'amber', date, time: '19:00', resource: 'bar' }, owner)).body;
  await call(app, 'POST', `/bookings/${b.ref}/cancel`, {}, owner);
  const notes = (await call(app, 'GET', '/notifications', undefined, waiter)).body;
  assert.equal(notes[0].type, 'waitlist');
  assert.equal(notes[0].data.place, 'Amber');
  await app.close();
});

test('venue settings change prices and are applied to quotes', async () => {
  const clock = { now: START };
  const { app } = buildApp({ dbPath: ':memory:', sessionIdleMin: 30, demoLoad: false, seedDemo: true, production: false, now: () => clock.now });
  const owner = (await call(app, 'POST', '/auth/login', { email: 'owner@amber.example', password: 'Amber2026' })).cookie!;
  const v = (await call(app, 'GET', '/business/venue', undefined, owner)).body;
  assert.equal(v.areas.length, 3);
  const upd = await call(app, 'PATCH', '/business/venue', { openUntil: '23:30', tables: { bar: 1 } }, owner);
  assert.equal(upd.body.openUntil, '23:30');
  assert.equal(upd.body.areas.find((a: { id: string }) => a.id === 'bar').tables, 1);
  const a = await call<Availability>(app, 'GET', `/places/amber/availability?date=${addDays(TODAY, 3)}`);
  assert.equal(a.body.resources.find((r) => r.id === 'bar')!.left['19:00'], 1);
  assert.equal((await call(app, 'GET', '/business/week', undefined, owner)).body.days.length, 7);
  assert.ok((await call(app, 'GET', '/business/customers', undefined, owner)).body.length >= 5);
  await app.close();
  // Новое приложение с другой базой начинает с исходного каталога.
  const fresh = setup();
  const b = await call<Availability>(fresh.app, 'GET', `/places/amber/availability?date=${addDays(TODAY, 3)}`);
  assert.equal(b.body.resources.find((r) => r.id === 'bar')!.left['19:00'], 3);
  await fresh.app.close();
});

test('near me sorts by real distance', async () => {
  const { app } = setup();
  // Точка в Чиланзаре: первыми идут места этого района.
  const r = await call(app, 'GET', '/places?sort=distance&near=41.2750,69.2040&perPage=3');
  assert.equal(r.body.items[0].neighbourhood, 'Chilanzar');
  assert.ok(r.body.items[0].distanceKm < 2);
  await app.close();
});

test('text search understands Russian, Uzbek and Cyrillic spelling of names', async () => {
  const { app } = setup();
  const slugs = async (q: string) => (await call(app, 'GET', `/places?perPage=50&q=${encodeURIComponent(q)}`)).body.items.map((p: { slug: string }) => p.slug).sort();
  const italian = await slugs('Italian');
  assert.ok(italian.length >= 2);
  assert.deepEqual(await slugs('итальянский'), italian);
  assert.deepEqual(await slugs('итальянская кухня ресторан'), await slugs('Italian restaurant'));
  assert.ok((await slugs('Амбер')).includes('amber'));
  assert.ok((await slugs('ок сарой')).includes('oq-saroy'));
  assert.deepEqual(await slugs('Мирабад'), await slugs('Mirabad'));
  assert.ok((await slugs('отель')).length > 0);
  assert.deepEqual(await slugs('zzzz'), []);
  const sug = (await call(app, 'GET', `/suggest?q=${encodeURIComponent('Чиланзар')}`)).body;
  assert.equal(sug[0].title, 'Chilanzar, Tashkent');
  await app.close();
});
