import { Link } from 'react-router';
import { getAppConfig } from '../api/endpoints';
import { mn } from '../i18n/mn';
import { useAsync } from '../lib/useAsync';
import { usePage } from '../lib/usePage';

/**
 * The public support page: the "Support URL" the App Store and Google Play ask for. The contact
 * e-mail comes from the server setting SUPPORT_EMAIL, so it is changed in one place.
 */
export default function Support() {
  usePage({ title: mn.support.metaTitle, description: mn.support.metaDescription });
  const config = useAsync((signal) => getAppConfig(signal));
  const email = config.data?.supportEmail;
  return (
    <div className="portal-page portal-narrow portal-legal">
      <h1>{mn.support.title}</h1>
      <p>{mn.support.intro}</p>
      <section>
        <h2>{mn.support.emailLabel}</h2>
        {email ? (
          <p>
            <a href={`mailto:${email}`}>{email}</a>
          </p>
        ) : config.loading ? null : (
          <p className="portal-muted">{mn.support.noEmail}</p>
        )}
      </section>
      <section>
        <h2>{mn.support.tipsTitle}</h2>
        <ul>
          {mn.support.tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </section>
      <p className="portal-muted">
        {mn.support.deleteBefore}
        <Link to="/delete-account">{mn.support.deleteLink}</Link>
        {mn.support.deleteAfter}
      </p>
    </div>
  );
}
