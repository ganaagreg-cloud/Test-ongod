import { Link } from 'react-router';
import { Button, MountainLine, Notice, Skeleton } from '@ongod/ui-web';
import { formatDurationMn } from '@ongod/shared';
import { getPlans } from '../api/endpoints';
import { PlanCard } from '../components/PlanCard';
import { StoreBadges } from '../components/StoreBadges';
import { TypeCover } from '../components/TypeCover';
import { useAuth } from '../auth/AuthContext';
import { mn } from '../i18n/mn';
import { formatMnt } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { usePage } from '../lib/usePage';

// Portal design A "Aurora" (ADR-0058): forest hero with tilted typographic covers, facts, a
// sample of the library, three steps, the plans, the app badges and questions.

/** Section heading: a small label over the serif title. */
function Heading({ id, kicker, title }: { id: string; kicker: string; title: string }) {
  return (
    <header className="portal-head">
      <p className="portal-kicker">{kicker}</p>
      <h2 id={id} className="portal-head__title">
        {title}
      </h2>
    </header>
  );
}

export default function Landing() {
  usePage({ title: mn.landing.metaTitle, description: mn.landing.metaDescription });
  const { status } = useAuth();
  const plans = useAsync(() => getPlans());
  const list = plans.data?.plans ?? [];
  const cheapest = list.reduce<(typeof list)[number] | undefined>(
    (min, p) => (!min || p.priceMnt < min.priceMnt ? p : min),
    undefined,
  );
  const signedIn = status === 'authenticated';
  const cta = signedIn ? '/plans' : '/register';

  return (
    <div className="portal-landing">
      <section className="portal-hero" aria-labelledby="hero-title">
        <div className="portal-hero__covers" aria-hidden="true">
          {mn.landing.heroCovers.map((title, i) => (
            <TypeCover key={title} index={i * 2 + Math.floor(i / 6)} className="portal-hero__cover">
              <span className="portal-typecover__number">
                {mn.landing.episodeNumber(((i * 17) % 52) + 1)}
              </span>
              <span className="portal-typecover__title">{title}</span>
            </TypeCover>
          ))}
        </div>
        <div className="portal-hero__inner">
          <MountainLine className="portal-hero__motif" />
          <p className="portal-kicker">{mn.landing.kicker}</p>
          <h1 id="hero-title" className="portal-hero__title">
            {mn.landing.title}
          </h1>
          <p className="portal-hero__lead">{mn.landing.lead}</p>
          <div className="portal-hero__actions">
            <Link to={cta} className="portal-linkbutton">
              {signedIn ? mn.nav.plans : mn.landing.planCta}
            </Link>
            <a href="#library" className="portal-linkbutton portal-linkbutton--secondary">
              {mn.landing.browse}
            </a>
          </div>
          {cheapest ? (
            <p className="portal-hero__price">
              {mn.landing.priceLine(cheapest.name, formatMnt(cheapest.priceMnt))}
            </p>
          ) : null}
        </div>
      </section>

      <div className="portal-wrap">
        <dl className="portal-facts-strip" aria-label={mn.landing.factsLabel}>
          {mn.landing.facts.map((f) => (
            <div key={f.value}>
              <dt>{f.value}</dt>
              <dd>{f.text}</dd>
            </div>
          ))}
        </dl>
      </div>

      <section id="library" className="portal-band" aria-labelledby="samples-title">
        <div className="portal-wrap">
          <Heading
            id="samples-title"
            kicker={mn.landing.samplesKicker}
            title={mn.landing.samplesTitle}
          />
          <ul className="portal-episodes">
            {mn.landing.samples.map((s, i) => (
              <li key={s.title} className="portal-episode">
                <TypeCover index={[2, 1, 0, 4][i] ?? i}>
                  <span className="portal-typecover__number">
                    {mn.landing.episodeNumber(52 - i)}
                  </span>
                  <span className="portal-episode__duration">
                    {formatDurationMn(s.minutes * 60)}
                  </span>
                </TypeCover>
                <h3 className="portal-episode__title">{s.title}</h3>
                <p className="portal-muted">{s.meta}</p>
              </li>
            ))}
          </ul>
          <p className="portal-muted">{mn.landing.samplesNote}</p>
        </div>
      </section>

      <section className="portal-band portal-band--sunken" aria-labelledby="how-title">
        <div className="portal-wrap">
          <Heading id="how-title" kicker={mn.landing.howKicker} title={mn.landing.howTitle} />
          <ol className="portal-steps">
            {mn.landing.how.map((step) => (
              <li key={step.title}>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="plans" className="portal-band" aria-labelledby="plan-title">
        <div className="portal-wrap">
          <Heading id="plan-title" kicker={mn.landing.planKicker} title={mn.landing.planTitle} />
          {plans.loading && !plans.data ? (
            <div className="portal-card" aria-busy="true" aria-label={mn.common.loading}>
              <Skeleton width="50%" />
              <Skeleton width="35%" />
              <Skeleton shape="pill" width="100%" />
            </div>
          ) : list.length > 0 ? (
            <div className="portal-plans">
              {list.map((plan) => (
                <PlanCard key={plan.id} plan={plan}>
                  <Link to={cta} className="portal-linkbutton portal-linkbutton--full">
                    {signedIn ? mn.nav.plans : mn.landing.planCta}
                  </Link>
                </PlanCard>
              ))}
            </div>
          ) : (
            <Notice tone="warning">
              {mn.landing.plansUnavailable}{' '}
              <Button variant="ghost" onClick={plans.reload}>
                {mn.common.retry}
              </Button>
            </Notice>
          )}
          <p className="portal-muted">{mn.landing.payNote}</p>
          <p>
            <Link to={signedIn ? '/gift' : '/register'}>{mn.gift.giveLink}</Link>
          </p>
        </div>
      </section>

      <section className="portal-band portal-band--tight" aria-labelledby="apps-title">
        <div className="portal-wrap">
          <Heading id="apps-title" kicker={mn.landing.appsKicker} title={mn.landing.appsTitle} />
          <StoreBadges />
        </div>
      </section>

      <section className="portal-band portal-band--sunken" aria-labelledby="faq-title">
        <div className="portal-wrap portal-faq">
          <Heading id="faq-title" kicker={mn.landing.faqKicker} title={mn.landing.faqTitle} />
          {mn.landing.faq.map((item, i) => (
            <details key={item.q} open={i === 0}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
