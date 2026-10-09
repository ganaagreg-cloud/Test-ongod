import { Link } from 'react-router';
import { EmptyState } from '@ongod/ui-web';
import { mn } from '../i18n/mn';
import { usePage } from '../lib/usePage';

export default function NotFound() {
  usePage({ title: mn.notFound.metaTitle, noindex: true });
  return (
    <div className="portal-page">
      <EmptyState
        title={mn.notFound.title}
        text={mn.notFound.text}
        action={
          <Link to="/" className="portal-linkbutton">
            {mn.notFound.home}
          </Link>
        }
      />
    </div>
  );
}
