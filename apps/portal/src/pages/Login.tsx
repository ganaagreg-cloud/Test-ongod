import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { deviceLimitDetailsSchema, type DeviceDto } from '@ongod/shared';
import { Button, Input, Notice } from '@ongod/ui-web';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ErrorNotice } from '../components/ErrorNotice';
import { mn } from '../i18n/mn';
import { formatDate } from '../lib/format';
import { usePage } from '../lib/usePage';

const platformName = (platform: string) =>
  platform === 'ios'
    ? mn.login.platformIos
    : platform === 'android'
      ? mn.login.platformAndroid
      : mn.login.platformWeb;

export default function Login() {
  usePage({ title: mn.login.metaTitle, description: mn.login.metaDescription });
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const state = (location.state ?? {}) as { from?: string; identifier?: string };

  const [identifier, setIdentifier] = useState(state.identifier ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<DeviceDto[]>();

  const submit = async (removeDeviceId?: string) => {
    setBusy(true);
    setError(undefined);
    try {
      await login(identifier.trim(), password, removeDeviceId);
      navigate(state.from ?? '/account', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DEVICE_LIMIT') {
        const parsed = deviceLimitDetailsSchema.safeParse(err.details);
        setDevices(parsed.success ? parsed.data.devices : []);
        setError(undefined);
      } else {
        setDevices(undefined);
        setError(err);
      }
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit();
  };

  return (
    <div className="portal-page portal-narrow">
      <h1>{mn.login.title}</h1>
      {params.get('verified') ? <Notice tone="success">{mn.login.verified}</Notice> : null}
      {params.get('reset') ? <Notice tone="success">{mn.login.passwordReset}</Notice> : null}

      <form className="portal-form" onSubmit={onSubmit} noValidate>
        <Input
          label={mn.login.identifier}
          name="identifier"
          autoComplete="username"
          autoCapitalize="none"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
        />
        <Input
          label={mn.login.password}
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <ErrorNotice error={error} />

        {devices ? (
          <section className="portal-devices" aria-labelledby="device-limit-title">
            <h2 id="device-limit-title">{mn.login.deviceLimitTitle}</h2>
            <p>{mn.login.deviceLimitText}</p>
            <ul>
              {devices.map((device) => (
                <li key={device.id}>
                  <span>
                    {device.model ?? platformName(device.platform)}
                    <span className="portal-muted">
                      {' '}
                      · {mn.login.lastSeen} {formatDate(device.lastSeenAt)}
                    </span>
                  </span>
                  <Button
                    variant="secondary"
                    disabled={busy || !identifier || !password}
                    onClick={() => void submit(device.id)}
                  >
                    {mn.login.removeAndLogin}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <Button type="submit" fullWidth loading={busy && !devices}>
          {mn.login.submit}
        </Button>
      </form>

      <p>
        <Link to="/forgot">{mn.login.forgot}</Link>
      </p>
      <p>
        {mn.login.noAccount} <Link to="/register">{mn.login.register}</Link>
      </p>
    </div>
  );
}
