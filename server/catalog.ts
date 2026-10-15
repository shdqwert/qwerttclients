// Каталог мест. Категории и места из дизайна qwerttclients; недостающие для работы данные
// (кафе, коворкинг, меню и услуги остальных мест) — демонстрационные.
import type {
  EventConfig, HotelConfig, Kind, PlaceConfig, RestaurantConfig, SalonConfig, SportConfig,
} from '../shared/types.ts';

export interface CategoryDef {
  id: string;
  name: string;
  color: string;
  icon: string;
  art: string;
  unit: string;
}

export const CATEGORIES: CategoryDef[] = [
  { id: 'restaurants', name: 'Restaurants', color: '#B5622E', icon: 'i7', art: 'r2', unit: 'tables' },
  { id: 'cafes', name: 'Cafes', color: '#6B4A34', icon: 'i17', art: 'c2', unit: 'tables' },
  { id: 'beauty', name: 'Beauty', color: '#23222A', icon: 'i8', art: 'b1', unit: 'appointments' },
  { id: 'wellness', name: 'Wellness', color: '#3F6B57', icon: 'i13', art: 'sp1', unit: 'treatments' },
  { id: 'hotels', name: 'Hotels', color: '#1F2A4A', icon: 'i9', art: 'ho2', unit: 'nights' },
  { id: 'sports', name: 'Sports', color: '#A8456B', icon: 'i18', art: 't2', unit: 'courts and classes' },
  { id: 'events', name: 'Events', color: '#2B1F4A', icon: 'i11', art: 'j2', unit: 'shows' },
  { id: 'health', name: 'Health', color: '#3E6E8E', icon: 'i19', art: 'd1', unit: 'clinics' },
];

export const NEIGHBOURHOODS = ['Mirabad', 'Yunusabad', 'Chilanzar', 'Old City', 'Mirzo Ulugbek', 'Shaykhontohur'];

export interface PlaceDef {
  slug: string;
  name: string;
  category: string;
  kind: Kind;
  subtitle: string;
  cuisine: string | null;
  address: string;
  neighbourhood: string;
  rating: number;
  reviews: number;
  priceFrom: number;
  priceUnit: string;
  priceLevel: string;
  color: string;
  icon: string;
  art: string;
  gallery: string[];
  badge: string | null;
  deal: string | null;
  tags: string[];
  instant: boolean;
  cancelHours: number;
  openUntil: string;
  phone: string;
  about: string;
  amenities: { icon: string; label: string }[];
  highlightsTitle: string;
  highlights: { name: string; note: string; price: string }[];
  policies: string;
  x: number;
  y: number;
  /** Примерные координаты (центр района плюс смещение) — для сортировки «рядом со мной». */
  lat: number;
  lng: number;
  config: PlaceConfig;
}

/** Центры районов Ташкента. */
const HOODS: Record<string, [number, number]> = {
  Mirabad: [41.2930, 69.2790], Yunusabad: [41.3650, 69.2870], Chilanzar: [41.2750, 69.2040],
  'Old City': [41.3260, 69.2300], 'Mirzo Ulugbek': [41.3370, 69.3350], Shaykhontohur: [41.3170, 69.2500],
};

const offset = (s: string, salt: number) => {
  let h = salt;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ((h % 1000) / 1000 - 0.5) * 0.012;
};

const AMENITY: Record<string, string> = {
  'Free Wi-Fi': 'i58', 'Wi-Fi': 'i58', 'Parking nearby': 'i59', Parking: 'i59', 'Outdoor seating': 'i60',
  'Cards accepted': 'i47', 'Live music Fri–Sat': 'i4', 'Live music': 'i4', 'Instant confirmation': 'i30',
};
const amen = (...labels: string[]) => labels.map((label) => ({ label, icon: AMENITY[label] ?? (label.startsWith('Groups') ? 'i16' : 'i30') }));

const half = (from: number, to: number) => {
  const out: string[] = [];
  for (let m = from * 60; m <= to * 60; m += 30) out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${m % 60 ? '30' : '00'}`);
  return out;
};

const tables = (opts: { terrace?: number; hall: number; bar?: number; maxParty?: number; lunch?: boolean }): RestaurantConfig => ({
  periods: [
    ...(opts.lunch === false ? [] : [{ name: 'Lunch', times: half(12, 14) }]),
    { name: 'Dinner', times: half(18, 21.5) },
  ],
  areas: [
    ...(opts.terrace ? [{ id: 'terrace', name: 'Terrace', note: 'Outdoor, heated', tables: opts.terrace, icon: 'i60' }] : []),
    { id: 'hall', name: 'Main hall', note: 'Open kitchen view', tables: opts.hall, icon: 'i64' },
    ...(opts.bar ? [{ id: 'bar', name: 'Bar counter', note: 'High stools, quick bites', tables: opts.bar, icon: 'i17' }] : []),
  ],
  maxParty: opts.maxParty ?? 12,
});

const restaurantPolicies = 'Free cancellation up to 2 hours before. Tables held for 15 minutes. Groups of 8+ need the restaurant to confirm.';

type Base = Omit<PlaceDef, 'gallery' | 'badge' | 'deal' | 'instant' | 'cancelHours' | 'priceLevel' | 'cuisine' | 'phone' | 'lat' | 'lng'> & Partial<PlaceDef>;
const place = (p: Base): PlaceDef => {
  const [lat, lng] = HOODS[p.neighbourhood] ?? [41.2995, 69.2401];
  return {
    gallery: [p.art, p.art, p.art, p.art, p.art], badge: null, deal: null, instant: true, cancelHours: 2,
    priceLevel: '$', cuisine: null, phone: '+998 71 123 45 67', lat: lat + offset(p.slug, 7), lng: lng + offset(p.slug, 13), ...p,
  };
};

export const PLACES: PlaceDef[] = [
  place({
    slug: 'amber', name: 'Amber', category: 'restaurants', kind: 'restaurant', subtitle: 'Restaurant · Italian', cuisine: 'Italian',
    address: 'Amir Temur St 45', neighbourhood: 'Mirabad', rating: 4.8, reviews: 340, priceFrom: 25, priceUnit: '/ guest', priceLevel: '$$$',
    color: '#B5622E', icon: 'i7', art: 'i20', gallery: ['i20', 'i74', 'i75', 'i76', 'i77'], badge: 'Popular',
    tags: ['Outdoor seating', 'Live music', 'Wi-Fi', 'Parking', 'Groups'], openUntil: '23:00',
    about: 'Neighbourhood Italian with a wood-fired kitchen and a terrace over the canal. Handmade pasta, short seasonal menu, natural wines.',
    amenities: amen('Free Wi-Fi', 'Parking nearby', 'Outdoor seating', 'Groups up to 12', 'Cards accepted', 'Live music Fri–Sat'),
    highlightsTitle: 'Menu highlights',
    highlights: [
      { name: 'Burrata with heirloom tomatoes', note: 'Basil oil, sourdough', price: '$14' },
      { name: 'Tagliatelle al ragù', note: '12-hour beef ragù, parmesan', price: '$18' },
      { name: 'Grilled sea bass', note: 'Lemon, capers, roasted fennel', price: '$27' },
      { name: 'Tiramisu', note: 'House recipe', price: '$9' },
    ],
    policies: restaurantPolicies, x: 46, y: 52, config: tables({ terrace: 6, hall: 8, bar: 3 }),
  }),
  place({
    slug: 'tavola', name: 'Tavola', category: 'restaurants', kind: 'restaurant', subtitle: 'Restaurant · Italian', cuisine: 'Italian',
    address: 'Navoi Ave 9', neighbourhood: 'Mirabad', rating: 4.7, reviews: 212, priceFrom: 18, priceUnit: '/ guest',
    color: '#8A3B2B', icon: 'i7', art: 'i71', tags: ['Outdoor seating', 'Wi-Fi'], openUntil: '23:00',
    about: 'Family trattoria with long tables, a wood oven and a short list of house wines.',
    amenities: amen('Free Wi-Fi', 'Outdoor seating', 'Cards accepted'), highlightsTitle: 'Menu highlights',
    highlights: [
      { name: 'Margherita', note: 'San Marzano, fior di latte', price: '$9' },
      { name: 'Cacio e pepe', note: 'Pecorino, black pepper', price: '$12' },
      { name: 'Panna cotta', note: 'Seasonal berries', price: '$6' },
    ],
    policies: restaurantPolicies, x: 38, y: 60, config: tables({ terrace: 4, hall: 7 }),
  }),
  place({
    slug: 'sakura-house', name: 'Sakura House', category: 'restaurants', kind: 'restaurant', subtitle: 'Restaurant · Japanese', cuisine: 'Japanese',
    address: 'Mirabad St 31', neighbourhood: 'Mirabad', rating: 4.8, reviews: 164, priceFrom: 28, priceUnit: '/ guest', priceLevel: '$$$',
    color: '#7A2E3A', icon: 'i7', art: 'i72', badge: 'New', tags: ['Parking', 'Wi-Fi'], openUntil: '23:30',
    about: 'Counter seating around an open sushi bar and a small dining room for groups.',
    amenities: amen('Free Wi-Fi', 'Parking nearby', 'Cards accepted'), highlightsTitle: 'Menu highlights',
    highlights: [
      { name: 'Omakase set', note: '10 pieces, chef’s choice', price: '$34' },
      { name: 'Salmon donburi', note: 'Rice, pickles, miso', price: '$16' },
      { name: 'Matcha cheesecake', note: 'Baked daily', price: '$7' },
    ],
    policies: restaurantPolicies, x: 54, y: 58, config: tables({ hall: 6, bar: 4, maxParty: 8, lunch: false }),
  }),
  place({
    slug: 'oq-saroy', name: 'Oq Saroy', category: 'restaurants', kind: 'restaurant', subtitle: 'Restaurant · Uzbek', cuisine: 'Uzbek',
    address: 'Shakhrisabz St 2', neighbourhood: 'Old City', rating: 4.6, reviews: 402, priceFrom: 14, priceUnit: '/ guest', priceLevel: '$',
    color: '#5C6B2E', icon: 'i7', art: 'i73', tags: ['Outdoor seating', 'Groups', 'Parking'], openUntil: '23:00', instant: false,
    about: 'Large courtyard restaurant known for plov from the kazan, tandoor bread and weekend banquets.',
    amenities: amen('Outdoor seating', 'Parking nearby', 'Groups up to 20', 'Cards accepted'), highlightsTitle: 'Menu highlights',
    highlights: [
      { name: 'Wedding plov', note: 'Lamb, yellow carrot, chickpeas', price: '$8' },
      { name: 'Shashlik set', note: 'Lamb, beef, chicken', price: '$12' },
      { name: 'Samsa', note: 'Tandoor-baked', price: '$3' },
    ],
    policies: restaurantPolicies, x: 24, y: 40, config: tables({ terrace: 8, hall: 10, maxParty: 20 }),
  }),
  place({
    slug: 'ambar-bistro', name: 'Ambar Bistro', category: 'restaurants', kind: 'restaurant', subtitle: 'Restaurant · Uzbek', cuisine: 'Uzbek',
    address: 'Bobur St 14', neighbourhood: 'Yunusabad', rating: 4.5, reviews: 88, priceFrom: 12, priceUnit: '/ guest', priceLevel: '$',
    color: '#B5622E', icon: 'i7', art: 'i76', tags: ['Wi-Fi', 'Parking'], openUntil: '22:00',
    about: 'Casual bistro with modern takes on Uzbek classics and a quick lunch menu.',
    amenities: amen('Free Wi-Fi', 'Parking nearby', 'Cards accepted'), highlightsTitle: 'Menu highlights',
    highlights: [
      { name: 'Lagman', note: 'Hand-pulled noodles', price: '$7' },
      { name: 'Manti', note: 'Pumpkin or beef', price: '$6' },
    ],
    policies: restaurantPolicies, x: 62, y: 22, config: tables({ hall: 9 }),
  }),
  place({
    slug: 'corner-cup', name: 'Corner Cup', category: 'cafes', kind: 'restaurant', subtitle: 'Cafe · Specialty coffee', cuisine: 'Coffee',
    address: 'Taras Shevchenko St 21', neighbourhood: 'Mirabad', rating: 4.7, reviews: 131, priceFrom: 6, priceUnit: '/ guest', priceLevel: '$',
    color: '#6B4A34', icon: 'i17', art: 'i69', tags: ['Wi-Fi', 'Outdoor seating'], openUntil: '21:00',
    about: 'Specialty coffee, all-day breakfast and a quiet back room for working.',
    amenities: amen('Free Wi-Fi', 'Outdoor seating', 'Cards accepted'), highlightsTitle: 'Menu highlights',
    highlights: [
      { name: 'Flat white', note: 'House blend', price: '$3' },
      { name: 'Shakshuka', note: 'Two eggs, sourdough', price: '$6' },
    ],
    policies: 'Free cancellation up to 1 hour before. Tables held for 10 minutes.', cancelHours: 1, x: 50, y: 46,
    config: { periods: [{ name: 'Morning', times: half(9, 11.5) }, { name: 'Afternoon', times: half(12, 17) }], areas: [{ id: 'hall', name: 'Main room', note: 'By the bar', tables: 6, icon: 'i17' }, { id: 'terrace', name: 'Street terrace', note: 'Outdoor', tables: 3, icon: 'i60' }], maxParty: 6 },
  }),
  place({
    slug: 'studio-noir', name: 'Studio Noir', category: 'beauty', kind: 'salon', subtitle: 'Barber · Haircut',
    address: 'Bunyodkor Ave 3', neighbourhood: 'Chilanzar', rating: 4.9, reviews: 156, priceFrom: 12, priceUnit: '',
    color: '#23222A', icon: 'i8', art: 'i24', tags: ['Wi-Fi', 'Parking'], openUntil: '20:00', badge: 'Popular',
    about: 'Classic barbershop with four chairs. Scissor cuts, fades and hot towel shaves by appointment.',
    amenities: amen('Free Wi-Fi', 'Parking nearby', 'Cards accepted'), highlightsTitle: 'Services',
    highlights: [], policies: 'Free cancellation up to 2 hours before. Please arrive 5 minutes early.', x: 30, y: 72,
    config: {
      services: [
        { id: 'haircut', name: 'Haircut', minutes: 30, note: 'Scissors or clipper', price: 12 },
        { id: 'haircut-beard', name: 'Haircut + beard', minutes: 50, note: 'Most popular', price: 20 },
        { id: 'beard', name: 'Beard trim', minutes: 20, note: '', price: 9 },
        { id: 'shave', name: 'Hot towel shave', minutes: 40, note: '', price: 16 },
      ],
      specialists: [
        { id: 'dmitry', name: 'Dmitry K.', title: 'Senior barber · 8 years', rating: 4.9 },
        { id: 'rustam', name: 'Rustam A.', title: 'Barber · 4 years', rating: 4.8 },
        { id: 'olim', name: 'Olim S.', title: 'Barber · 6 years', rating: 4.9 },
      ],
      open: '10:00', close: '19:00',
    } satisfies SalonConfig,
  }),
  place({
    slug: 'amber-hair-studio', name: 'Amber Hair Studio', category: 'beauty', kind: 'salon', subtitle: 'Hair salon · Beauty',
    address: 'Mustaqillik Ave 40', neighbourhood: 'Mirzo Ulugbek', rating: 4.6, reviews: 73, priceFrom: 15, priceUnit: '',
    color: '#23222A', icon: 'i8', art: 'i24', tags: ['Wi-Fi'], openUntil: '20:00',
    about: 'Colour, cuts and styling in a small studio with two stylists.',
    amenities: amen('Free Wi-Fi', 'Cards accepted'), highlightsTitle: 'Services', highlights: [],
    policies: 'Free cancellation up to 2 hours before.', x: 72, y: 38,
    config: {
      services: [
        { id: 'cut', name: 'Cut and blow-dry', minutes: 60, note: 'Wash included', price: 15 },
        { id: 'colour', name: 'Full colour', minutes: 120, note: 'Consultation included', price: 45 },
        { id: 'styling', name: 'Styling', minutes: 40, note: '', price: 18 },
      ],
      specialists: [
        { id: 'nigora', name: 'Nigora T.', title: 'Stylist · 7 years', rating: 4.7 },
        { id: 'kamila', name: 'Kamila R.', title: 'Colourist · 5 years', rating: 4.6 },
      ],
      open: '10:00', close: '19:00',
    } satisfies SalonConfig,
  }),
  place({
    slug: 'sage-and-stone', name: 'Sage & Stone', category: 'wellness', kind: 'salon', subtitle: 'Spa · Massage',
    address: 'Mirabad St 8', neighbourhood: 'Mirabad', rating: 4.9, reviews: 119, priceFrom: 35, priceUnit: '', priceLevel: '$$$',
    color: '#3F6B57', icon: 'i13', art: 'i23', tags: ['Parking', 'Wi-Fi'], openUntil: '21:00', deal: '15% off spa treatments this weekend',
    about: 'Day spa with massage rooms, a hammam and a quiet lounge. Treatments by certified therapists.',
    amenities: amen('Free Wi-Fi', 'Parking nearby', 'Cards accepted'), highlightsTitle: 'Treatments', highlights: [],
    policies: 'Free cancellation up to 4 hours before.', cancelHours: 4, x: 58, y: 64,
    config: {
      services: [
        { id: 'classic', name: 'Classic massage', minutes: 60, note: 'Full body', price: 35 },
        { id: 'deep', name: 'Deep tissue massage', minutes: 90, note: 'Most popular', price: 50 },
        { id: 'hammam', name: 'Hammam ritual', minutes: 60, note: 'Scrub and foam', price: 40 },
      ],
      specialists: [
        { id: 'malika', name: 'Malika Y.', title: 'Therapist · 9 years', rating: 4.9 },
        { id: 'sardor', name: 'Sardor B.', title: 'Therapist · 5 years', rating: 4.8 },
      ],
      open: '10:00', close: '20:00',
    } satisfies SalonConfig,
  }),
  place({
    slug: 'city-dental-clinic', name: 'City Dental Clinic', category: 'health', kind: 'salon', subtitle: 'Healthcare · Consultation',
    address: 'Chilanzar 9', neighbourhood: 'Chilanzar', rating: 4.9, reviews: 207, priceFrom: 20, priceUnit: '',
    color: '#3E6E8E', icon: 'i19', art: 'i29', tags: ['Parking'], openUntil: '18:00',
    about: 'General and cosmetic dentistry. First visit includes an examination and a treatment plan.',
    amenities: amen('Parking nearby', 'Cards accepted'), highlightsTitle: 'Services', highlights: [],
    policies: 'Free cancellation up to 24 hours before.', cancelHours: 24, x: 22, y: 78,
    config: {
      services: [
        { id: 'consult', name: 'Consultation', minutes: 30, note: 'Examination and plan', price: 20 },
        { id: 'cleaning', name: 'Professional cleaning', minutes: 60, note: '', price: 45 },
        { id: 'whitening', name: 'Whitening', minutes: 90, note: '', price: 120 },
      ],
      specialists: [
        { id: 'akmal', name: 'Dr. Akmal N.', title: 'Dentist · 12 years', rating: 4.9 },
        { id: 'laylo', name: 'Dr. Laylo M.', title: 'Dentist · 6 years', rating: 4.9 },
      ],
      open: '09:00', close: '18:00',
    } satisfies SalonConfig,
  }),
  place({
    slug: 'merion-hotel', name: 'Merion Hotel', category: 'hotels', kind: 'hotel', subtitle: 'Hotel · 4-star',
    address: 'Navoi Ave 22', neighbourhood: 'Shaykhontohur', rating: 4.7, reviews: 188, priceFrom: 80, priceUnit: '/ night', priceLevel: '$$$',
    color: '#1F2A4A', icon: 'i9', art: 'i26', tags: ['Wi-Fi', 'Parking'], openUntil: '24:00', instant: false, cancelHours: 48,
    about: 'Business hotel a short walk from the old town, with a rooftop breakfast room and a small gym.',
    amenities: amen('Free Wi-Fi', 'Parking nearby', 'Cards accepted'), highlightsTitle: 'Rooms', highlights: [],
    policies: 'Check-in from 14:00, check-out until 12:00. Flexible rate: free cancellation up to 48 hours before check-in.', x: 34, y: 48,
    config: {
      rooms: [
        { id: 'standard', name: 'Standard double', bed: '1 queen bed', size: '22 m²', tags: ['City view', 'Wi-Fi'], price: 80, count: 6, sleeps: 2, photo: 'ho1' },
        { id: 'deluxe', name: 'Deluxe double', bed: '1 king bed', size: '28 m²', tags: ['Balcony', 'Breakfast option', 'Wi-Fi'], price: 104, count: 4, sleeps: 3, photo: 'ho2' },
        { id: 'family', name: 'Family suite', bed: '2 queens', size: '42 m²', tags: ['2 rooms', 'Kitchenette'], price: 156, count: 2, sleeps: 5, photo: 'ho4' },
      ],
      rates: [
        { id: 'flex', name: 'Flexible rate', note: 'Free cancellation up to 48 hours before check-in', factor: 1 },
        { id: 'advance', name: 'Advance rate', note: 'Non-refundable · save 10%', factor: 0.9 },
      ],
      extras: [
        { id: 'breakfast', name: 'Breakfast', note: 'Buffet, 07:00–10:30', price: 9, per: 'person_night' },
        { id: 'transfer', name: 'Airport transfer', note: 'Private car from TAS airport', price: 25, per: 'stay' },
        { id: 'late', name: 'Late check-out', note: 'Until 16:00, subject to availability', price: 15, per: 'stay' },
      ],
      minNights: 2, taxRate: 0.06, checkIn: '14:00', checkOut: '12:00',
    } satisfies HotelConfig,
  }),
  place({
    slug: 'riverside-sports-club', name: 'Riverside Sports Club', category: 'sports', kind: 'sport', subtitle: 'Tennis court · Indoor',
    address: 'Ankhor Canal St 5', neighbourhood: 'Shaykhontohur', rating: 4.8, reviews: 96, priceFrom: 15, priceUnit: '/ hour',
    color: '#2F6B4A', icon: 'i10', art: 'i27', tags: ['Parking'], openUntil: '22:00',
    about: 'Four tennis courts by the canal, three indoors. Racket rental and showers on site.',
    amenities: amen('Parking nearby', 'Cards accepted'), highlightsTitle: 'Courts', highlights: [],
    policies: 'Free cancellation up to 6 hours before.', cancelHours: 6, x: 40, y: 34,
    config: {
      resourceLabel: 'Court',
      courts: [
        { id: 'court-1', name: 'Court 1', note: 'Indoor · Hard', price: 15 },
        { id: 'court-2', name: 'Court 2', note: 'Indoor · Clay', price: 18 },
        { id: 'court-3', name: 'Court 3', note: 'Indoor · Hard', price: 15 },
        { id: 'court-4', name: 'Court 4', note: 'Outdoor · Clay', price: 12 },
      ],
      hours: ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'],
      durations: [60, 90, 120],
    } satisfies SportConfig,
  }),
  place({
    slug: 'pulse-studio', name: 'Pulse Studio', category: 'sports', kind: 'sport', subtitle: 'Fitness · Yoga',
    address: 'Mustaqillik Ave 17', neighbourhood: 'Mirzo Ulugbek', rating: 4.8, reviews: 142, priceFrom: 10, priceUnit: '/ class',
    color: '#A8456B', icon: 'i18', art: 'i25', tags: ['Wi-Fi'], openUntil: '21:00',
    about: 'Boutique studio with yoga, pilates and strength rooms you can book by the hour.',
    amenities: amen('Free Wi-Fi', 'Cards accepted'), highlightsTitle: 'Studios', highlights: [],
    policies: 'Free cancellation up to 3 hours before.', cancelHours: 3, x: 76, y: 44,
    config: {
      resourceLabel: 'Studio',
      courts: [
        { id: 'yoga', name: 'Yoga room', note: 'Mats provided · Up to 12', price: 10 },
        { id: 'pilates', name: 'Pilates room', note: 'Reformers · Up to 6', price: 14 },
        { id: 'strength', name: 'Strength room', note: 'Free weights · Up to 8', price: 12 },
      ],
      hours: ['07:00', '08:00', '09:00', '10:00', '12:00', '17:00', '18:00', '19:00', '20:00'],
      durations: [60, 90],
    } satisfies SportConfig,
  }),
  place({
    slug: 'nomad-coworking', name: 'Nomad Coworking', category: 'coworking', kind: 'sport', subtitle: 'Coworking · Hot desk',
    address: 'Yunusabad 4', neighbourhood: 'Yunusabad', rating: 4.8, reviews: 64, priceFrom: 2, priceUnit: '/ hour',
    color: '#4A5568', icon: 'i64', art: 'i28', tags: ['Wi-Fi', 'Parking'], openUntil: '22:00',
    about: 'Open-plan coworking with hot desks and two meeting rooms. Coffee and fast Wi-Fi included.',
    amenities: amen('Free Wi-Fi', 'Parking nearby', 'Cards accepted'), highlightsTitle: 'Spaces', highlights: [],
    policies: 'Free cancellation up to 2 hours before.', x: 66, y: 16,
    config: {
      resourceLabel: 'Space',
      courts: [
        { id: 'desk', name: 'Hot desk', note: 'Open space · 1 person', price: 2 },
        { id: 'room-a', name: 'Meeting room A', note: 'Screen · Up to 6', price: 8 },
        { id: 'room-b', name: 'Meeting room B', note: 'Whiteboard · Up to 10', price: 12 },
      ],
      hours: ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'],
      durations: [60, 120, 180],
    } satisfies SportConfig,
  }),
  place({
    slug: 'blue-room-jazz-night', name: 'Blue Room Jazz Night', category: 'events', kind: 'event', subtitle: 'Event · Live jazz',
    address: 'Mirzo Ulugbek 9', neighbourhood: 'Mirzo Ulugbek', rating: 4.9, reviews: 54, priceFrom: 12, priceUnit: '/ ticket',
    color: '#2B1F4A', icon: 'i11', art: 'i70', tags: ['Live music'], openUntil: '23:30', cancelHours: 24,
    about: 'A weekly jazz night with a resident quartet and guest soloists. Standing floor, a few seated rows and VIP tables.',
    amenities: amen('Live music', 'Cards accepted'), highlightsTitle: 'Tickets', highlights: [],
    policies: 'Tickets can be cancelled free of charge up to 24 hours before the show. Payment is taken at the door.', x: 80, y: 30,
    config: {
      weekdays: [5, 6], time: '20:00', doors: '19:00', hall: 'Main hall', capacity: 120,
      tickets: [
        { id: 'standard', name: 'Standard', note: 'General admission · standing', price: 12, seats: 1 },
        { id: 'seated', name: 'Seated', note: 'Numbered seat, row 3–6', price: 20, seats: 1 },
        { id: 'vip', name: 'VIP table', note: 'Table for 4, 2 drinks included', price: 90, seats: 4 },
      ],
      maxTickets: 6, feePerTicket: 1,
    } satisfies EventConfig,
  }),
];

/** Фотографии мест (ключи из web/src/photos.ts): первая — главная, остальные — галерея. */
const PHOTO_SETS: Record<string, string[]> = {
  amber: ['r2', 'f2', 'f1', 'r3', 'r1'],
  tavola: ['r6', 'r5', 'f3', 'r4', 'f4'],
  'sakura-house': ['s1', 's3', 's2', 'r4', 'r1'],
  'oq-saroy': ['p1', 'p3', 'p2', 'r3', 'r4'],
  'ambar-bistro': ['p2', 'p1', 'r4', 'r6', 'f3'],
  'corner-cup': ['c2', 'c1', 'c3', 'r6', 'r4'],
  'studio-noir': ['b1', 'b2', 'b4', 'b3', 'h3'],
  'amber-hair-studio': ['h2', 'h1', 'h3', 'b3', 'sp2'],
  'sage-and-stone': ['sp1', 'sp4', 'sp3', 'sp2', 'ho3'],
  'city-dental-clinic': ['d1', 'd3', 'd2', 'w1', 'w2'],
  'merion-hotel': ['ho2', 'ho1', 'ho4', 'ho5', 'ho3'],
  'riverside-sports-club': ['t2', 't1', 't3', 'y3', 'w2'],
  'pulse-studio': ['y2', 'y1', 'y3', 't3', 'sp3'],
  'nomad-coworking': ['w1', 'w3', 'w2', 'c3', 'c1'],
  'blue-room-jazz-night': ['j2', 'j1', 'j3', 'r1', 'c3'],
};
for (const p of PLACES) {
  const set = PHOTO_SETS[p.slug];
  if (set) { p.art = set[0]!; p.gallery = set; }
}

export const placeBySlug = new Map(PLACES.map((p) => [p.slug, p]));

// --- Правки, сделанные площадкой в кабинете бизнеса ---

export interface VenueOverride {
  about?: string;
  phone?: string;
  openUntil?: string;
  policies?: string;
  instant?: boolean;
  cancelHours?: number;
  /** Цены услуг, номеров, кортов и билетов по id. */
  prices?: Record<string, number>;
  /** Число столов в зонах ресторана по id зоны. */
  tables?: Record<string, number>;
}

const ORIGINAL = new Map(PLACES.map((p) => [p.slug, structuredClone(p)]));

/** Возвращает каталог к исходным данным (каждое приложение применяет правки своей базы). */
export function resetCatalog() {
  for (const p of PLACES) Object.assign(p, structuredClone(ORIGINAL.get(p.slug)!));
}

export function resetPlace(slug: string) {
  const p = placeBySlug.get(slug);
  if (p) Object.assign(p, structuredClone(ORIGINAL.get(slug)!));
}

export function applyOverride(p: PlaceDef, o: VenueOverride) {
  if (o.about != null) p.about = o.about;
  if (o.phone != null) p.phone = o.phone;
  if (o.openUntil != null) p.openUntil = o.openUntil;
  if (o.policies != null) p.policies = o.policies;
  if (o.instant != null) p.instant = o.instant;
  if (o.cancelHours != null) p.cancelHours = o.cancelHours;
  const cfg = p.config as unknown as Record<string, { id: string; price?: number; tables?: number }[]>;
  for (const list of ['services', 'rooms', 'courts', 'tickets', 'areas']) {
    for (const item of cfg[list] ?? []) {
      if (o.prices?.[item.id] != null && item.price != null) item.price = o.prices[item.id]!;
      if (list === 'areas' && o.tables?.[item.id] != null) item.tables = o.tables[item.id]!;
    }
  }
  // Цена «от» в каталоге следует за самой низкой ценой площадки.
  const prices = ['services', 'rooms', 'courts', 'tickets'].flatMap((l) => (cfg[l] ?? []).map((i) => i.price ?? Infinity));
  const min = Math.min(...prices);
  if (Number.isFinite(min) && p.kind !== 'restaurant') p.priceFrom = min;
}
