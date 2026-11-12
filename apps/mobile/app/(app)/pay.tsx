// ADR-0076 / ADR-0083: "Эрх авах". Not reachable while the server switch `inAppPayment` is off
// (and the test-build flag EXPO_PUBLIC_MOBILE_PAYMENTS is not set).
import { Redirect } from 'expo-router';
import { useInAppPayment } from '../../src/inpay/useInAppPayment';
import PayScreen from '../../src/testpay/PayScreen';

export default function Pay() {
  return useInAppPayment() ? <PayScreen /> : <Redirect href="/" />;
}
