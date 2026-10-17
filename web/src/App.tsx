// Маршруты приложения. При смене языка дерево страниц перестраивается, чтобы весь текст сменился сразу.
import { Fragment } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PrefsProvider } from './i18n.tsx';
import { Intro, introShown } from './splash.tsx';
import { AccountLayout, AuthShell, Shell } from './layout.tsx';
import { BookingDetail, Confirmation, MyBookings, Notifications, Payments, Profile, Saved, Settings } from './pages/Account.tsx';
import { Forgot, Login, Reset, Signup } from './pages/Auth.tsx';
import { Book } from './pages/Book.tsx';
import { Business } from './pages/Business.tsx';
import { Categories, Home } from './pages/Home.tsx';
import { About, Apps, Blog, BlogPost, Careers, Contact, Cookies, Credits, Help, NotFound, Partners, Press, Privacy, Terms } from './pages/Info.tsx';
import { Examples } from './pages/Examples.tsx';
import { Place } from './pages/Place.tsx';
import { Results } from './pages/Results.tsx';
import { AppProvider } from './state.tsx';

export function App() {
  return (
    <PrefsProvider>
      {(lang) => (
        <AppProvider>
          <Intro />
          <div className={introShown ? 'site-in shell' : 'shell'}>
            <Fragment key={lang}>
              <Routes>
                <Route element={<Shell />}>
                  <Route path="/" element={<Home />} />
                  <Route path="/categories" element={<Categories />} />
                  <Route path="/search" element={<Results />} />
                  <Route path="/place/:slug" element={<Place />} />
                  <Route path="/confirmation/:ref" element={<Confirmation />} />
                  <Route path="/account/bookings/:ref" element={<BookingDetail />} />
                  <Route path="/help" element={<Help />} />
                  <Route path="/examples" element={<Examples />} />
                  <Route path="/about" element={<About />} />
                  <Route path="/contact" element={<Contact />} />
                  <Route path="/partners" element={<Partners />} />
                  <Route path="/apps" element={<Apps />} />
                  <Route path="/careers" element={<Careers />} />
                  <Route path="/press" element={<Press />} />
                  <Route path="/blog" element={<Blog />} />
                  <Route path="/blog/:slug" element={<BlogPost />} />
                  <Route path="/terms" element={<Terms />} />
                  <Route path="/privacy" element={<Privacy />} />
                  <Route path="/cookies" element={<Cookies />} />
                  <Route path="/credits" element={<Credits />} />
                  <Route path="/account" element={<AccountLayout />}>
                    <Route index element={<Navigate to="/account/bookings" replace />} />
                    <Route path="profile" element={<Profile />} />
                    <Route path="bookings" element={<MyBookings />} />
                    <Route path="saved" element={<Saved />} />
                    <Route path="notifications" element={<Notifications />} />
                    <Route path="payments" element={<Payments />} />
                    <Route path="settings" element={<Settings />} />
                  </Route>
                  <Route path="*" element={<NotFound />} />
                </Route>
                <Route element={<Shell footer={false} />}>
                  <Route path="/book/:slug/:step?" element={<Book />} />
                </Route>
                <Route element={<AuthShell />}>
                  <Route path="/login" element={<Login />} />
                  <Route path="/signup" element={<Signup />} />
                  <Route path="/forgot" element={<Forgot />} />
                  <Route path="/reset" element={<Reset />} />
                </Route>
                <Route path="/business/:section?" element={<Business />} />
              </Routes>
            </Fragment>
          </div>
        </AppProvider>
      )}
    </PrefsProvider>
  );
}
