// DEV ONLY: the mobile component page (same idea as portal /dev/ui). Reached through
// app/dev/ui.tsx, which only loads this file when __DEV__ is true, so it is not in release builds.
// Demo text is Mongolian on purpose (it is what the real screens will say) but is not product copy.
import { useState, type ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  colors,
  fontFamily,
  fontWeights,
  layout,
  nativeTextStyle,
  radius,
  spacing,
  typeScale,
  type FontRole,
  type TextStyleName,
} from '@ongod/tokens';
import { formatDurationMn } from '@ongod/shared';
import { AudioWebNotice } from '../audio/AudioWebNotice';
import { audioAvailable } from '../audio/engine';
import { secureStoreBackend } from '../storage/secureStore';
import {
  Badge,
  Button,
  Chip,
  EmptyState,
  EpisodeCard,
  EpisodeRow,
  EpisodeRowSkeleton,
  Icon,
  Input,
  ListItem,
  Sheet,
  Skeleton,
  useToast,
  type BadgeTone,
} from '../ui';

/** Mongolian-specific letters Ө/ө and Ү/ү (see the portal font check). */
const FONT_TEST_STRING = 'Өвөг Үүл өөрөө үүрд ӨҮ';

/** Real covers are JPEG/WebP over HTTPS; the demo shows the placeholder (the web gallery shows covers). */

const TONES: Array<[BadgeTone, string]> = [
  ['neutral', '32 мин'],
  ['active', 'Идэвхтэй'],
  ['success', 'Баталгаажсан'],
  ['warning', 'Хүлээгдэж байна'],
  ['danger', 'Татгалзсан'],
  ['info', 'Шалгаж байна'],
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.h2} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

export default function UiScreen() {
  const toast = useToast();
  const [category, setCategory] = useState('all');
  const [saved, setSaved] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.display}>/dev/ui</Text>

      <Section title="Mongolian glyph test">
        <Text style={[styles.sample, nativeTextStyle('display')]}>{FONT_TEST_STRING}</Text>
        <Text style={[styles.sample, nativeTextStyle('body')]}>{FONT_TEST_STRING}</Text>
      </Section>

      <Section title="Type scale">
        {(Object.keys(typeScale) as TextStyleName[]).map((name) => {
          const { font, weight, fontSize, lineHeight } = typeScale[name];
          return (
            <View key={name} style={styles.row}>
              <Text style={styles.label}>
                {name} · {fontFamily[font]} {weight} · {fontSize}/{lineHeight}
              </Text>
              <Text style={[styles.sample, nativeTextStyle(name)]}>{FONT_TEST_STRING}</Text>
            </View>
          );
        })}
        {(Object.keys(fontWeights) as FontRole[]).flatMap((role) =>
          fontWeights[role].map((weight) => (
            <Text key={`${role}-${weight}`} style={styles.label}>
              {fontFamily[role]} {weight}
            </Text>
          )),
        )}
      </Section>

      <Section title="Colors">
        <View style={styles.swatches}>
          {Object.entries(colors).map(([name, value]) => (
            <View key={name} style={styles.swatch}>
              <View style={[styles.chip, { backgroundColor: value }]} />
              <Text style={styles.label}>{name}</Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Button">
        <Button label="Нэвтрэх" fullWidth />
        <Button label="Бүртгүүлэх" variant="secondary" fullWidth />
        <Button label="Нууц үгээ мартсан" variant="ghost" fullWidth />
        <Button label="Бүртгэл устгах" variant="destructive" fullWidth />
        <Button
          label={loading ? 'Түр хүлээнэ үү' : 'Дарж ачаалах'}
          loading={loading}
          onPress={() => setLoading(true)}
          fullWidth
        />
        <Button label="Идэвхгүй" disabled fullWidth />
      </Section>

      <Section title="Input">
        <Input
          label="Имэйл"
          placeholder="name@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
          hint="Баталгаажуулах код энэ хаяг руу очно."
        />
        <Input
          label="Нууц үг"
          secureTextEntry
          defaultValue="1234567"
          error="Хамгийн багадаа 8 тэмдэгт"
        />
        <Input label="Идэвхгүй" editable={false} defaultValue="Засах боломжгүй" />
      </Section>

      <Section title="Chip">
        <View style={styles.wrap}>
          {[
            ['all', 'Бүгд'],
            ['history', 'Түүх'],
            ['stories', 'Үлгэр'],
            ['music', 'Хөгжим'],
          ].map(([id, label]) => (
            <Chip
              key={id}
              label={label!}
              selected={category === id}
              onPress={() => setCategory(id!)}
            />
          ))}
        </View>
      </Section>

      <Section title="Badge">
        <View style={styles.wrap}>
          {TONES.map(([tone, label]) => (
            <Badge key={tone} tone={tone} label={label} />
          ))}
        </View>
      </Section>

      <Section title="EpisodeRow">
        <EpisodeRow
          title="Чингис хааны нууц товчоо: эхний бүлэг"
          meta={`Түүх · ${formatDurationMn(32 * 60)}`}
          progress={{ value: 0.45, label: '45% сонссон' }}
          save={{
            saved,
            label: saved ? 'Хадгалснаас хасах' : 'Хадгалах',
            onToggle: () => setSaved((v) => !v),
          }}
          onPress={() => toast.show('Ангийг нээлээ')}
        />
        <EpisodeRow
          title="Нэр нь маш урт байж болох бөгөөд хоёр мөрөөс хэтрэхгүйгээр таслагдах ёстой жишээ гарчиг"
          meta={`Үлгэр · ${formatDurationMn(75 * 60)}`}
          save={{ saved: false, label: 'Хадгалах', onToggle: () => undefined }}
          onPress={() => undefined}
        />
        <EpisodeRow
          title="Зураггүй анги"
          meta={`Хөгжим · ${formatDurationMn(18 * 60)}`}
          onPress={() => undefined}
        />
      </Section>

      <Section title="EpisodeCard">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cards}
        >
          <EpisodeCard
            title="Хөх тэнгэрийн домог"
            durationLabel={formatDurationMn(41 * 60)}
            width={layout.overlayMaxWidth / 2.4}
            onPress={() => undefined}
          />
          <EpisodeCard
            title="Говийн шөнийн дуу"
            durationLabel={formatDurationMn(26 * 60)}
            width={layout.overlayMaxWidth / 2.4}
            onPress={() => undefined}
          />
          <EpisodeCard
            title="Алтайн цээжин дэх зүрх"
            durationLabel={formatDurationMn(58 * 60)}
            width={layout.overlayMaxWidth / 2.4}
            onPress={() => undefined}
          />
        </ScrollView>
      </Section>

      <Section title="ListItem">
        <View>
          <ListItem title="Хэрэглэгчийн нэр" value="@bat" onPress={() => undefined} />
          <ListItem title="Имэйл" value="bat@example.com" onPress={() => undefined} />
          <ListItem title="Төхөөрөмжүүд" icon="info" onPress={() => undefined} />
          <ListItem title="Бүртгэл устгах" tone="destructive" onPress={() => undefined} />
        </View>
      </Section>

      <Section title="Skeleton">
        <EpisodeRowSkeleton />
        <EpisodeRowSkeleton />
        <View style={styles.wrap}>
          <Skeleton shape="pill" width={96} />
          <Skeleton shape="pill" width={72} />
        </View>
      </Section>

      <Section title="EmptyState">
        <EmptyState
          title="Хадгалсан анги алга"
          text="Анги дээрх тэмдэглэгээг дарж хадгалаарай."
          action={<Button label="Сан руу очих" variant="secondary" />}
        />
      </Section>

      <Section title="Sheet and Toast">
        <Button label="Sheet нээх" variant="secondary" onPress={() => setSheet(true)} fullWidth />
        <Button
          label="Toast: амжилттай"
          variant="secondary"
          onPress={() => toast.show('Хадгаллаа', { tone: 'success' })}
          fullWidth
        />
        <Button
          label="Toast: алдаа"
          variant="secondary"
          onPress={() => toast.show('Холболт тасарлаа', { tone: 'danger' })}
          fullWidth
        />
        <Button
          label="Toast: мэдээлэл"
          variant="secondary"
          onPress={() => toast.show('Шинэ анги нэмэгдлээ')}
          fullWidth
        />
        <Sheet
          visible={sheet}
          onClose={() => setSheet(false)}
          title="Таны эрх идэвхгүй байна"
          closeLabel="Хаах"
        >
          <Button label="Эрхээ шалгах" onPress={() => setSheet(false)} fullWidth />
        </Sheet>
      </Section>

      <Section title="Icons">
        <View style={styles.wrap}>
          {(
            [
              'bookmark',
              'bookmarkFilled',
              'chevronRight',
              'close',
              'check',
              'alert',
              'info',
              'play',
              'pause',
              'copy',
            ] as const
          ).map((name) => (
            <View key={name} style={styles.icon}>
              <Icon name={name} color={colors.textSecondary} />
              <Text style={styles.label}>{name}</Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Platform guards">
        <Text style={styles.label}>
          platform: {Platform.OS} · secure storage: {secureStoreBackend} · audio engine:{' '}
          {audioAvailable ? 'native' : 'stub'}
        </Text>
        <AudioWebNotice />
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: layout.screenPadding, gap: spacing.xxl, paddingBottom: spacing.huge },
  section: { gap: spacing.md },
  row: { gap: spacing.xxs },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  cards: { gap: spacing.md },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  swatch: { width: spacing.huge * 2, gap: spacing.xxs },
  chip: {
    height: spacing.xxxl,
    borderRadius: radius.small,
    borderWidth: layout.borderWidth,
    borderColor: colors.hairline,
  },
  icon: { alignItems: 'center', gap: spacing.xxs, minWidth: layout.touchTarget },
  display: { color: colors.textPrimary, ...nativeTextStyle('display') },
  h2: { color: colors.textPrimary, ...nativeTextStyle('h2') },
  label: { color: colors.textTertiary, ...nativeTextStyle('caption') },
  sample: { color: colors.textPrimary },
});
