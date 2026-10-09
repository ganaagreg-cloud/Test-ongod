import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { registerRequestSchema } from '@ongod/shared';
import { Button, Input } from '@ongod/ui-web';
import { ApiError } from '../api/client';
import { register } from '../api/endpoints';
import { ErrorNotice } from '../components/ErrorNotice';
import { mn } from '../i18n/mn';
import { usePage } from '../lib/usePage';

type Field = 'lastName' | 'firstName' | 'phone' | 'email' | 'username' | 'password';

const FIELD_ERROR: Record<Field, string> = {
  lastName: mn.common.required,
  firstName: mn.common.required,
  phone: mn.register.errors.phone,
  email: mn.register.errors.email,
  username: mn.register.errors.username,
  password: mn.register.errors.password,
};

export default function Register() {
  usePage({ title: mn.register.metaTitle, description: mn.register.metaDescription });
  const navigate = useNavigate();
  const [values, setValues] = useState<Record<Field, string>>({
    lastName: '',
    firstName: '',
    phone: '',
    email: '',
    username: '',
    password: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);

  const set = (field: Field) => (event: { target: { value: string } }) =>
    setValues((all) => ({ ...all, [field]: event.target.value }));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);

    // The same rules as the API (packages/shared), so a mistake is caught before the request.
    const parsed = registerRequestSchema.safeParse({
      ...values,
      username: values.username.trim() === '' ? undefined : values.username,
    });
    if (!parsed.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as Field | undefined;
        if (field && field in FIELD_ERROR) next[field] ??= FIELD_ERROR[field];
      }
      setFieldErrors(next);
      return;
    }
    setFieldErrors({});

    setBusy(true);
    try {
      await register(parsed.data);
      navigate('/verify', { state: { email: parsed.data.email, afterVerify: 'login' } });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_TAKEN') {
        setFieldErrors({ email: err.message });
      } else if (err instanceof ApiError && err.code === 'USERNAME_TAKEN') {
        setFieldErrors({ username: err.message });
      } else {
        setError(err);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="portal-page portal-narrow">
      <h1>{mn.register.title}</h1>
      <form className="portal-form" onSubmit={(e) => void onSubmit(e)} noValidate>
        <Input
          label={mn.register.lastName}
          autoComplete="family-name"
          value={values.lastName}
          onChange={set('lastName')}
          error={fieldErrors.lastName}
        />
        <Input
          label={mn.register.firstName}
          autoComplete="given-name"
          value={values.firstName}
          onChange={set('firstName')}
          error={fieldErrors.firstName}
        />
        <Input
          label={mn.register.phone}
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          value={values.phone}
          onChange={set('phone')}
          error={fieldErrors.phone}
        />
        <Input
          label={mn.register.email}
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          value={values.email}
          onChange={set('email')}
          error={fieldErrors.email}
        />
        <Input
          label={mn.register.username}
          autoComplete="username"
          autoCapitalize="none"
          value={values.username}
          onChange={set('username')}
          hint={mn.register.usernameHint}
          error={fieldErrors.username}
        />
        <Input
          label={mn.register.password}
          type="password"
          autoComplete="new-password"
          value={values.password}
          onChange={set('password')}
          hint={mn.register.passwordHint}
          error={fieldErrors.password}
        />
        <ErrorNotice error={error} />
        <Button type="submit" fullWidth loading={busy}>
          {mn.register.submit}
        </Button>
      </form>
      <p>
        {mn.register.haveAccount} <Link to="/login">{mn.register.login}</Link>
      </p>
    </div>
  );
}
