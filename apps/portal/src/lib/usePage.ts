import { useEffect } from 'react';

function setMeta(selector: string, create: () => HTMLMetaElement, content: string) {
  const el = document.head.querySelector<HTMLMetaElement>(selector) ?? create();
  el.content = content;
  if (!el.isConnected) document.head.appendChild(el);
}

const metaByName = (name: string) => () => {
  const el = document.createElement('meta');
  el.name = name;
  return el;
};

const metaByProperty = (property: string) => () => {
  const el = document.createElement('meta');
  el.setAttribute('property', property);
  return el;
};

/**
 * Title, description and robots for the current page. Public pages are indexable; pages behind
 * the login (`noindex`) are not. The static values in index.html cover crawlers that do not
 * run scripts.
 */
export function usePage(options: { title: string; description?: string; noindex?: boolean }) {
  const { title, description, noindex = false } = options;
  useEffect(() => {
    document.title = title;
    setMeta('meta[property="og:title"]', metaByProperty('og:title'), title);
    if (description) {
      setMeta('meta[name="description"]', metaByName('description'), description);
      setMeta('meta[property="og:description"]', metaByProperty('og:description'), description);
    }
    setMeta(
      'meta[name="robots"]',
      metaByName('robots'),
      noindex ? 'noindex, nofollow' : 'index, follow',
    );
  }, [title, description, noindex]);
}
