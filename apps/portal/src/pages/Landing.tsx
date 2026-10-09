import { Link } from 'react-router';
import { Button, EpisodeCard, MountainLine, Notice, Skeleton } from '@ongod/ui-web';
import { getPlans } from '../api/endpoints';
import { PlanCard } from '../components/PlanCard';
import { useAuth } from '../auth/AuthContext';
import { mn } from '../i18n/mn';
import { sampleCover } from '../lib/sampleCover';
import { useAsync } from '../lib/useAsync';
import { usePage } from '../lib/usePage';
import { formatDurationMn } from '@ongod/shared';

const SAMPLE_MINUTES = [41, 26, 58];

export default function Landing() {
  usePage({ title: mn.landing.metaTitle, description: mn.landing.metaDescription });
  const { status } = useAuth();
  const plans = useAsync(() => getPlans());
  const plan = plans.data?.plans[0];

  return (
    <div className="portal-page portal-landing">
      <section className="portal-hero" aria-labelledby="hero-title">
        <MountainLine className="portal-hero__motif" />
        <h1 id="hero-title" className="portal-hero__title">
          {mn.landing.title}
        </h1>
        <p className="portal-hero__lead">{mn.landing.lead}</p>
        <div className="portal-hero__actions">
          {status === 'authenticated' ? (
            <Link to="/plans" className="portal-linkbutton">
              {mn.nav.plans}
            </Link>
          ) : (
            <>
              <Link to="/register" className="portal-linkbutton">
                {mn.landing.planCta}
              </Link>
              <Link to="/login" className="portal-linkbutton portal-linkbutton--secondary">
                {mn.nav.login}
              </Link>
            </>
          )}
        </div>
      </section>

      <section aria-labelledby="samples-title" className="portal-section">
        <h2 id="samples-title">{mn.landing.samplesTitle}</h2>
        <div className="portal-samples">
          {mn.landing.samples.map((title, index) => (
            <EpisodeCard
              key={title}
              title={title}
              durationLabel={formatDurationMn((SAMPLE_MINUTES[index] ?? 30) * 60)}
              coverUrl={sampleCover(index * 12)}
            />
          ))}
        </div>
        <p className="portal-muted">{mn.landing.samplesNote}</p>
      </section>

      <section aria-labelledby="how-title" className="portal-section">
        <h2 id="how-title">{mn.landing.howTitle}</h2>
        <ol className="portal-steps">
          {mn.landing.how.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="plan-title" className="portal-section">
        <h2 id="plan-title">{mn.landing.planTitle}</h2>
        {plans.loading && !plan ? (
          <div className="portal-plan" aria-busy="true" aria-label={mn.common.loading}>
            <Skeleton width="50%" />
            <Skeleton width="35%" />
            <Skeleton shape="pill" width="100%" />
          </div>
        ) : plan ? (
          <PlanCard plan={plan}>
            <Link
              to={status === 'authenticated' ? '/plans' : '/register'}
              className="portal-linkbutton portal-linkbutton--full"
            >
              {status === 'authenticated' ? mn.nav.plans : mn.landing.planCta}
            </Link>
          </PlanCard>
        ) : (
          <Notice tone="warning">
            {mn.landing.plansUnavailable}{' '}
            <Button variant="ghost" onClick={plans.reload}>
              {mn.common.retry}
            </Button>
          </Notice>
        )}
        <p className="portal-muted">{mn.landing.payNote}</p>
      </section>
    </div>
  );
}
