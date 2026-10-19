import type { NavigateFunction } from 'react-router';

/**
 * Goes to the payment page. Wire's hosted checkout is another site (a full page load); the
 * development mock checkout is a portal page (a normal route change).
 */
export function openCheckout(url: string, navigate: NavigateFunction): void {
  if (url.startsWith('/')) navigate(url);
  else window.location.assign(url);
}
