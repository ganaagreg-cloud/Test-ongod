import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, Sheet, useToast } from '@ongod/ui-web';
import { deleteAccount } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { ErrorNotice } from '../components/ErrorNotice';
import { mn } from '../i18n/mn';
import { usePage } from '../lib/usePage';

/**
 * Public page that explains how to delete the account (a store requirement). Signed-in users can
 * also do it here, after a confirmation.
 */
export default function DeleteAccount() {
  usePage({ title: mn.deleteAccount.metaTitle, description: mn.deleteAccount.metaDescription });
  const { status, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  const remove = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await deleteAccount();
      setConfirming(false);
      await logout();
      toast.show(mn.deleteAccount.done, { tone: 'success' });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="portal-page portal-narrow portal-legal">
      <h1>{mn.deleteAccount.title}</h1>
      <p className="portal-lead">{mn.deleteAccount.lead}</p>

      <section aria-labelledby="how-title">
        <h2 id="how-title">{mn.deleteAccount.howTitle}</h2>
        <ul>
          <li>{mn.deleteAccount.howApp}</li>
          <li>{mn.deleteAccount.howWeb}</li>
        </ul>
      </section>

      <section aria-labelledby="what-title">
        <h2 id="what-title">{mn.deleteAccount.whatTitle}</h2>
        <ul>
          {mn.deleteAccount.what.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </section>

      <p>{mn.deleteAccount.contact}</p>

      {status === 'authenticated' ? (
        <>
          <ErrorNotice error={error} />
          <Button variant="destructive" onClick={() => setConfirming(true)}>
            {mn.deleteAccount.button}
          </Button>
        </>
      ) : (
        <p>
          {mn.deleteAccount.loginFirst}{' '}
          <Link to="/login" state={{ from: '/delete-account' }}>
            {mn.nav.login}
          </Link>
        </p>
      )}

      <Sheet
        open={confirming}
        onClose={() => setConfirming(false)}
        title={mn.deleteAccount.confirmTitle}
        closeLabel={mn.common.close}
      >
        <p>{mn.deleteAccount.confirmText}</p>
        <Button variant="destructive" fullWidth loading={busy} onClick={() => void remove()}>
          {mn.deleteAccount.confirm}
        </Button>
        <Button variant="secondary" fullWidth onClick={() => setConfirming(false)}>
          {mn.common.cancel}
        </Button>
      </Sheet>
    </div>
  );
}
