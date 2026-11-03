// ADR-0083: QPay (Wire) checkout from the app. TEST builds only (flag EXPO_PUBLIC_MOBILE_PAYMENTS).
import { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { createSubscriptionResponseSchema, plansResponseSchema, type PlanDto } from '@ongod/shared';
import { colors, nativeTextStyle, radius, layout, spacing } from '@ongod/tokens';
import { client } from '../api';
import { useAuth } from '../auth/AuthContext';
import { accessState } from '../lib/episode';
import { useSubmit } from '../lib/useSubmit';
import { BackHeader } from '../screens/BackHeader';
import { Button, ListItem, Screen } from '../ui';
import { payMn } from './mn';

const POLL_MS = 4000;

export default function PayScreen() {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const { run } = useSubmit();
  const [plans, setPlans] = useState<PlanDto[] | null>(null);
  const [open, setOpen] = useState(true);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    void client
      .request('/plans', { auth: false, schema: plansResponseSchema })
      .then((res) => {
        setPlans(res.plans);
        setOpen(res.paymentsOpen);
      })
      .catch(() => setLoadFailed(true));
  }, []);

  // While the bank app is open, ask the API (which asks Wire) until the access is active.
  useEffect(() => {
    if (!checkoutUrl || paid) return;
    timer.current = setInterval(() => {
      void refreshUser().then((me) => {
        if (me && accessState(me.accessUntil, new Date()).active) setPaid(true);
      });
    }, POLL_MS);
    return () => clearInterval(timer.current);
  }, [checkoutUrl, paid, refreshUser]);

  // The first plan is chosen until the member taps another one.
  const chosen = plans?.find((plan) => plan.id === picked) ?? plans?.[0];
  const pay = (plan: PlanDto) =>
    void run(async () => {
      const res = await client.request('/subscriptions', {
        method: 'POST',
        body: { planId: plan.id },
        schema: createSubscriptionResponseSchema,
      });
      const url = res.subscription.checkoutUrl;
      if (!url) throw new Error(payMn.failed);
      setCheckoutUrl(url);
      await Linking.openURL(url);
    });

  return (
    <Screen>
      <BackHeader title={payMn.title} />
      {paid ? (
        <View style={styles.group}>
          <Text style={styles.text}>{payMn.done}</Text>
          <Button label={payMn.back} fullWidth onPress={() => router.back()} />
        </View>
      ) : checkoutUrl ? (
        <View style={styles.group}>
          <Text style={styles.title}>{payMn.waiting}</Text>
          <Text style={styles.text}>{payMn.waitingText}</Text>
          <Button
            label={payMn.reopen}
            variant="secondary"
            fullWidth
            onPress={() => void Linking.openURL(checkoutUrl)}
          />
        </View>
      ) : (
        <>
          <Text style={styles.text}>
            {loadFailed ? payMn.failed : open ? payMn.intro : payMn.closed}
          </Text>
          <View style={styles.group}>
            {(plans ?? []).map((plan) => (
              <ListItem
                key={plan.id}
                title={`${plan.name} · ${payMn.days(plan.durationDays)}`}
                value={payMn.amount(plan.priceMnt)}
                {...(plan.id === chosen?.id ? { icon: 'check' as const } : {})}
                onPress={() => setPicked(plan.id)}
              />
            ))}
          </View>
          {open && chosen ? (
            <Button label={payMn.open} fullWidth onPress={() => pay(chosen)} />
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.textPrimary, ...nativeTextStyle('body') },
  text: { color: colors.textSecondary, ...nativeTextStyle('body') },
  group: {
    gap: spacing.sm,
    borderRadius: radius.cardLarge,
    borderWidth: layout.borderWidth,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    overflow: 'hidden',
  },
});
