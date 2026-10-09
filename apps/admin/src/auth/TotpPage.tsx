import { Button, Input, Notice } from '@ongod/ui-web';
import QRCode from 'qrcode';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { mn } from '../i18n/mn';
import { useAuth } from './AuthContext';
import { AuthFrame } from './LoginPage';

const errorMessage = (err: unknown) =>
  err instanceof ApiError ? err.message : mn.common.errorGeneric;

function CodeForm({ onSubmit }: { onSubmit: (code: string) => Promise<void> }) {
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(undefined);
    try {
      await onSubmit(code);
    } catch (err) {
      setError(errorMessage(err));
      setCode('');
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="admin-auth__form" onSubmit={(event) => void submit(event)} noValidate>
      <Input
        label={mn.totp.code}
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        autoFocus
        {...(error ? { error } : {})}
      />
      <Button type="submit" loading={pending} disabled={code.length !== 6}>
        {mn.totp.submit}
      </Button>
    </form>
  );
}

/** Every login asks for a code (ADR-0022: the proof lives on the session). */
export function TotpVerifyPage() {
  const { verifyTotp, logout } = useAuth();
  return (
    <AuthFrame title={mn.totp.verifyTitle} text={mn.totp.verifyText}>
      <CodeForm onSubmit={verifyTotp} />
      <Button variant="ghost" onClick={() => void logout()}>
        {mn.totp.wrongAccount}
      </Button>
    </AuthFrame>
  );
}

/**
 * First login: shows the QR code for the authenticator app. The secret only counts after the
 * first valid code (the API refuses a second setup once 2FA is on).
 */
export function TotpSetupPage() {
  const { startTotpSetup, verifyTotp, logout } = useAuth();
  const [setup, setSetup] = useState<{ secret: string; qr: string }>();
  const [error, setError] = useState<string>();
  // Bumping this asks for a fresh secret (the retry button).
  const [attempt, setAttempt] = useState(0);

  // Ask for the secret as soon as the screen opens; a restarted setup replaces a pending one.
  useEffect(() => {
    let current = true;
    startTotpSetup()
      .then(async ({ secret, otpauthUri }) => {
        const qr = await QRCode.toDataURL(otpauthUri, { margin: 1, scale: 8 });
        if (current) setSetup({ secret, qr });
      })
      .catch((err: unknown) => {
        if (current) setError(errorMessage(err));
      });
    return () => {
      current = false;
    };
  }, [startTotpSetup, attempt]);

  return (
    <AuthFrame title={mn.totp.setupTitle} text={mn.totp.setupText}>
      {error ? (
        <>
          <Notice tone="danger">{error}</Notice>
          <Button
            variant="secondary"
            onClick={() => {
              setError(undefined);
              setAttempt((count) => count + 1);
            }}
          >
            {mn.totp.startSetup}
          </Button>
        </>
      ) : null}
      {setup ? (
        <>
          <img className="admin-auth__qr" src={setup.qr} alt={mn.totp.qrAlt} />
          <p className="admin-auth__text">{mn.totp.manualKey}</p>
          <code className="admin-auth__secret">{setup.secret}</code>
          <CodeForm onSubmit={verifyTotp} />
        </>
      ) : null}
      <Button variant="ghost" onClick={() => void logout()}>
        {mn.totp.wrongAccount}
      </Button>
    </AuthFrame>
  );
}
