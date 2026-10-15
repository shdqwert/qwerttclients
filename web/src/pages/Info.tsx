// Информационные страницы: справка, о компании, контакты, заявка площадки, приложения, вакансии, пресса, блог, правила.
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.ts';
import { t } from '../i18n.tsx';
import { authorUrl, PHOTOS, photoUrl, UNSPLASH_URL } from '../photos.ts';
import { NEIGHBOURHOOD_NAMES } from '../search.tsx';
import { useApp } from '../state.tsx';
import { Banner, Empty, Field, I, Icon, TextInput, useSubmit } from '../ui.tsx';

function useTitle(title: string) {
  useEffect(() => { document.title = `${title} — qwerttclients`; }, [title]);
}

function Article({ title, lead, children }: { title: string; lead?: ReactNode; children: ReactNode }) {
  useTitle(title);
  return (
    <div className="page prose" style={{ paddingTop: 40, paddingBottom: 64, maxWidth: 'calc(760px + var(--px) * 2)' }}>
      <h1 className="h1-lg">{title}</h1>
      {lead && <p className="lg muted" style={{ marginTop: 12 }}>{lead}</p>}
      {children}
    </div>
  );
}

const Section = ({ id, title, children }: { id?: string; title: string; children: ReactNode }) => (
  <section id={id} style={{ scrollMarginTop: 16 }}><h2>{title}</h2>{children}</section>
);

const P = ({ children }: { children: string }) => <p>{t(children)}</p>;

export function Help() {
  const topics: [string, string, string[]][] = [
    ['booking', 'How booking works', [
      'Pick a place, choose a date and time (or dates for a hotel), add your details and confirm. Most places confirm instantly. Large groups and hotel stays are confirmed by the venue, and you see the answer in My bookings.',
      'You do not pay on the site. Prices shown are what you pay at the venue.',
    ]],
    ['cancellation', 'Cancellation policy', [
      'Each place sets how long before the visit you can cancel free of charge; the exact time is shown on the place page and on your booking. You can cancel or move a booking from My bookings, or with the link you received when booking as a guest.',
    ]],
    ['waitlist', 'Waitlist', [
      'If a day is fully booked, join the waitlist on the place page. When someone cancels, you get a notification and can book the freed spot.',
    ]],
    ['account', 'Account and security', [
      'Two-step verification adds a code from an authenticator app to every log-in. Turn it on in Profile → Security. Sessions end after 30 minutes of inactivity.',
    ]],
    ['safety', 'Safety & trust', [
      'Only guests who booked through the site and whose visit is completed can leave a review. Passwords are stored hashed and never shown to anyone.',
    ]],
  ];
  return (
    <Article title={t('Help centre')} lead={t('Answers to the most common questions. Did not find yours?')}>
      <p><Link className="link" to="/contact">{t('Write to us')}</Link></p>
      {topics.map(([id, title, paragraphs]) => (
        <Section key={id} id={id} title={t(title)}>{paragraphs.map((p) => <P key={p}>{p}</P>)}</Section>
      ))}
    </Article>
  );
}

export function About() {
  const facts: [string, string, string][] = [
    [I.calendar, 'Real availability', 'Every slot on the site is checked against the venue schedule before it is shown.'],
    [I.shield, 'No payment on the site', 'You pay the venue directly. We never ask for a card to book.'],
    [I.starLine, 'Honest reviews', 'Only guests whose visit is completed can review a place.'],
  ];
  return (
    <Article title={t('About qwerttclients')} lead={t('One place to book restaurants, salons, hotels, sports and events in Tashkent.')}>
      <P>{'We started qwerttclients because booking a table, a haircut and a tennis court meant three apps and two phone calls. Here every place shows the same kind of calendar, and the steps adapt to what you book.'}</P>
      <div className="col g16" style={{ margin: '24px 0' }}>
        {facts.map(([icon, title, text]) => (
          <div key={title} className="card row g12 start" style={{ padding: 16 }}>
            <Icon n={icon} size={24} color="var(--accent)" />
            <div className="col"><span className="b">{t(title)}</span><span className="muted">{t(text)}</span></div>
          </div>
        ))}
      </div>
      <Section title={t('Work with us')}>
        <p><Link className="link" to="/partners">{t('List your business')}</Link> · <Link className="link" to="/careers">{t('Careers')}</Link> · <Link className="link" to="/press">{t('Press')}</Link></p>
      </Section>
    </Article>
  );
}

export function Contact() {
  const { user } = useApp();
  const [v, setV] = useState({ name: user ? `${user.firstName} ${user.lastName}`.trim() : '', email: user?.email ?? '', topic: 'booking', message: '' });
  const [sent, setSent] = useState(false);
  const form = useSubmit();
  useTitle(t('Contact us'));
  const submit = async (e: FormEvent) => { e.preventDefault(); if (await form.run(() => api.contact(v))) setSent(true); };
  const f = form.fields;
  return (
    <div className="page row start" style={{ gap: 48, paddingTop: 40, paddingBottom: 64 }}>
      <div className="col g16 grow">
        <h1 className="h1-lg">{t('Contact us')}</h1>
        <p className="lg muted">{t('We answer within one working day.')}</p>
        {sent ? (
          <Banner kind="success" title={t('Message sent')}>{t('Thank you. We will reply to {email}.', { email: v.email })}</Banner>
        ) : (
          <form className="card col g16 card-p24" onSubmit={submit} noValidate>
            <div className="row g16 start">
              <Field label={t('Your name')} error={f.name}><TextInput value={v.name} onChange={(x) => setV({ ...v, name: x })} error={!!f.name} autoComplete="name" /></Field>
              <Field label={t('Email')} error={f.email}><TextInput type="email" icon={I.mail} value={v.email} onChange={(x) => setV({ ...v, email: x })} error={!!f.email} autoComplete="email" placeholder="name@mail.com" /></Field>
            </div>
            <Field label={t('Topic')}>
              <div className="input">
                <select value={v.topic} onChange={(e) => setV({ ...v, topic: e.target.value })}>
                  <option value="booking">{t('A booking')}</option>
                  <option value="account">{t('My account')}</option>
                  <option value="business">{t('Business partnership')}</option>
                  <option value="other">{t('Something else')}</option>
                </select>
              </div>
            </Field>
            <Field label={t('Message')} error={f.message}>
              <div className={`input ta ${f.message ? 'error' : ''}`} style={{ height: 140 }}><textarea value={v.message} maxLength={2000} onChange={(e) => setV({ ...v, message: e.target.value })} placeholder={t('How can we help?')} /></div>
            </Field>
            {form.error && !Object.keys(f).length && <Banner kind="danger" title={t('Could not send')}>{form.error.message}</Banner>}
            <div><button type="submit" className="btn btn-primary" disabled={form.busy}><Icon n={I.send} /> {t('Send message')}</button></div>
          </form>
        )}
      </div>
      <aside className="col g16" style={{ width: 340 }}>
        <div className="card col g12" style={{ padding: 16 }}>
          <span className="h3">{t('About a booking?')}</span>
          <span className="muted sm">{t('The venue can answer fastest: its phone number is on your booking page.')}</span>
          <Link to="/account/bookings" className="btn btn-secondary btn-sm">{t('My bookings')}</Link>
        </div>
        <div className="card col g8" style={{ padding: 16 }}>
          <span className="row g8 muted"><Icon n={I.mail} /> support@qwerttclients.example</span>
          <span className="row g8 muted"><Icon n={I.pin} /> {t('Tashkent, Uzbekistan')}</span>
        </div>
      </aside>
    </div>
  );
}

const CATEGORY_OPTIONS = ['restaurants', 'cafes', 'beauty', 'wellness', 'hotels', 'sports', 'events', 'health', 'coworking'];
const CATEGORY_NAMES: Record<string, string> = {
  restaurants: 'Restaurants', cafes: 'Cafes', beauty: 'Beauty', wellness: 'Wellness', hotels: 'Hotels', sports: 'Sports', events: 'Events', health: 'Health', coworking: 'Coworking',
};

export function Partners() {
  const [v, setV] = useState({ business: '', category: 'restaurants', contactName: '', email: '', phone: '', neighbourhood: NEIGHBOURHOOD_NAMES[0]!, message: '' });
  const [sent, setSent] = useState(false);
  const form = useSubmit();
  useTitle(t('List your business'));
  const f = form.fields;
  const set = (patch: Partial<typeof v>) => setV({ ...v, ...patch });
  const steps: [string, string][] = [
    ['Send the form', 'Tell us about your place. It takes two minutes.'],
    ['We call you', 'Within two working days we agree on tables, services or rooms.'],
    ['Go live', 'Your page and online booking open. Bookings appear in the partner dashboard.'],
  ];
  return (
    <div className="page col g32" style={{ paddingTop: 40, paddingBottom: 64 }}>
      <section className="card row between hero" style={{ padding: '32px 40px', borderColor: 'transparent' }}>
        <div className="col g8" style={{ maxWidth: 640 }}>
          <h1 className="h1-lg">{t('Run a restaurant, salon, hotel or club?')}</h1>
          <p className="lg">{t('Take bookings online and manage your day in one schedule. No setup fee.')}</p>
        </div>
        <Icon n={I.briefcase} size={64} color="#9DB7DB" sw={1.2} />
      </section>
      <div className="row start" style={{ gap: 48 }}>
        <div className="col g16" style={{ width: 340 }}>
          <h2 className="h2">{t('How it works')}</h2>
          {steps.map(([title, text], i) => (
            <div key={title} className="row g12 start">
              <span className="avatar">{i + 1}</span>
              <div className="col"><span className="b">{t(title)}</span><span className="muted sm">{t(text)}</span></div>
            </div>
          ))}
          <Link to="/business" className="link">{t('Already a partner? Open the dashboard')}</Link>
        </div>
        <div className="grow">
          {sent ? (
            <Banner kind="success" title={t('Request received')}>{t('We will contact {name} at {phone} within two working days.', { name: v.contactName, phone: v.phone })}</Banner>
          ) : (
            <form className="card col g16 card-p24" noValidate onSubmit={async (e) => { e.preventDefault(); if (await form.run(() => api.partner(v))) setSent(true); }}>
              <h2 className="h2">{t('Tell us about your place')}</h2>
              <div className="row g16 start">
                <Field label={t('Business name')} error={f.business}><TextInput value={v.business} onChange={(x) => set({ business: x })} error={!!f.business} /></Field>
                <Field label={t('Category')}>
                  <div className="input"><select value={v.category} onChange={(e) => set({ category: e.target.value })}>
                    {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{t(CATEGORY_NAMES[c]!)}</option>)}
                  </select></div>
                </Field>
              </div>
              <div className="row g16 start">
                <Field label={t('Neighbourhood')}>
                  <div className="input"><select value={v.neighbourhood} onChange={(e) => set({ neighbourhood: e.target.value })}>
                    {NEIGHBOURHOOD_NAMES.map((n) => <option key={n} value={n}>{t(n)}</option>)}
                  </select></div>
                </Field>
                <Field label={t('Your name')} error={f.contactName}><TextInput value={v.contactName} onChange={(x) => set({ contactName: x })} error={!!f.contactName} autoComplete="name" /></Field>
              </div>
              <div className="row g16 start">
                <Field label={t('Email')} error={f.email}><TextInput type="email" icon={I.mail} value={v.email} onChange={(x) => set({ email: x })} error={!!f.email} placeholder="name@mail.com" autoComplete="email" /></Field>
                <Field label={t('Phone')} error={f.phone}><TextInput type="tel" icon={I.phone} value={v.phone} onChange={(x) => set({ phone: x })} error={!!f.phone} placeholder="+998 90 123 45 67" autoComplete="tel" /></Field>
              </div>
              <Field label={t('Anything we should know? (optional)')}>
                <div className="input ta"><textarea value={v.message} maxLength={2000} onChange={(e) => set({ message: e.target.value })} placeholder={t('Number of tables, services, opening hours…')} /></div>
              </Field>
              {form.error && !Object.keys(f).length && <Banner kind="danger" title={t('Could not send')}>{form.error.message}</Banner>}
              <div><button type="submit" className="btn btn-primary btn-lg" disabled={form.busy}>{t('Send request')}</button></div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export function Apps() {
  return (
    <Article title={t('qwerttclients on your phone')} lead={t('The mobile apps for iPhone and Android are in development.')}>
      <div className="row g16" style={{ margin: '24px 0' }}>
        {['App Store', 'Google Play'].map((store) => (
          <div key={store} className="card col g8 grow" style={{ padding: 20 }}>
            <Icon n={I.phoneApp} size={28} color="var(--accent)" />
            <span className="h3">{store}</span>
            <span className="badge info" style={{ alignSelf: 'flex-start' }}>{t('Coming soon')}</span>
          </div>
        ))}
      </div>
      <P>{'Until then, the website does everything the apps will: search, booking, changes and cancellations, notifications and the partner dashboard.'}</P>
      <p><Link className="btn btn-primary" to="/">{t('Start booking')}</Link></p>
    </Article>
  );
}

export function Careers() {
  return (
    <Article title={t('Careers')} lead={t('We are a small team in Tashkent building booking for every kind of place.')}>
      <Empty icon={I.briefcase} title={t('No open positions right now')}>
        {t('We still like hearing from engineers, designers and partner managers. Send a short note and a link to your work.')}
      </Empty>
      <p style={{ marginTop: 16 }}><a className="link" href="mailto:jobs@qwerttclients.example">jobs@qwerttclients.example</a></p>
    </Article>
  );
}

const COLORS: [string, string][] = [['Accent', '#0C66E4'], ['Accent press', '#09326C'], ['Ink', '#172B4D'], ['Background', '#F7F8F9'], ['Success', '#216E4E'], ['Warning', '#7F5F01']];
const LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="48" viewBox="0 0 240 48"><rect x="4" y="12" width="24" height="24" rx="5" fill="#0C66E4"/><text x="38" y="32" font-family="Source Sans 3, Arial, sans-serif" font-size="22" font-weight="700" fill="#172B4D">qwerttclients</text></svg>';

export function Press() {
  const logoUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(LOGO_SVG)}`;
  return (
    <Article title={t('Press')} lead={t('Logo, colours and a short description you can use in articles.')}>
      <Section title={t('Logo')}>
        <div className="card row between" style={{ padding: 24, background: '#fff' }}>
          <img src={logoUrl} alt="qwerttclients" width={240} height={48} />
          <a className="btn btn-secondary btn-sm" href={logoUrl} download="qwerttclients-logo.svg"><Icon n={I.download} size={14} /> {t('Download SVG')}</a>
        </div>
      </Section>
      <Section title={t('Colours')}>
        <div className="grid3">
          {COLORS.map(([name, hex]) => (
            <div key={hex} className="card row g12" style={{ padding: 12 }}>
              <span style={{ width: 32, height: 32, borderRadius: 'var(--r)', background: hex, border: '1px solid var(--line)' }} />
              <div className="col"><span className="sb">{t(name)}</span><code className="sm subtle">{hex}</code></div>
            </div>
          ))}
        </div>
      </Section>
      <Section title={t('About in one paragraph')}>
        <P>{'qwerttclients is a booking platform for Tashkent: restaurants and cafes, salons and clinics, hotels, sports courts and events in one place, with real-time availability and free cancellation where the venue allows it.'}</P>
      </Section>
      <p>{t('Press contact')}: <a className="link" href="mailto:press@qwerttclients.example">press@qwerttclients.example</a></p>
    </Article>
  );
}

export const POSTS: { slug: string; title: string; date: string; lead: string; body: string[] }[] = [
  {
    slug: 'group-dinner', title: 'How to book a table for a big group', date: '2026-10-01',
    lead: 'Groups of eight or more need a little planning. Here is what works.',
    body: [
      'Book at least two days ahead for weekends. Large tables are few, and restaurants confirm group bookings by hand.',
      'Mention the occasion in special requests: birthdays, high chairs and dietary needs help the restaurant prepare.',
      'If the day is full, join the waitlist. Cancellations happen more often than you think.',
    ],
  },
  {
    slug: 'first-spa-visit', title: 'Your first spa visit: what to expect', date: '2026-09-20',
    lead: 'Arrive early, choose the right length and tell the therapist what you need.',
    body: [
      'Arrive ten minutes before the start: changing and a short talk with the therapist take time.',
      'Sixty minutes is enough for a full-body massage; ninety minutes suits deep tissue work.',
      'If you choose "Any specialist", you get the first free time — often the same day.',
    ],
  },
  {
    slug: 'tennis-courts', title: 'Indoor or outdoor court: how to choose', date: '2026-09-05',
    lead: 'Surface, weather and time of day matter more than the price.',
    body: [
      'Hard courts are faster and suit beginners who want a predictable bounce. Clay is slower and kinder to joints.',
      'Outdoor courts are cheaper but book them early in the morning or in the evening when it is cooler.',
      'Ninety minutes is the sweet spot for two players: time to warm up and play a full set.',
    ],
  },
];

export function Blog() {
  useTitle(t('Blog'));
  return (
    <div className="page col g24" style={{ paddingTop: 40, paddingBottom: 64 }}>
      <h1 className="h1-lg">{t('Blog')}</h1>
      <p className="lg muted">{t('Guides for booking smarter.')}</p>
      <div className="grid3 stagger" style={{ gap: 16 }}>
        {POSTS.map((p) => (
          <Link key={p.slug} to={`/blog/${p.slug}`} className="card col g8 place-card" style={{ padding: 20 }}>
            <Icon n={I.book} size={22} color="var(--accent)" />
            <span className="h3">{t(p.title)}</span>
            <span className="muted sm">{t(p.lead)}</span>
            <span className="sm subtle" style={{ marginTop: 'auto' }}>{p.date}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function BlogPost() {
  const { slug } = useParams();
  const post = POSTS.find((p) => p.slug === slug);
  if (!post) return <NotFound />;
  return (
    <Article title={t(post.title)} lead={t(post.lead)}>
      {post.body.map((p) => <P key={p}>{p}</P>)}
      <p><Link className="link" to="/blog">← {t('All articles')}</Link></p>
    </Article>
  );
}

export function Terms() {
  return (
    <Article title={t('Terms')}>
      <P>{'By booking you agree to arrive on time and to follow the venue’s cancellation policy. A venue may release a table or slot if you are late beyond its holding time.'}</P>
      <P>{'Bookings are free. Prices on the site are set by venues and paid at the venue. qwerttclients is not a party to the service you receive.'}</P>
      <P>{'Reviews must describe your own visit. We remove reviews that are abusive or not about the place.'}</P>
    </Article>
  );
}

export function Privacy() {
  return (
    <Article title={t('Privacy')}>
      <P>{'We store the contact details you enter so the venue can identify your booking. Venues see your name, phone, email and special requests for their own bookings only.'}</P>
      <P>{'You can delete your account in Settings; upcoming bookings are cancelled and your history is anonymised.'}</P>
      <P>{'We do not sell personal data and do not use advertising trackers.'}</P>
    </Article>
  );
}

export function Cookies() {
  return (
    <Article title={t('Cookies')}>
      <P>{'We use one cookie: the session cookie that keeps you logged in. It is removed when you log out or after 30 minutes of inactivity.'}</P>
      <P>{'Your language, theme and booking draft are kept in your browser storage on this device only.'}</P>
    </Article>
  );
}

export function Credits() {
  useTitle(t('Photo credits'));
  return (
    <div className="page col g24" style={{ paddingTop: 40, paddingBottom: 64 }}>
      <div className="col g8">
        <h1 className="h1-lg">{t('Photo credits')}</h1>
        <p className="lg muted">{t('Photos on this site are from Unsplash and are used under the Unsplash License. Thank you to the photographers.')} <a className="link" href={UNSPLASH_URL} target="_blank" rel="noreferrer">unsplash.com</a></p>
      </div>
      <div className="grid4 stagger">
        {Object.entries(PHOTOS).map(([key, p]) => (
          <a key={key} className="card col place-card" href={`https://unsplash.com/photos/${p.id}?utm_source=qwerttclients&utm_medium=referral`} target="_blank" rel="noreferrer">
            <div style={{ position: 'relative', height: 120, overflow: 'hidden' }}>
              <img src={photoUrl(key)} alt={p.alt} loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div className="col" style={{ padding: 10 }}>
              <span className="sm sb">{p.author}</span>
              <span className="sm subtle">{p.alt}</span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

export function NotFound() {
  useTitle(t('Page not found'));
  return (
    <div className="page" style={{ paddingTop: 64, paddingBottom: 64 }}>
      <Empty icon={I.search} title={t('Page not found')} action={<Link to="/" className="btn btn-primary btn-sm">{t('Back to Explore')}</Link>}>
        {t('The link may be outdated or the page was moved.')}
      </Empty>
    </div>
  );
}
