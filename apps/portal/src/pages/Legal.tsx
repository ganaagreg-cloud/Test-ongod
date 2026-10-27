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
 * `app` = the copy the mobile apps open (/app/terms, /app/privacy): sections about paying are
 * left out and, with the bare AppLayout, nothing leads to the price page (ADR-0053).
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
