// ADR-0090: "Эрх бэлэглэх". Not reachable while the server switch `inAppPayment` is off.
import { Redirect } from 'expo-router';
import { GiftsScreen } from '../../../src/inpay/GiftsScreen';
import { useInAppPayment } from '../../../src/inpay/useInAppPayment';

export default function Gifts() {
  return useInAppPayment() ? <GiftsScreen /> : <Redirect href="/" />;
}
