import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { passwordSchema } from '@ongod/shared';
import { Button, Input } from '@ongod/ui-web';
import { resetPassword } from '../api/endpoints';
import { ErrorNotice } from '../components/ErrorNotice';
import { mn } from '../i18n/mn';
import { usePage } from '../lib/usePage';

export default function Reset() {
  usePage({ title: mn.reset.metaTitle, noindex: true });
  const navigate = useNavigate();
  const state = (useLocation().state ?? {}) as { email?: string };
  const [email, setEmail] = useState(state.email ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>();
  const [passwordError, setPasswordError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    if (!passwordSchema.safeParse(password).success) {
      setPasswordError(mn.register.errors.password);
      return;
    }
    setPasswordError(undefined);
    setBusy(true);
    try {
      await resetPassword(email.trim(), code.trim(), password);
      navigate('/login?reset=1', { replace: true, state: { identifier: email.trim() } });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="portal-page portal-narrow">
      <h1>{mn.reset.title}</h1>
      <form className="portal-form" onSubmit={(e) => void onSubmit(e)} noValidate>
        <Input
          label={mn.reset.email}
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label={mn.reset.code}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        />
        <Input
          label={mn.reset.newPassword}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={mn.register.passwordHint}
          error={passwordError}
        />
        <ErrorNotice error={error} />
        <Button type="submit" fullWidth loading={busy}>
          {mn.reset.submit}
        </Button>
      </form>
    </div>
  );
}
