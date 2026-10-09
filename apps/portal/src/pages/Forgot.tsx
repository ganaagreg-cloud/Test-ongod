import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Button, Input, Notice } from '@ongod/ui-web';
import { forgotPassword } from '../api/endpoints';
import { ErrorNotice } from '../components/ErrorNotice';
import { mn } from '../i18n/mn';
import { usePage } from '../lib/usePage';

export default function Forgot() {
  usePage({ title: mn.forgot.metaTitle, noindex: true });
  const [email, setEmail] = useState('');
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="portal-page portal-narrow">
      <h1>{mn.forgot.title}</h1>
      <p>{mn.forgot.text}</p>
      <form className="portal-form" onSubmit={(e) => void onSubmit(e)} noValidate>
        <Input
          label={mn.forgot.email}
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <ErrorNotice error={error} />
        {sent ? <Notice tone="success">{mn.forgot.sent}</Notice> : null}
        <Button type="submit" fullWidth loading={busy}>
          {mn.forgot.submit}
        </Button>
      </form>
      {sent ? (
        <Link
          to="/reset"
          state={{ email: email.trim() }}
          className="portal-linkbutton portal-linkbutton--secondary portal-linkbutton--full"
        >
          {mn.forgot.haveCode}
        </Link>
      ) : null}
    </div>
  );
}
