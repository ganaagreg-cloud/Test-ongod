import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Button, Input, Notice, useToast } from '@ongod/ui-web';
import { resendCode, verifyEmail } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { ErrorNotice } from '../components/ErrorNotice';
import { mn } from '../i18n/mn';
import { usePage } from '../lib/usePage';

const COOLDOWN_SECONDS = 60;

/**
 * Email code (SPEC A). Reached after registering (no session yet) or from the pages that need a
 * verified email (signed in). Either way the 6-digit code comes from the email.
 */
export default function Verify() {
  usePage({ title: mn.verify.metaTitle, noindex: true });
  const { status, user, reloadUser } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const state = (useLocation().state ?? {}) as {
    email?: string;
    next?: string;
    afterVerify?: 'login';
  };

  // What the visitor typed, if anything; otherwise the email from the register step or the session.
  const [emailInput, setEmailInput] = useState<string>();
  const email = emailInput ?? state.email ?? user?.email ?? '';
  const [code, setCode] = useState('');
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [codeError, setCodeError] = useState<string>();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  if (status === 'authenticated' && user?.emailVerified) {
    return (
      <div className="portal-page portal-narrow">
        <h1>{mn.verify.title}</h1>
        <Notice tone="success">{mn.verify.alreadyVerified}</Notice>
        <Link to={state.next ?? '/plans'} className="portal-linkbutton">
          {mn.verify.continue}
        </Link>
      </div>
    );
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) {
      setCodeError(mn.verify.errors.code);
      return;
    }
    setCodeError(undefined);
    setBusy(true);
    setError(undefined);
    try {
      await verifyEmail(email.trim(), code.trim());
      if (status === 'authenticated') {
        await reloadUser();
        navigate(state.next ?? '/plans', { replace: true });
      } else {
        navigate('/login?verified=1', { replace: true, state: { identifier: email.trim() } });
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(undefined);
    try {
      await resendCode(email.trim());
      toast.show(mn.verify.resent, { tone: 'success' });
      setCooldown(COOLDOWN_SECONDS);
    } catch (err) {
      setError(err);
    }
  };

  return (
    <div className="portal-page portal-narrow">
      <h1>{mn.verify.title}</h1>
      <p>{email ? mn.verify.text(email) : mn.verify.textNoEmail}</p>
      <form className="portal-form" onSubmit={(e) => void onSubmit(e)} noValidate>
        {!state.email && !user?.email ? (
          <Input
            label={mn.verify.email}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmailInput(e.target.value)}
          />
        ) : null}
        <Input
          label={mn.verify.code}
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          error={codeError}
        />
        <ErrorNotice error={error} />
        <Button type="submit" fullWidth loading={busy}>
          {mn.verify.submit}
        </Button>
      </form>
      <Button
        variant="secondary"
        fullWidth
        disabled={cooldown > 0 || !email}
        onClick={() => void resend()}
      >
        {cooldown > 0 ? mn.verify.resendIn(cooldown) : mn.verify.resend}
      </Button>
    </div>
  );
}
