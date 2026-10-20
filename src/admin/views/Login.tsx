import { useState } from 'preact/hooks';
import type { AdminApi } from '../types';

export function Login({ api }: { api: AdminApi }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'forgot' | 'sent'>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') await api.signIn(email.trim(), password);
      else { await api.sendPasswordReset(email.trim()); setMode('sent'); }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="login">
      <img src="/img/site/logo.webp" alt="BeadedByChar" width="160" height="83" class="login-logo" />
      <form class="card narrow" onSubmit={submit}>
        <h1>{mode === 'login' ? 'Shop admin' : 'Reset your password'}</h1>
        {api.demo && <p class="muted">Demo mode: any email and password will do.</p>}
        {mode === 'sent' ? (
          <>
            <p>If {email} has an admin account, a link to set a new password is on its way. Check your inbox (and spam).</p>
            <button type="button" class="btn" onClick={() => setMode('login')}>Back to sign in</button>
          </>
        ) : (
          <>
            <label>Email<input type="email" required autocomplete="username" value={email} onInput={e => setEmail(e.currentTarget.value)} /></label>
            {mode === 'login' && <label>Password<input type="password" required={!api.demo} autocomplete="current-password" value={password} onInput={e => setPassword(e.currentTarget.value)} /></label>}
            {error && <p class="error">{error}</p>}
            <button class="btn primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Email me a reset link'}</button>
            <button type="button" class="link" onClick={() => { setMode(mode === 'login' ? 'forgot' : 'login'); setError(''); }}>
              {mode === 'login' ? 'Forgot your password?' : 'Back to sign in'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}

export function NewPassword({ api, onDone }: { api: AdminApi; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: Event) => {
    e.preventDefault();
    if (password.length < 8) return setError('Use at least 8 characters.');
    setBusy(true);
    try { await api.setPassword(password); history.replaceState(null, '', '/admin/'); onDone(); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div class="login">
      <form class="card narrow" onSubmit={submit}>
        <h1>Choose a new password</h1>
        <label>New password<input type="password" autocomplete="new-password" required value={password} onInput={e => setPassword(e.currentTarget.value)} /></label>
        {error && <p class="error">{error}</p>}
        <button class="btn primary" disabled={busy}>Save password</button>
      </form>
    </div>
  );
}
