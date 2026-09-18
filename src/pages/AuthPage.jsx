import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { ArrowRight, Check, Package, Send } from 'lucide-react';
import { Brand } from '../layout';
import { useAuth } from '../auth';
import { api } from '../api';
import { Field, inputProps, SubmitButton, ErrorState } from '../components';
import { registerSchema, loginSchema, fieldErrors } from '../../shared/validation';

export default function AuthPage({ register = false }) {
  const { user, setUser } = useAuth();
  const location = useLocation();
  const [role, setRole] = useState('BUYER');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const from = location.state?.from;
  if (user)
    return (
      <Navigate
        to={
          typeof from === 'string' && from.startsWith('/') && !from.startsWith('//')
            ? from
            : '/rfqs'
        }
        replace
      />
    );
  async function submit(event) {
    event.preventDefault();
    setError(null);
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (register) data.role = role;
    const result = (register ? registerSchema : loginSchema).safeParse(data);
    if (!result.success) {
      setErrors(fieldErrors(result.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      setUser(
        (
          await api(`/auth/${register ? 'register' : 'login'}`, {
            method: 'POST',
            body: result.data,
          })
        ).user,
      );
    } catch (error) {
      setError(error);
      setErrors(error.fields || {});
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-shell">
      <aside className="auth-story">
        <Brand light />
        <div className="story-main">
          <span className="story-kicker">A BETTER WAY TO SOURCE</span>
          <h1>
            Great business starts with a clear request<span>.</span>
          </h1>
          <p>One focused place to connect what you need with the people who can deliver it.</p>
          <div className="story-flow">
            <div>
              <span>
                <Package size={23} />
              </span>
              <strong>Share a requirement</strong>
              <p>Give suppliers the details that matter.</p>
            </div>
            <div className="flow-line" />
            <div>
              <span>
                <Send size={22} />
              </span>
              <strong>Connect through quotations</strong>
              <p>Keep every response with its request.</p>
            </div>
          </div>
        </div>
        <div className="story-foot">
          <Check size={16} /> Purpose-built for buyers and suppliers
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-mobile-brand">
          <Brand />
        </div>
        <div className="auth-form-wrap">
          <div className="eyebrow">YOUR SOURCING WORKSPACE</div>
          <h1>{register ? 'Let’s get you started.' : 'Welcome back.'}</h1>
          <p className="auth-subtitle">
            {register
              ? 'Create an account and bring your next requirement to life.'
              : 'Log in to pick up where you left off.'}
          </p>
          <form
            noValidate
            onSubmit={submit}
            onChange={(event) =>
              setErrors((current) => ({ ...current, [event.target.name]: undefined }))
            }
          >
            {register && (
              <>
                <fieldset className="role-fieldset">
                  <legend>I’m here as a</legend>
                  <div className="role-options">
                    {['BUYER', 'SUPPLIER'].map((value) => (
                      <label
                        key={value}
                        className={role === value ? 'role-option selected' : 'role-option'}
                      >
                        <input
                          type="radio"
                          name="role"
                          value={value}
                          checked={role === value}
                          onChange={() => setRole(value)}
                        />
                        <strong>{value === 'BUYER' ? 'Buyer' : 'Supplier'}</strong>
                        <span>
                          {value === 'BUYER' ? 'Post requests for quotes' : 'Respond to requests'}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <Field label="Full name" name="name" errors={errors}>
                  <input
                    {...inputProps('name', errors)}
                    autoComplete="name"
                    placeholder="Your full name"
                    maxLength={100}
                    required
                  />
                </Field>
              </>
            )}
            <Field label="Email address" name="email" errors={errors}>
              <input
                {...inputProps('email', errors)}
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                maxLength={254}
                required
              />
            </Field>
            <Field
              label="Password"
              name="password"
              errors={errors}
              hint={register ? 'At least 8 characters. Make it unique to this account.' : undefined}
            >
              <input
                {...inputProps('password', errors, register)}
                type="password"
                autoComplete={register ? 'new-password' : 'current-password'}
                placeholder={register ? 'Create a secure password' : 'Enter your password'}
                maxLength={128}
                required
              />
            </Field>
            {error && <ErrorState error={error} />}
            <SubmitButton busy={busy} busyText={register ? 'Creating account…' : 'Logging in…'}>
              {register ? 'Create account' : 'Log in'}
              <ArrowRight size={18} />
            </SubmitButton>
          </form>
          <p className="auth-switch">
            {register ? 'Already have an account?' : 'New to Sourcewell?'}{' '}
            <Link to={register ? '/login' : '/register'}>
              {register ? 'Log in' : 'Create an account'}
            </Link>
          </p>
        </div>
        <p className="auth-bottom">Less back-and-forth. More moving forward.</p>
      </main>
    </div>
  );
}
