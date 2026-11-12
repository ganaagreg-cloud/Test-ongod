// ADR-0090: "Бэлгийн код". Not reachable while the server switch `inAppPayment` is off.
import { Redirect, useLocalSearchParams } from 'expo-router';
import { RedeemScreen } from '../../../src/inpay/RedeemScreen';
import { useInAppPayment } from '../../../src/inpay/useInAppPayment';

export default function Redeem() {
  const { welcome } = useLocalSearchParams<{ welcome?: string }>();
  return useInAppPayment() ? <RedeemScreen welcome={welcome === '1'} /> : <Redirect href="/home" />;
}
