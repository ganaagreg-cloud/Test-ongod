import { env } from '../config/env';
import { useAppConfig } from '../config/useAppConfig';

/**
 * ADR-0076, ADR-0090: true while the server switch `inAppPayment` is on (or in a test build with
 * the ADR-0083 flag). False is the default and the store-review setting: then nothing about
 * prices, plans, gift codes or paying exists in the app.
 */
export function useInAppPayment(): boolean {
  const { inAppPayment } = useAppConfig();
  return inAppPayment || env.mobilePayments;
}
