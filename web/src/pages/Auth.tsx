// Макеты «14 · Вход», «15 · Регистрация», «16 · Сброс пароля», «17 · Состояния авторизации».
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.ts';
import { useApp } from '../state.tsx';
import { Banner, Check, Field, I, Icon, PasswordInput, Spinner, TextInput, useSubmit } from '../ui.tsx';
import { t } from '../i18n.tsx';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function Card({ children, title, note, top = 56 }: { children: ReactNode; title: string; note: ReactNode; top?: number }) {
  useEffect(() => { document.title = `${title} — qwerttclients`; }, [title]);
  return (
    <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: `${top}px 0` }}>
      <div className="card raised col g16" style={{ width: 400, padding: 32 }}>
        <div className="col g4"><h1 className="h1">{title}</h1><span className="muted">{note}</span></div>
        {children}
      </div>
    </div>
  );
}

/** Вход через Google и Apple требует ключей OAuth, которых в проекте нет: кнопки честно сообщают об этом. */
function Social() {
  const [msg, setMsg] = useState('');
  return (
    <>
      <div className="row g12"><hr className="hr grow" /><span className="sm subtle">{t("or")}</span><hr className="hr grow" /></div>
      <div className="row g8">
        {['Google', 'Apple'].map((name) => (
          <button type="button" key={name} className="btn btn-secondary grow" onClick={() => setMsg(t('{name} sign-in is not set up on this server yet. Use email and password.', { name }))}>{name}</button>
        ))}
      </div>
      {msg && <span className="help" role="status">{msg}</span>}
    </>
  );
}

/** После входа возвращаем туда, откуда пришли; внешние адреса не принимаются. */
function useNext() {
  const [sp] = useSearchParams();
  const next = sp.get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/account/bookings';
}

export function Login() {
  const { setUser, user } = useApp();
  const navigate = useNavigate();
  const next = useNext();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [local, setLocal] = useState<Record<string, string>>({});
  const [ticket, setTicket] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const form = useSubmit();
  useEffect(() => { if (user) navigate(next, { replace: true }); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!EMAIL.test(email.trim())) errs.email = t('Enter a valid email, like name@mail.com');
    if (!password) errs.password = t('Enter your password');
    setLocal(errs);
    if (Object.keys(errs).length) return;
    const r = await form.run(() => api.login(email, password));
    if (r && 'ticket' in r) setTicket(r.ticket);
    else if (r) setUser(r.user);
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    const r = await form.run(() => api.login2fa(ticket!, otp));
    if (r) setUser(r.user);
    else if (form.error?.code === 'ticket_expired') setTicket(null);
  };
  const code = form.error?.code;
  const fields = { ...form.fields, ...local };

  if (ticket) {
    return (
      <Card title={t('Two-step verification')} note={t('Enter the 6-digit code from your authenticator app.')}>
        <span style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--accent-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center', order: -1 }}>
          <Icon n={I.shield} size={24} color="var(--accent)" />
        </span>
        {form.error && form.error.code !== 'validation' && <Banner kind="danger" title={t('Could not log in')}>{form.error.message}</Banner>}
        <form className="col g16" onSubmit={verify} noValidate>
          <Field label={t('Code')} error={form.fields.code}>
            <TextInput value={otp} onChange={(v) => setOtp(v.replace(/[^\d]/g, '').slice(0, 6))} error={!!form.fields.code} autoComplete="one-time-code" placeholder="123456" autoFocus />
          </Field>
          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={form.busy || otp.length !== 6}>{form.busy ? <><Spinner /> {t('Checking…')}</> : t('Verify and log in')}</button>
        </form>
        <button type="button" className="link" onClick={() => { setTicket(null); setOtp(''); form.clear(); }}>{t('Use another account')}</button>
      </Card>
    );
  }

  return (
    <Card title={t("Log in")} note={t("Welcome back. Manage your bookings in one place.")}>
      {code === 'bad_credentials' && (
        <Banner kind="danger" title={t("Incorrect email or password")}>{t("Check your details or")}{' '}<Link className="link" to="/forgot">{t("reset your password")}</Link>.</Banner>
      )}
      {code === 'rate_limited' && <Banner kind="warn" icon={I.lock} title={t("Too many attempts")}>{form.error!.message}</Banner>}
      {form.error && code !== 'bad_credentials' && code !== 'rate_limited' && code !== 'validation' && <Banner kind="danger" title={t("Could not log in")}>{form.error.message}</Banner>}
      <form className="col g16" onSubmit={submit} noValidate>
        <Field label={t("Email")} error={fields.email}>
          <TextInput type="email" value={email} onChange={setEmail} error={!!fields.email} disabled={form.busy} autoComplete="email" placeholder="name@mail.com" autoFocus />
        </Field>
        <Field label={t("Password")} error={fields.password} aside={<Link to="/forgot" className="link sm">{t("Forgot password?")}</Link>}>
          <PasswordInput value={password} onChange={setPassword} error={!!fields.password} disabled={form.busy} />
        </Field>
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={form.busy} style={form.busy ? { background: 'var(--accent)', color: 'var(--on-accent)', opacity: 0.8 } : undefined}>
          {form.busy ? <><Spinner />{' '}{t("Logging in…")}</> : t("Log in")}
        </button>
      </form>
      <Social />
      <span className="muted" style={{ textAlign: 'center' }}>{t("New here?")}{' '}<Link to={`/signup?next=${encodeURIComponent(next)}`} className="link">{t("Create an account")}</Link></span>
    </Card>
  );
}

function Strength({ password }: { password: string }) {
  const rules: [string, boolean][] = [[t('8+ characters'), password.length >= 8], [t('A number'), /\d/.test(password)], [t('A symbol'), /[^A-Za-z0-9]/.test(password)]];
  const score = rules.filter(([, ok]) => ok).length + (password.length >= 12 ? 1 : 0);
  return (
    <div className="col g8">
      <div className="row g4" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => <span key={i} className="grow" style={{ height: 4, borderRadius: 2, background: i < score ? 'var(--success)' : 'var(--line)' }} />)}
      </div>
      <div className="row g16 sm">
        {rules.map(([label, ok]) => <span key={label} className={`row g4 ${ok ? 'ok' : 'subtle'}`}><Icon n={ok ? I.check : I.minus} size={12} /> {label}</span>)}
      </div>
    </div>
  );
}

export function Signup() {
  const { setUser, user } = useApp();
  const navigate = useNavigate();
  const next = useNext();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agree, setAgree] = useState(false);
  const form = useSubmit();
  useEffect(() => { if (user) navigate(next, { replace: true }); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps
  const f = form.fields;
  return (
    <Card title={t("Create your account")} note={t("Takes under a minute. No card needed.")} top={48}>
      <form className="col g16" noValidate onSubmit={async (e) => { e.preventDefault(); const r = await form.run(() => api.signup({ name, email, password, agree })); if (r) setUser(r.user); }}>
        <Field label={t("Full name")} error={f.name}><TextInput value={name} onChange={setName} error={!!f.name} ok={name.trim().length >= 2} autoComplete="name" autoFocus /></Field>
        <Field label={t("Email")} error={f.email}>
          <TextInput type="email" value={email} onChange={setEmail} error={!!f.email} ok={EMAIL.test(email.trim()) && !f.email} autoComplete="email" placeholder="name@mail.com" />
        </Field>
        {form.error?.code === 'email_exists' && <Link to={`/login?next=${encodeURIComponent(next)}`} className="link sm" style={{ marginTop: -8 }}>{t("Log in with this email")}</Link>}
        <Field label={t("Password")} error={f.password}><PasswordInput value={password} onChange={setPassword} error={!!f.password} placeholder={t("Create a password")} autoComplete="new-password" /></Field>
        <Strength password={password} />
        <Check checked={agree} onChange={setAgree} align="start">
          <span className="muted sm">{t("I agree to the")}{' '}<Link className="link" to="/help#terms" target="_blank">{t("Terms")}</Link>{' '}{t("and")}{' '}<Link className="link" to="/help#privacy" target="_blank">{t("Privacy Policy")}</Link>.</span>
        </Check>
        {f.agree && <span className="help err"><Icon n={I.alert} size={12} />{f.agree}</span>}
        {form.error && !Object.keys(f).length && <Banner kind="danger" title={t("Could not create the account")}>{form.error.message}</Banner>}
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={form.busy}>{form.busy ? <><Spinner color="var(--ink-3)" />{' '}{t("Creating…")}</> : t("Create account")}</button>
      </form>
      <Social />
      <span className="muted" style={{ textAlign: 'center' }}>{t("Already have an account?")}{' '}<Link to={`/login?next=${encodeURIComponent(next)}`} className="link">{t("Log in")}</Link></span>
    </Card>
  );
}

export function Forgot() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<{ devLink?: string; minutes: number } | null>(null);
  const [wait, setWait] = useState(0);
  const form = useSubmit();
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  const send = async () => {
    const r = await form.run(() => api.forgot(email));
    if (r) { setSent({ devLink: r.devLink, minutes: r.expiresInMinutes }); setWait(45); }
  };
  if (sent) {
    return (
      <Card title={t("Check your email")} note={<>{t("If an account exists for")}{' '}<b style={{ color: 'var(--ink)' }}>{email}</b>{t(", a reset link is on its way. It expires in")}{' '}{sent.minutes}{' '}{t("minutes.")}</>}>
        <span style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--success-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center', order: -1 }}>
          <Icon n={I.mail} size={24} color="var(--success)" />
        </span>
        {sent.devLink && (
          <Banner kind="info" title={t("Development mode")}>
            {t("No mail service is connected, so the link is shown here:")}{' '}<Link className="link" to={sent.devLink}>{t("open reset link")}</Link>.
          </Banner>
        )}
        <span className="muted sm" style={{ textAlign: 'center' }}>
          {t("No email? Check spam or")}{' '}{wait > 0 ? t("resend in 0:{a}", { a: String(wait).padStart(2, '0') }) : <button type="button" className="link" onClick={() => void send()}>{t("resend")}</button>}
        </span>
        <Link to="/login" className="btn btn-secondary btn-block">{t("Back to log in")}</Link>
      </Card>
    );
  }
  return (
    <Card title={t("Reset password")} note={t("Enter your email and we'll send a link to set a new password.")}>
      <Link to="/login" className="row g4 sb muted" style={{ order: -1 }}><Icon n={I.left} />{' '}{t("Back to log in")}</Link>
      <form className="col g16" noValidate onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <Field label={t("Email")} error={form.fields.email}>
          <TextInput type="email" icon={I.mail} value={email} onChange={setEmail} error={!!form.fields.email} autoComplete="email" placeholder="name@mail.com" autoFocus />
        </Field>
        {form.error && !form.fields.email && <Banner kind="danger" title={t("Could not send the link")}>{form.error.message}</Banner>}
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={form.busy}>{t("Send reset link")}</button>
      </form>
    </Card>
  );
}

export function Reset() {
  const { setUser } = useApp();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const form = useSubmit();
  const token = sp.get('token') ?? '';
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMismatch(password !== repeat);
    if (password !== repeat) return;
    const r = await form.run(() => api.reset(token, password));
    if (r) { setUser(r.user); navigate('/account/profile', { replace: true }); }
  };
  return (
    <Card title={t("New password")} note={t("Choose something you do not use elsewhere.")}>
      {(form.error?.code === 'reset_invalid' || !token) && (
        <Banner kind="danger" title={t("This link no longer works")}>{t("Reset links expire after 30 minutes and work once.")}{' '}<Link className="link" to="/forgot">{t("Request a new one")}</Link>.</Banner>
      )}
      <form className="col g16" noValidate onSubmit={submit}>
        <Field label={t("New password")} error={form.fields.password}><PasswordInput value={password} onChange={setPassword} error={!!form.fields.password} placeholder={t("Create a password")} autoComplete="new-password" /></Field>
        <Strength password={password} />
        <Field label={t("Repeat password")} error={mismatch ? 'Passwords do not match' : undefined}><PasswordInput value={repeat} onChange={setRepeat} error={mismatch} placeholder={t("Repeat the password")} autoComplete="new-password" /></Field>
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={form.busy || !token}>{t("Save and log in")}</button>
      </form>
    </Card>
  );
}
