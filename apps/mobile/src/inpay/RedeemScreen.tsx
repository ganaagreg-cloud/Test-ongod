// ADR-0090: entering a gift code in the app. Exists only while the switch `inAppPayment` is on.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { formatGiftCode, normalizeGiftCode } from '@ongod/shared';
import {
  layout,
  nativeTextStyle,
  radius,
  spacing,
  withAlpha,
  type ThemeColors,
} from '@ongod/tokens';
import { ApiError } from '../api';
import { useAuth } from '../auth/AuthContext';
import { AuthHeader } from '../components/AuthHeader';
import { formatDate } from '../lib/format';
import { useSubmit } from '../lib/useSubmit';
import { BackHeader } from '../screens/BackHeader';
import { Button, haptic, Icon, Input, Screen, useSurface, useThemedStyles } from '../ui';
import { inpayApi } from './api';
import { inpayMn } from './mn';

const CODE_LENGTH = 12;
const t = inpayMn.redeem;

/**
 * One field for the code `XXXX-XXXX-XXXX`, then "Эрх идэвхжлээ". `welcome` is the optional step
 * right after a new sign-up: it can be skipped and ends on Home instead of going back.
 */
export function RedeemScreen({ welcome = false }: { welcome?: boolean }) {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const { pending, run } = useSubmit();
  const styles = useThemedStyles(makeStyles);
  const { colors } = useSurface();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [until, setUntil] = useState<string | null>();

  const leave = () => (welcome ? router.replace('/home') : router.back());

  async function submit() {
    const normalized = normalizeGiftCode(code);
    if (normalized.length !== CODE_LENGTH) {
      setError(t.invalid);
      return;
    }
    await run(async () => {
      try {
        const res = await inpayApi.redeemGift(normalized);
        haptic.success();
        setUntil(res.accessUntil);
        await refreshUser().catch(() => undefined);
      } catch (cause) {
        // The server's own text (wrong or used code, email not confirmed, too many tries) sits
        // under the field, where the member is looking.
        if (cause instanceof ApiError && cause.status !== 0 && cause.status < 500) {
          haptic.error();
          setError(cause.message);
          return;
        }
        throw cause;
      }
    });
  }

  if (until !== undefined) {
    return (
      <Screen>
        <View style={styles.done}>
          <View style={styles.badge}>
            <Icon name="check" color={colors.success} />
          </View>
          <Text style={styles.doneTitle} accessibilityRole="header">
            {t.doneTitle}
          </Text>
          {until ? <Text style={styles.text}>{t.doneText(formatDate(until))}</Text> : null}
        </View>
        <Button label={welcome ? t.start : t.close} fullWidth onPress={leave} />
      </Screen>
    );
  }

  return (
    <Screen>
      {welcome ? (
        <AuthHeader icon="gift" title={t.welcomeTitle} text={t.welcomeText} />
      ) : (
        <BackHeader title={t.title} />
      )}
      {welcome ? null : <Text style={styles.text}>{t.text}</Text>}
      <Input
        label={t.label}
        placeholder={t.placeholder}
        value={code}
        onChangeText={(value) => {
          setCode(formatGiftCode(normalizeGiftCode(value).slice(0, CODE_LENGTH)));
          setError(undefined);
        }}
        error={error}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
      />
      <Button label={t.submit} fullWidth loading={pending} onPress={() => void submit()} />
      {welcome ? <Button label={t.skip} variant="ghost" fullWidth onPress={leave} /> : null}
    </Screen>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    text: { color: c.textSecondary, ...nativeTextStyle('body') },
    done: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
    badge: {
      width: layout.iconTile,
      height: layout.iconTile,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(c.success, 0.12),
    },
    doneTitle: { color: c.textPrimary, textAlign: 'center', ...nativeTextStyle('display') },
  });
