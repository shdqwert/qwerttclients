// Демонстрационные данные для первого запуска: два аккаунта, несколько броней, отзывы, уведомления.
// Выполняется один раз, пока таблица пользователей пуста. Отключается переменной SEED_DEMO=0.
import { addDays, nowInTz, weekday } from '../shared/dates.ts';
import type { BookingInput, Contact } from '../shared/types.ts';
import { type Ctx, DEFAULT_SETTINGS, hashPassword, iso, notify } from './lib.ts';
import { createBooking, sweepCompleted } from './core.ts';

export const DEMO_USER = { email: 'marina@mail.com', password: 'Sunrise2026' };
export const DEMO_BUSINESS = { email: 'owner@amber.example', password: 'Amber2026' };

export function seedDemo(ctx: Ctx) {
  const { db, eng } = ctx;
  if ((db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n > 0) return;

  const realNow = eng.now;
  const realDemo = eng.demoLoad;
  const today = nowInTz(realNow()).date;
  const at = (date: string) => new Date(`${date}T00:05:00+05:00`);
  eng.demoLoad = false;
  eng.now = () => at(today);

  const addUser = (email: string, password: string, first: string, last: string, phone: string, role = 'user', place: string | null = null) => {
    const created = iso(new Date(realNow().getTime() - 200 * 86400000));
    return Number(db.prepare(
      'INSERT INTO users (email, password_hash, first_name, last_name, phone, role, business_place, settings, created_at, password_changed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(email, hashPassword(password), first, last, phone, role, place, JSON.stringify(DEFAULT_SETTINGS), created, created).lastInsertRowid);
  };
  const marina = addUser(DEMO_USER.email, DEMO_USER.password, 'Marina', 'Karimova', '+998 90 123 45 67');
  addUser(DEMO_BUSINESS.email, DEMO_BUSINESS.password, 'Amber', 'Team', '+998 71 123 45 67', 'business', 'amber');

  const me: Contact = { firstName: 'Marina', lastName: 'Karimova', phone: '+998 90 123 45 67', email: DEMO_USER.email };
  const guest = (firstName: string, lastName: string): Contact => ({ firstName, lastName, phone: '+998 90 555 01 01', email: `${lastName.toLowerCase()}@example.com` });
  const book = (userId: number | null, input: Omit<BookingInput, 'remind' | 'selection'> & { selection?: BookingInput['selection'] }) =>
    createBooking(ctx, { remind: true, selection: {}, ...input }, userId, eng.now());

  // Брони демо-пользователя.
  book(marina, { slug: 'amber', date: addDays(today, 1), time: '19:00', party: 2, resource: 'terrace', contact: me, requests: 'Window table if possible. One guest is vegetarian.' });
  book(marina, { slug: 'studio-noir', date: addDays(today, 3), time: '14:30', party: 1, selection: { service: 'haircut-beard', specialist: 'dmitry' }, contact: me });
  book(marina, { slug: 'merion-hotel', date: addDays(today, 6), endDate: addDays(today, 9), party: 2, selection: { room: 'deluxe', rate: 'flex', extras: ['breakfast'], adults: 2, children: 0, rooms: 1 }, contact: me });

  // Прошедшая бронь: создаётся «в прошлом» и сразу переводится в завершённые.
  eng.now = () => at(addDays(today, -10));
  book(marina, { slug: 'pulse-studio', date: addDays(today, -9), time: '18:00', party: 2, resource: 'yoga', selection: { duration: 60 }, contact: me });
  eng.now = () => at(today);
  sweepCompleted(ctx);

  // Гости ресторана Amber на сегодня и ближайшие дни — для кабинета бизнеса.
  book(null, { slug: 'amber', date: today, time: '18:00', party: 2, resource: 'hall', contact: guest('Olga', 'Petrova') });
  book(null, { slug: 'amber', date: today, time: '19:00', party: 4, resource: 'hall', contact: guest('Dmitry', 'Sokolov') });
  book(null, { slug: 'amber', date: today, time: '19:00', party: 8, resource: 'terrace', contact: guest('Timur', 'Aliyev'), requests: 'Birthday dinner, needs a high chair' });
  book(null, { slug: 'amber', date: today, time: '20:00', party: 2, resource: 'terrace', contact: guest('Lola', 'Nazarova') });
  book(null, { slug: 'amber', date: today, time: '20:30', party: 3, resource: 'bar', contact: guest('Jasur', 'Rakhimov') });
  const saturday = addDays(today, ((6 - weekday(today) + 7) % 7) || 7);
  book(null, { slug: 'amber', date: saturday, time: '19:30', party: 12, resource: 'hall', contact: guest('Anvar', 'Yusupov'), requests: 'Corporate dinner' });

  db.prepare('INSERT INTO saved (user_id, place, created_at) VALUES (?, ?, ?), (?, ?, ?)')
    .run(marina, 'amber', iso(realNow()), marina, 'sage-and-stone', iso(realNow()));

  const review = (author: string, rating: number, text: string, daysAgo: number) =>
    db.prepare('INSERT INTO reviews (place, user_id, author, rating, text, created_at) VALUES (?, NULL, ?, ?, ?, ?)')
      .run('amber', author, rating, text, iso(new Date(realNow().getTime() - daysAgo * 86400000)));
  review('Aziza K.', 5, 'Perfect for a birthday. The terrace is lovely and the staff handled our last-minute change without fuss.', 8);
  review('Dmitry S.', 4.5, 'Great pasta, a little loud on Friday. Booking took thirty seconds.', 15);

  const ago = (days: number) => new Date(realNow().getTime() - days * 86400000);
  notify(db, marina, 'offer', 'offers', 'Weekend offer near you', '15% off spa treatments at Sage & Stone', '/place/sage-and-stone', ago(5), { place: 'Sage & Stone', text: 'spa15' });
  notify(db, marina, 'review', 'bookings', 'How was Pulse Studio?', 'Leave a review for your recent visit', '/place/pulse-studio', ago(8), { place: 'Pulse Studio' });

  eng.now = realNow;
  eng.demoLoad = realDemo;
}
