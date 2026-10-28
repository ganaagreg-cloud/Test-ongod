import { mn } from '../i18n/mn';

/**
 * App Store and Google Play badges. Not links yet: the apps are not in the stores, so each says
 * "Удахгүй". TODO(owner): link them once the apps are live.
 */
export function StoreBadges({ soon = true }: { soon?: boolean }) {
  return (
    <ul className="portal-stores">
      {[mn.stores.ios, mn.stores.android].map((s) => (
        <li key={s.store} className="portal-store">
          <span>
            <small>{s.platform}</small>
            <b>{s.store}</b>
          </span>
          {soon ? <span className="portal-store__soon">{mn.stores.soon}</span> : null}
        </li>
      ))}
    </ul>
  );
}
