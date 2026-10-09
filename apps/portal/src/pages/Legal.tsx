import { Link } from 'react-router';
import { Notice } from '@ongod/ui-web';
import { mn } from '../i18n/mn';
import { usePage } from '../lib/usePage';

interface Document {
  metaTitle: string;
  metaDescription: string;
  title: string;
  sections: ReadonlyArray<{ title: string; text: string; payment?: boolean }>;
}

/**
 * `app` = the copy the mobile apps link to (/app/terms, /app/privacy): no payment section and,
 * with the bare layout, no way to the price page (audit D-01, ADR-0006).
 */
function LegalPage({ doc, app = false }: { doc: Document; app?: boolean }) {
  usePage({ title: doc.metaTitle, description: doc.metaDescription, noindex: app });
  return (
    <div className="portal-page portal-narrow portal-legal">
      <h1>{doc.title}</h1>
      {/* TODO(owner): remove this banner once the text below is approved. */}
      <Notice tone="warning">{mn.legal.todoBanner}</Notice>
      <p className="portal-muted">{mn.legal.updated}</p>
      {doc.sections
        .filter((section) => !(app && section.payment))
        .map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            <p>{section.text}</p>
          </section>
        ))}
    </div>
  );
}

export function Privacy() {
  return <LegalPage doc={mn.legal.privacy} />;
}

export function Terms() {
  return <LegalPage doc={mn.legal.terms} />;
}

export function AppPrivacy() {
  return <LegalPage doc={mn.legal.privacy} app />;
}

export function AppTerms() {
  return <LegalPage doc={mn.legal.terms} app />;
}

/** Support page: public, also in the app-only layout. */
export function Support({ app = false }: { app?: boolean }) {
  const t = mn.support;
  usePage({ title: t.metaTitle, description: t.metaDescription, noindex: app });
  return (
    <div className="portal-page portal-narrow portal-legal">
      <h1>{t.title}</h1>
      <p>{t.lead}</p>
      <p>{t.contact}</p>
      {app ? null : (
        <p>
          <Link to="/delete-account">{t.deleteLink}</Link>
        </p>
      )}
    </div>
  );
}

export function AppSupport() {
  return <Support app />;
}
