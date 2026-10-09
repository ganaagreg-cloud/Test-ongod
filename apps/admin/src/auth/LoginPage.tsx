import { deviceLimitDetailsSchema, type DeviceDto } from '@ongod/shared';
import { Button, Input, MountainLine, Notice } from '@ongod/ui-web';
import { useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { formatDateTime } from '../lib/format';
import { mn } from '../i18n/mn';
import { useAuth, type Gate } from './AuthContext';

export function AuthFrame({
  title,
  text,
  children,
}: {
  title: string;
  text?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="admin-auth">
      <div className="admin-auth__card">
        <MountainLine />
        <p className="admin-auth__brand">{mn.appName}</p>
        <h1 className="admin-auth__title">{title}</h1>
        {text ? <p className="admin-auth__text">{text}</p> : null}
        {children}
      </div>
    </main>
  );
}

export function LoginPage({ forbidden }: { forbidden?: Extract<Gate, { stage: 'forbidden' }> }) {
  const { login, logout } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [devices, setDevices] = useState<DeviceDto[]>();

  async function submit(event: FormEvent, removeDeviceId?: string) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(undefined);
    try {
      await login({ identifier, password, ...(removeDeviceId ? { removeDeviceId } : {}) });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DEVICE_LIMIT') {
        const details = deviceLimitDetailsSchema.safeParse(err.details);
        setDevices(details.success ? details.data.devices : []);
      } else {
        setDevices(undefined);
        setError(err instanceof ApiError ? err.message : mn.common.errorGeneric);
      }
    } finally {
      setPending(false);
    }
  }

  if (forbidden) {
    return (
      <AuthFrame title={mn.login.title}>
        <Notice tone="danger">{mn.login.notAdmin}</Notice>
        <Button variant="secondary" onClick={() => void logout()}>
          {mn.totp.wrongAccount}
        </Button>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title={mn.login.title} text={mn.login.text}>
      <form className="admin-auth__form" onSubmit={(event) => void submit(event)} noValidate>
        <Input
          label={mn.login.identifier}
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          autoFocus
        />
        <Input
          label={mn.login.password}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {devices ? (
          <Notice tone="warning" title={mn.login.deviceLimitTitle}>
            <p>{mn.login.deviceLimitText}</p>
            <ul className="admin-device-list">
              {devices.map((device) => (
                <li key={device.id}>
                  <span>
                    {mn.login.device(device.platform, device.model)}
                    <br />
                    <small>{mn.login.lastSeen(formatDateTime(device.lastSeenAt))}</small>
                  </span>
                  <Button
                    variant="secondary"
                    disabled={pending}
                    onClick={(event) => void submit(event, device.id)}
                  >
                    {mn.login.removeAndLogin}
                  </Button>
                </li>
              ))}
            </ul>
          </Notice>
        ) : null}
        <Button type="submit" loading={pending} disabled={identifier === '' || password === ''}>
          {mn.login.submit}
        </Button>
      </form>
    </AuthFrame>
  );
}
