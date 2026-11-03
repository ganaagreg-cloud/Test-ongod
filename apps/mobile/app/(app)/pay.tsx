// ADR-0083: flagged test route; without EXPO_PUBLIC_MOBILE_PAYMENTS it is not reachable.
import { Redirect } from 'expo-router';
import { env } from '../../src/config/env';
import PayScreen from '../../src/testpay/PayScreen';

export default function Pay() {
  return env.mobilePayments ? <PayScreen /> : <Redirect href="/" />;
}
