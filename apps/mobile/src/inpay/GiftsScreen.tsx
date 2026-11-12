// ADR-0090: buying a gift for someone else and reading its code, in the app. Exists only while
// the switch `inAppPayment` is on. The payment itself is the same QPay checkout as the portal's.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Share, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { GiftDto, PlanDto } from '@ongod/shared';
import {
  layout,
  nativeFontFamily,
  nativeTextStyle,
  radius,
  spacing,
  type ThemeColors,
} from '@ongod/tokens';
import { formatDate } from '../lib/format';
import { useSubmit } from '../lib/useSubmit';
import { BackHeader } from '../screens/BackHeader';
import { Badge, Button, ListItem, Screen, useThemedStyles } from '../ui';
import { inpayApi } from './api';
import { inpayMn } from './mn';

const t = inpayMn.gift;
/** While a gift waits for its payment the list is read again this often (the API asks Wire). */
const POLL_MS = 5000;
/** ...for at most this long after the screen opened or a checkout started; then by hand. */
const POLL_FOR_MS = 10 * 60_000;

/**
 * "Эрх бэлэглэх": the plans with their prices and "Бэлэг авах", which opens the QPay checkout;
 * below, "Миний бэлгүүд": a waiting gift can be paid again, a paid one shows its code with a
 * share button. The code appears by itself once the payment is confirmed.
 */
export function GiftsScreen() {
  const styles = useThemedStyles(makeStyles);
  const { pending, run } = useSubmit();
  const [plans, setPlans] = useState<PlanDto[] | null>(null);
  const [open, setOpen] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [gifts, setGifts] = useState<GiftDto[] | null>(null);
  const pollUntil = useRef(0);

  const loadGifts = useCallback(async () => {
    try {
      setGifts((await inpayApi.gifts()).gifts);
    } catch {
      // The list keeps what it has; the next round or a new visit tries again.
    }
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    inpayApi
      .plans(abort.signal)
      .then((res) => {
        setPlans(res.plans);
        setOpen(res.paymentsOpen);
      })
      .catch(() => {
        if (!abort.signal.aborted) setLoadFailed(true);
      });
    return () => abort.abort();
  }, []);

  // Coming back from the bank app: read the gifts at once, then keep asking while one waits.
  useFocusEffect(
    useCallback(() => {
      pollUntil.current = Date.now() + POLL_FOR_MS;
      void loadGifts();
    }, [loadGifts]),
  );
  const waiting = gifts?.some((gift) => gift.status === 'PENDING_PAYMENT') ?? false;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      if (Date.now() < pollUntil.current) void loadGifts();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, loadGifts]);

  // The first plan is chosen until the member taps another one.
  const chosen = plans?.find((plan) => plan.id === picked) ?? plans?.[0];
  const buy = (plan: PlanDto) =>
    void run(async () => {
      const { gift } = await inpayApi.buyGift(plan.id);
      if (!gift.checkoutUrl) throw new Error(t.failed);
      pollUntil.current = Date.now() + POLL_FOR_MS;
      await loadGifts();
      await Linking.openURL(gift.checkoutUrl);
    });

  return (
    <Screen>
      <BackHeader title={t.title} />
      <Text style={styles.text}>{loadFailed ? t.loadFailed : open ? t.intro : t.closed}</Text>
      {plans && plans.length > 0 ? (
        <View style={styles.group}>
          {plans.map((plan) => (
            <ListItem
              key={plan.id}
              title={t.plan(plan.name, plan.durationDays)}
              value={t.amount(plan.priceMnt)}
              {...(plan.id === chosen?.id ? { icon: 'check' as const } : {})}
              onPress={() => setPicked(plan.id)}
            />
          ))}
        </View>
      ) : null}
      {open && chosen ? (
        <Button label={t.buy} icon="gift" fullWidth loading={pending} onPress={() => buy(chosen)} />
      ) : null}

      <View style={styles.section}>
        <Text style={styles.heading} accessibilityRole="header">
          {t.mine}
        </Text>
        {gifts && gifts.length === 0 ? <Text style={styles.text}>{t.empty}</Text> : null}
        {(gifts ?? []).map((gift) => (
          <GiftCard key={gift.id} gift={gift} />
        ))}
      </View>
    </Screen>
  );
}

function GiftCard({ gift }: { gift: GiftDto }) {
  const styles = useThemedStyles(makeStyles);
  const { code, checkoutUrl } = gift;
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {gift.plan.name}
        </Text>
        <Badge
          label={t.statuses[gift.status]}
          tone={gift.status === 'PAID' ? 'success' : 'neutral'}
        />
      </View>
      {gift.status === 'PAID' && code ? (
        <>
          <Text style={styles.code} selectable accessibilityLabel={code.split('').join(' ')}>
            {code}
          </Text>
          {gift.expiresAt ? (
            <Text style={styles.note}>{t.validUntil(formatDate(gift.expiresAt))}</Text>
          ) : null}
          <Button
            label={t.share}
            variant="secondary"
            fullWidth
            onPress={() => void Share.share({ message: t.shareText(code) }).catch(() => undefined)}
          />
        </>
      ) : null}
      {gift.status === 'PENDING_PAYMENT' && checkoutUrl ? (
        <>
          <Text style={styles.note}>{t.waitingText}</Text>
          <Button
            label={t.continuePay}
            variant="secondary"
            fullWidth
            onPress={() => void Linking.openURL(checkoutUrl).catch(() => undefined)}
          />
        </>
      ) : null}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    text: { color: c.textSecondary, ...nativeTextStyle('body') },
    group: {
      borderRadius: radius.cardLarge,
      borderWidth: layout.borderWidth,
      borderColor: c.hairline,
      backgroundColor: c.surface,
      overflow: 'hidden',
    },
    section: { gap: spacing.md, marginTop: spacing.sm },
    heading: { color: c.textPrimary, ...nativeTextStyle('h2') },
    card: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.cardLarge,
      borderWidth: layout.borderWidth,
      borderColor: c.hairline,
      backgroundColor: c.surface,
    },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    cardTitle: {
      flex: 1,
      color: c.textPrimary,
      ...nativeTextStyle('body'),
      fontFamily: nativeFontFamily.ui[600],
    },
    code: {
      color: c.accent,
      textAlign: 'center',
      letterSpacing: layout.heroTracking,
      ...nativeTextStyle('h1'),
      fontFamily: nativeFontFamily.ui[600],
    },
    note: { color: c.textSecondary, ...nativeTextStyle('small') },
  });
