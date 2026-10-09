import { Notice } from '@ongod/ui-web';
import { mn } from '../i18n/mn';
import { usePage } from '../lib/usePage';

interface Document {
  metaTitle: string;
  metaDescription: string;
  title: string;
  sections: ReadonlyArray<{ title: string; text: string }>;
}

function LegalPage({ doc }: { doc: Document }) {
  usePage({ title: doc.metaTitle, description: doc.metaDescription });
  return (
    <div className="portal-page portal-narrow portal-legal">
      <h1>{doc.title}</h1>
      {/* TODO(owner): remove this banner once the text below is approved. */}
      <Notice tone="warning">{mn.legal.todoBanner}</Notice>
      <p className="portal-muted">{mn.legal.updated}</p>
      {doc.sections.map((section) => (
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
