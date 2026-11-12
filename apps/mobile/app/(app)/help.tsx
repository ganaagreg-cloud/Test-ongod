import { Linking, StyleSheet, Text, View } from 'react-native';
import {
  layout,
  nativeFontFamily,
  nativeTextStyle,
  radius,
  spacing,
  type ThemeColors,
} from '@ongod/tokens';
import { useAppConfig } from '../../src/config/useAppConfig';
import { mn } from '../../src/i18n/mn';
import { BackHeader } from '../../src/screens/BackHeader';
import { Button, Screen, useThemedStyles } from '../../src/ui';

/**
 * Тусламж: the questions members ask most and the support address (`SUPPORT_EMAIL`, which the
 * server publishes in /v1/app-config). Without an address the contact block is left out.
 */
export default function Help() {
  const styles = useThemedStyles(makeStyles);
  const { supportEmail } = useAppConfig();
  return (
    <Screen>
      <BackHeader title={mn.help.title} />
      <View style={styles.group}>
        {mn.help.items.map((item) => (
          <View key={item.title} style={styles.item}>
            <Text style={styles.title} accessibilityRole="header">
              {item.title}
            </Text>
            <Text style={styles.text}>{item.text}</Text>
          </View>
        ))}
      </View>
      {supportEmail ? (
        <View style={styles.contact}>
          <Text style={styles.title} accessibilityRole="header">
            {mn.help.contactTitle}
          </Text>
          <Text style={styles.text}>{mn.help.contactText}</Text>
          <Text style={styles.email} selectable>
            {supportEmail}
          </Text>
          <Button
            label={mn.help.writeEmail}
            icon="mail"
            variant="secondary"
            fullWidth
            onPress={() => void Linking.openURL(`mailto:${supportEmail}`).catch(() => undefined)}
          />
        </View>
      ) : null}
    </Screen>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    group: {
      borderRadius: radius.cardLarge,
      borderWidth: layout.borderWidth,
      borderColor: c.hairline,
      backgroundColor: c.surface,
      overflow: 'hidden',
    },
    item: {
      gap: spacing.xxs,
      padding: spacing.md,
      borderBottomWidth: layout.borderWidth,
      borderBottomColor: c.hairline,
    },
    contact: { gap: spacing.sm },
    title: {
      color: c.textPrimary,
      ...nativeTextStyle('body'),
      fontFamily: nativeFontFamily.ui[600],
    },
    text: { color: c.textSecondary, ...nativeTextStyle('small') },
    email: { color: c.accent, ...nativeTextStyle('body') },
  });
