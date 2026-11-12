// ADR-0076, ADR-0083: "Эрх авах", the QPay (Wire) checkout from the app. Exists only while the
// server switch `inAppPayment` is on (or in a test build with EXPO_PUBLIC_MOBILE_PAYMENTS).
import { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { createSubscriptionResponseSchema, plansResponseSchema, type PlanDto } from '@ongod/shared';
import {
  colors,
  layout,
  nativeFontFamily,
  nativeTextStyle,
  radius,
  spacing,
  withAlpha,
} from '@ongod/tokens';
import { client } from '../api';
import { useAuth } from '../auth/AuthContext';
import { accessState } from '../lib/episode';
import { useSubmit } from '../lib/useSubmit';
import { BackHeader } from '../screens/BackHeader';
import { Button, Icon, PressableScale, Screen } from '../ui';
import { payMn } from './mn';

const POLL_MS = 4000;

export default function PayScreen() {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const { pending, run } = useSubmit();
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
        <View style={styles.center}>
          <View style={styles.badge}>
            <Icon name="check" color={colors.success} />
          </View>
          <Text style={styles.heading} accessibilityRole="header">
            {payMn.done}
          </Text>
          <Button label={payMn.back} fullWidth onPress={() => router.back()} />
        </View>
      ) : checkoutUrl ? (
        <View style={styles.card}>
          <Text style={styles.heading} accessibilityRole="header">
            {payMn.waiting}
          </Text>
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
          <View style={styles.plans} accessibilityRole="radiogroup">
            {(plans ?? []).map((plan) => {
              const selected = plan.id === chosen?.id;
              return (
                <PressableScale
                  key={plan.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${plan.name}, ${payMn.amount(plan.priceMnt)}`}
                  onPress={() => setPicked(plan.id)}
                  style={[styles.plan, selected && styles.planSelected]}
                >
                  <View style={styles.planText}>
                    <Text style={styles.planName}>{plan.name}</Text>
                    <Text style={styles.planDays}>{payMn.days(plan.durationDays)}</Text>
                  </View>
                  <Text style={styles.planPrice}>{payMn.amount(plan.priceMnt)}</Text>
                  <View style={[styles.dot, selected && styles.dotSelected]}>
                    {selected ? <Icon name="check" size="small" color={colors.onAccent} /> : null}
                  </View>
                </PressableScale>
              );
            })}
          </View>
          {open && chosen ? (
            <Button
              label={payMn.pay(payMn.amount(chosen.priceMnt))}
              fullWidth
              loading={pending}
              onPress={() => pay(chosen)}
            />
          ) : null}
          {open ? <Text style={styles.note}>{payMn.note}</Text> : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { color: colors.textPrimary, textAlign: 'center', ...nativeTextStyle('h2') },
  text: { color: colors.textSecondary, ...nativeTextStyle('body') },
  note: { color: colors.textTertiary, textAlign: 'center', ...nativeTextStyle('caption') },
  center: { alignItems: 'stretch', gap: spacing.md, paddingVertical: spacing.xl },
  badge: {
    alignSelf: 'center',
    width: layout.iconTile,
    height: layout.iconTile,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(colors.success, 0.16),
  },
  card: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.cardLarge,
    borderWidth: layout.borderWidth,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  plans: { gap: spacing.sm },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: layout.touchTarget + spacing.lg,
    padding: spacing.md,
    borderRadius: radius.cardLarge,
    borderWidth: layout.borderWidth,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  planSelected: { borderColor: colors.accent, backgroundColor: colors.brand },
  planText: { flex: 1, gap: spacing.xxs },
  planName: {
    color: colors.textPrimary,
    ...nativeTextStyle('body'),
    fontFamily: nativeFontFamily.ui[600],
  },
  planDays: { color: colors.textSecondary, ...nativeTextStyle('small') },
  planPrice: {
    color: colors.textPrimary,
    ...nativeTextStyle('h2'),
    fontFamily: nativeFontFamily.ui[600],
  },
  dot: {
    width: spacing.lg,
    height: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: layout.borderWidth,
    borderColor: colors.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotSelected: { borderColor: colors.accent, backgroundColor: colors.accent },
});
