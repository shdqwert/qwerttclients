// Общие типы API: используются и сервером, и фронтендом.

export type Kind = 'restaurant' | 'salon' | 'hotel' | 'sport' | 'event';
export type BookingStatus = 'confirmed' | 'pending' | 'cancelled' | 'completed';

export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  art: string;
  unit: string;
  count: number;
}

export interface SlotInfo {
  time: string;
  left: number;
}

export interface PlaceCard {
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
  color: string;
  icon: string;
  art: string;
  badge: string | null;
  deal: string | null;
  tags: string[];
  instant: boolean;
  freeCancel: boolean;
  x: number;
  y: number;
  lat: number;
  lng: number;
  distanceKm: number | null;
  saved: boolean;
  slots: SlotInfo[];
}

// --- Настройки бронирования по типам мест ---

export interface RestaurantConfig {
  periods: { name: string; times: string[] }[];
  areas: { id: string; name: string; note: string; tables: number; icon: string }[];
  maxParty: number;
}

export interface SalonConfig {
  services: { id: string; name: string; minutes: number; note: string; price: number }[];
  specialists: { id: string; name: string; title: string; rating: number }[];
  open: string;
  close: string;
}

export interface HotelConfig {
  rooms: { id: string; name: string; bed: string; size: string; tags: string[]; price: number; count: number; sleeps: number; photo?: string }[];
  rates: { id: string; name: string; note: string; factor: number }[];
  extras: { id: string; name: string; note: string; price: number; per: 'person_night' | 'stay' }[];
  minNights: number;
  taxRate: number;
  checkIn: string;
  checkOut: string;
}

export interface SportConfig {
  resourceLabel: string;
  courts: { id: string; name: string; note: string; price: number }[];
  hours: string[];
  durations: number[];
}

export interface EventConfig {
  weekdays: number[];
  time: string;
  doors: string;
  hall: string;
  capacity: number;
  tickets: { id: string; name: string; note: string; price: number; seats: number }[];
  maxTickets: number;
  feePerTicket: number;
}

export type PlaceConfig = RestaurantConfig | SalonConfig | HotelConfig | SportConfig | EventConfig;

export interface Review {
  id: number;
  author: string;
  rating: number;
  text: string;
  date: string;
}

export interface PlaceDetail extends PlaceCard {
  about: string;
  priceLevel: string;
  openUntil: string;
  phone: string;
  amenities: { icon: string; label: string }[];
  highlightsTitle: string;
  highlights: { name: string; note: string; price: string }[];
  policies: string;
  cancelHours: number;
  gallery: string[];
  config: PlaceConfig;
  reviewList: Review[];
  ratingBars: number[];
  bookedToday: number;
  canReview: boolean;
}

// Доступность: для каждого ресурса (зона, мастер, корт, номер, сеанс) — сколько осталось по ключу.
// Ключ — время начала ("19:00"), для отеля — "stay", для мероприятия — "tickets".
export interface Availability {
  date: string;
  times: string[];
  resources: { id: string; left: Record<string, number> }[];
}

export type DayState = 'av' | 'full' | 'off';

export interface Selection {
  service?: string;
  specialist?: string;
  duration?: number;
  room?: string;
  rate?: string;
  extras?: string[];
  adults?: number;
  children?: number;
  rooms?: number;
  tickets?: Record<string, number>;
}

export interface Contact {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}

export interface BookingInput {
  slug: string;
  date: string;
  time?: string;
  endDate?: string;
  party: number;
  resource?: string;
  selection: Selection;
  contact: Contact;
  requests?: string;
  remind: boolean;
}

export interface Line {
  label: string;
  value: string;
}

export interface Booking {
  ref: string;
  key: string;
  status: BookingStatus;
  kind: Kind;
  date: string;
  time: string | null;
  endTime: string | null;
  endDate: string | null;
  party: number;
  resource: string | null;
  selection: Selection;
  summary: Line[];
  priceLines: Line[];
  total: number;
  contact: Contact;
  requests: string;
  createdAt: string;
  cancelUntil: string;
  canCancelFree: boolean;
  place: Pick<PlaceCard, 'slug' | 'name' | 'category' | 'kind' | 'subtitle' | 'address' | 'neighbourhood' | 'color' | 'icon'> & { phone: string };
}

export interface UserSettings {
  notifyUpdates: boolean;
  notifyReminders: boolean;
  notifyOffers: boolean;
  language: 'en' | 'ru' | 'uz';
  currency: 'USD';
}

export interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: 'user' | 'business';
  businessPlace: string | null;
  createdAt: string;
  passwordChangedAt: string;
  settings: UserSettings;
  sessions: number;
  avatar: string | null;
  twoFactor: boolean;
}

export interface Notification {
  id: number;
  type: 'confirmed' | 'reminder' | 'booking' | 'offer' | 'review' | 'cancelled' | 'declined' | 'waitlist' | 'updated';
  group: 'bookings' | 'offers';
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  read: boolean;
  data: NotificationData | null;
}

/** Данные для локализованного текста уведомления. */
export interface NotificationData {
  place: string;
  kind?: Kind;
  date?: string;
  time?: string | null;
  endDate?: string | null;
  party?: number;
  text?: string;
}

export interface SearchResult {
  items: PlaceCard[];
  total: number;
  page: number;
  pages: number;
  facets: {
    cuisines: { name: string; count: number }[];
    features: { name: string; count: number }[];
    freeCancel: number;
    instant: number;
    priceMin: number;
    priceMax: number;
  };
}

export interface Suggestion {
  type: 'neighbourhood' | 'place';
  title: string;
  note: string;
  icon: string;
  slug?: string;
}

export interface BusinessOverview {
  place: { slug: string; name: string; kind: Kind };
  date: string;
  stats: { bookings: number; bookingsDelta: number; occupancy: number; revenue: number; cancelledWeek: number };
  columns: { id: string; name: string }[];
  hours: string[];
  blocks: { ref: string; column: string; start: string; minutes: number; label: string; status: BookingStatus }[];
  pending: { ref: string; title: string; note: string; createdAt: string }[];
  list: { ref: string; time: string | null; name: string; party: number; status: BookingStatus; summary: string }[];
}

export interface ApiError {
  error: string;
  message: string;
  fields?: Record<string, string>;
  retryAfter?: number;
}
