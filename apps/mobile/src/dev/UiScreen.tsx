// DEV ONLY: the mobile component page (same idea as portal /dev/ui). Reached through
// app/dev/ui.tsx, which only loads this file when __DEV__ is true, so it is not in release builds.
// Every component is shown on BOTH surfaces (dark and cream) with its motion; "Replay" remounts
// them so entrances can be watched again. Query: ?surface=dark|cream|both  &section=<id>.
// Demo text is Mongolian on purpose (it is what the real screens will say) but is not product copy.
import { useState, type ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {
  fontFamily,
  fontWeights,
  layout,
  nativeTextStyle,
  radius,
  spacing,
  themes,
  typeScale,
  type FontRole,
  type Surface,
  type TextStyleName,
  type ThemeColors,
} from '@ongod/tokens';
import { formatDurationMn } from '@ongod/shared';
import { AudioWebNotice } from '../audio/AudioWebNotice';
import { audioAvailable } from '../audio/engine';
import { secureStoreBackend } from '../storage/secureStore';
import {
  AuroraBackground,
  Badge,
  Button,
  CategoryCard,
  ChipRow,
  CodeInput,
  EmptyState,
  EpisodeCard,
  EpisodeRow,
  EpisodeRowSkeleton,
  Equalizer,
  HeroCarousel,
  Icon,
  Input,
  ListItem,
  MiniPlayer,
  MountainLine,
  NumberTicker,
  Segmented,
  Sheet,
  Skeleton,
  SurfaceProvider,
  TabBar,
  TextLink,
  useSurface,
  useThemedStyles,
  useToast,
  type BadgeTone,
  type HeroItem,
  type TabItem,
} from '../ui';

/** Mongolian-specific letters Ө/ө and Ү/ү (see the portal font check). */
const FONT_TEST_STRING = 'Өвөг Үүл өөрөө үүрд ӨҮ';

const TONES: Array<[BadgeTone, string]> = [
  ['neutral', '32 мин'],
  ['active', 'Идэвхтэй'],
  ['success', 'Баталгаажсан'],
  ['warning', 'Хүлээгдэж байна'],
  ['danger', 'Татгалзсан'],
  ['info', 'Шалгаж байна'],
];

const CHIPS = [
  { id: 'all', label: 'Бүгд' },
  { id: 'psy', label: 'Сэтгэл зүй' },
  { id: 'dev', label: 'Хөгжил' },
  { id: 'rel', label: 'Харилцаа' },
  { id: 'fin', label: 'Санхүү' },
];
const SORTS = [
  { id: 'new', label: 'Шинэ' },
  { id: 'old', label: 'Хуучин' },
  { id: 'long', label: 'Урт' },
];
const TABS: TabItem[] = [
  { key: 'home', label: 'Нүүр', icon: 'home' },
  { key: 'library', label: 'Сан', icon: 'library' },
  { key: 'saved', label: 'Хадгалсан', icon: 'bookmark' },
  { key: 'profile', label: 'Профайл', icon: 'profile' },
];
const HERO: HeroItem[] = [
  {
    id: '1',
    tag: 'Шинэ цуврал',
    title: 'Тал нутгийн ухаан',
    meta: '8 дугаар · дундаж 32 мин',
    family: 'forest',
  },
  { id: '2', tag: 'Онцлох', title: 'Өөрийгөө ялах урлаг', meta: '№ 001 · 41 мин', family: 'teal' },
  {
    id: '3',
    tag: 'Энэ сарын сэдэв',
    title: 'Зуршил ба сахилга бат',
    meta: '5 дугаар · 2 цаг 40 мин',
    family: 'bronze',
  },
];

export const SECTIONS = [
  'type',
  'colors',
  'buttons',
  'inputs',
  'selection',
  'code',
  'episodes',
  'home',
  'nav',
  'feedback',
  'motion',
  'icons',
] as const;
type SectionId = (typeof SECTIONS)[number];

function Section({
  id,
  only,
  title,
  children,
}: {
  id: SectionId;
  only: string | undefined;
  title: string;
  children: ReactNode;
}) {
  const styles = useThemedStyles(makeStyles);
  if (only && only !== id) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.h2} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Showcase({ only }: { only: string | undefined }) {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const [chip, setChip] = useState('psy');
  const [sort, setSort] = useState('new');
  const [saved, setSaved] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('48');
  const [codeError, setCodeError] = useState<string | undefined>();
  const [tab, setTab] = useState('home');
  const [playing, setPlaying] = useState(true);
  const [count, setCount] = useState(36);
  const { colors, surface } = useSurface();

  return (
    <View style={styles.frameContent}>
      <Section id="type" only={only} title="Mongolian glyph test + type scale">
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

      <Section id="colors" only={only} title="Colors">
        <View style={styles.swatches}>
          {Object.entries(colors).map(([name, value]) => (
            <View key={name} style={styles.swatch}>
              <View style={[styles.chip, { backgroundColor: value }]} />
              <Text style={styles.label}>{name}</Text>
            </View>
          ))}
        </View>
      </Section>

      <Section id="buttons" only={only} title="Button (press = snappy spring + haptic)">
        <Button label="Нэвтрэх" sheen fullWidth />
        <Button label="Тоглуулах" variant="inverse" fullWidth />
        <Button label="Бүртгүүлэх" variant="secondary" fullWidth />
        <View style={styles.pair}>
          <View style={styles.grow}>
            <Button label="Нууц үгээ мартсан" variant="ghost" fullWidth />
          </View>
          <View style={styles.grow}>
            <Button label="Гарах" variant="destructive" fullWidth />
          </View>
        </View>
        <Button
          label={loading ? 'Түр хүлээнэ үү' : 'Дарж ачаалах'}
          loading={loading}
          onPress={() => setLoading(true)}
          fullWidth
        />
        <Button label="Идэвхгүй" disabled fullWidth />
        <TextLink label="Нууц үгээ мартсан уу?" onPress={() => undefined} />
      </Section>

      <Section id="inputs" only={only} title="Input">
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

      <Section id="selection" only={only} title="ChipRow · Segmented">
        <View style={styles.bleed}>
          <ChipRow items={CHIPS} value={chip} onChange={setChip} />
        </View>
        <Segmented items={SORTS} value={sort} onChange={setSort} label="Эрэмбэ" />
        <View style={styles.wrap}>
          {TONES.map(([tone, label]) => (
            <Badge key={tone} tone={tone} label={label} />
          ))}
        </View>
      </Section>

      <Section id="code" only={only} title="CodeInput (type 6 digits: wave · wrong: shake)">
        <CodeInput
          label="Баталгаажуулах код"
          value={code}
          onChange={(v) => {
            setCode(v);
            setCodeError(undefined);
          }}
          error={codeError}
        />
        <View style={styles.pair}>
          <View style={styles.grow}>
            <Button
              label="Алдаа"
              variant="secondary"
              onPress={() => setCodeError('Код буруу байна')}
              fullWidth
            />
          </View>
          <View style={styles.grow}>
            <Button
              label="Арилгах"
              variant="ghost"
              onPress={() => {
                setCode('');
                setCodeError(undefined);
              }}
              fullWidth
            />
          </View>
        </View>
      </Section>

      <Section id="episodes" only={only} title="EpisodeRow · EpisodeThumb · EpisodeCard">
        <EpisodeRow
          index={0}
          title="Айдастай нүүр тулах нь"
          meta="Сэтгэл зүй · 2026"
          number="№ 022"
          durationLabel="36:00"
          family="teal"
          progress={{ value: 0.58, label: '58% сонссон' }}
          save={{
            saved,
            label: saved ? 'Хадгалснаас хасах' : 'Хадгалах',
            onToggle: () => setSaved((v) => !v),
          }}
          onPress={() => toast.show('Ангийг нээлээ')}
        />
        <EpisodeRow
          index={1}
          title="Нэр нь маш урт байж болох бөгөөд хоёр мөрөөс хэтрэхгүйгээр таслагдах ёстой жишээ гарчиг"
          meta={`Хөгжил · ${formatDurationMn(75 * 60)}`}
          number="№ 017"
          durationLabel="1:15:00"
          family="bronze"
          save={{ saved: false, label: 'Хадгалах', onToggle: () => undefined }}
          onPress={() => undefined}
        />
        <EpisodeRow
          index={2}
          title="Амрах ухаан"
          meta="Харилцаа · Сонссон"
          number="№ 061"
          durationLabel="34:00"
          family="moss"
          onPress={() => undefined}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cards}
        >
          <EpisodeCard
            title="Чимээгүй байхын хүч"
            durationLabel="28:00"
            number="№ 062"
            family="plum"
            width={layout.overlayMaxWidth / 2}
            onPress={() => undefined}
          />
          <EpisodeCard
            title="Анхаарал төвлөрлийг сэргээх"
            durationLabel="25:00"
            number="№ 059"
            family="teal"
            width={layout.overlayMaxWidth / 2}
            onPress={() => undefined}
          />
        </ScrollView>
      </Section>

      <Section id="home" only={only} title="HeroCarousel · CategoryCard">
        <View style={styles.bleed}>
          <HeroCarousel
            items={HERO}
            onOpen={() => toast.show('Анги')}
            onPlay={() => toast.show('Тоглуулъя', { tone: 'success' })}
            playLabel="Тоглуулах"
            slideLabel={(n) => `${n}-р слайд`}
          />
        </View>
        <CategoryCard
          name="Сэтгэл зүй"
          countLabel="24 дугаар"
          family="forest"
          onPress={() => undefined}
        />
        <CategoryCard
          name="Хувь хүний хөгжил"
          countLabel="18 дугаар"
          family="bronze"
          onPress={() => undefined}
        />
      </Section>

      <Section id="nav" only={only} title="TabBar · MiniPlayer (always dark glass)">
        <View style={styles.stage}>
          <MiniPlayer
            title="Айдастай нүүр тулах нь"
            subtitle="№ 022 · Сэтгэл зүй"
            family="teal"
            playing={playing}
            progress={0.42}
            onOpen={() => undefined}
            onTogglePlay={() => setPlaying((p) => !p)}
            playLabel="Тоглуулах"
            pauseLabel="Түр зогсоох"
          />
          <TabBar items={TABS} activeKey={tab} onSelect={setTab} />
        </View>
      </Section>

      <Section id="feedback" only={only} title="Skeleton · EmptyState · Sheet · Toast">
        <EpisodeRowSkeleton />
        <EpisodeRowSkeleton />
        <View style={styles.wrap}>
          <Skeleton shape="pill" width={96} />
          <Skeleton shape="pill" width={72} />
        </View>
        <EmptyState
          title="Хадгалсан анги алга"
          text="Анги дээрх тэмдэглэгээг дарж хадгалаарай."
          action={<Button label="Сан руу очих" variant="secondary" />}
        />
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
        <Sheet
          visible={sheet}
          onClose={() => setSheet(false)}
          title="Таны эрх идэвхгүй байна"
          closeLabel="Хаах"
        >
          <Button label="Эрхээ шалгах" onPress={() => setSheet(false)} fullWidth />
        </Sheet>
      </Section>

      <Section id="motion" only={only} title="NumberTicker · Equalizer · MountainLine · Aurora">
        <View style={styles.wrap}>
          <NumberTicker value={count} />
          <Button label="+17" variant="ghost" onPress={() => setCount((c) => c + 17)} />
          <Equalizer playing />
        </View>
        <MountainLine draw color={surface === 'cream' ? colors.brand : colors.accent} />
        <View style={styles.aurora}>
          <AuroraBackground variant="welcome" />
        </View>
      </Section>

      <Section id="icons" only={only} title="Icons">
        <View style={styles.wrap}>
          {(
            [
              'bookmark',
              'bookmarkFilled',
              'chevronRight',
              'chevronLeft',
              'close',
              'check',
              'alert',
              'info',
              'play',
              'pause',
              'copy',
              'home',
              'library',
              'profile',
              'bell',
              'search',
              'mail',
            ] as const
          ).map((name) => (
            <View key={name} style={styles.icon}>
              <Icon name={name} color={colors.textSecondary} />
              <Text style={styles.label}>{name}</Text>
            </View>
          ))}
        </View>
        <ListItem title="Хэрэглэгчийн нэр" value="@bat" onPress={() => undefined} />
        <ListItem title="Бүртгэл устгах" tone="destructive" onPress={() => undefined} />
        <Text style={styles.label}>
          platform: {Platform.OS} · secure storage: {secureStoreBackend} · audio engine:{' '}
          {audioAvailable ? 'native' : 'stub'}
        </Text>
        <AudioWebNotice />
      </Section>
    </View>
  );
}

export default function UiScreen() {
  const params = useLocalSearchParams<{ surface?: string; section?: string }>();
  const [which, setWhich] = useState(params.surface ?? 'both');
  const [run, setRun] = useState(0);
  const surfaces: Surface[] =
    which === 'dark' ? ['dark'] : which === 'cream' ? ['cream'] : ['dark', 'cream'];

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.toolbar}>
        <Text style={styles.title}>/dev/ui</Text>
        <View style={styles.toolbarRow}>
          <View style={styles.toolbarGrow}>
            <Segmented
              items={[
                { id: 'dark', label: 'Dark' },
                { id: 'cream', label: 'Cream' },
                { id: 'both', label: 'Both' },
              ]}
              value={which}
              onChange={setWhich}
              label="Surface"
            />
          </View>
          <Button label="Replay" variant="ghost" onPress={() => setRun((n) => n + 1)} />
        </View>
      </View>
      {surfaces.map((surface) => (
        <SurfaceProvider key={surface} surface={surface}>
          <Frame surface={surface}>
            <Showcase key={run} only={params.section} />
          </Frame>
        </SurfaceProvider>
      ))}
    </ScrollView>
  );
}

function Frame({ surface, children }: { surface: Surface; children: ReactNode }) {
  return (
    <View style={[styles.frame, { backgroundColor: themes[surface].bg }]}>
      <Text style={[styles.surfaceTag, { color: themes[surface].textTertiary }]}>{surface}</Text>
      {children}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    frameContent: { gap: spacing.xxl },
    section: { gap: spacing.md },
    row: { gap: spacing.xxs },
    wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
    pair: { flexDirection: 'row', gap: spacing.xs },
    grow: { flex: 1 },
    cards: { gap: spacing.md },
    bleed: { marginHorizontal: -layout.screenPadding },
    swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    swatch: { width: spacing.huge * 2, gap: spacing.xxs },
    chip: {
      height: spacing.xxxl,
      borderRadius: radius.small,
      borderWidth: layout.borderWidth,
      borderColor: c.hairline,
    },
    icon: { alignItems: 'center', gap: spacing.xxs, minWidth: layout.touchTarget },
    stage: { gap: layout.miniPlayerGap, paddingVertical: spacing.md },
    aurora: { height: layout.auroraMedium, borderRadius: radius.hero, overflow: 'hidden' },
    h2: { color: c.textPrimary, ...nativeTextStyle('h2') },
    label: { color: c.textTertiary, ...nativeTextStyle('caption') },
    sample: { color: c.textPrimary },
  });

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: themes.dark.bg },
  content: { gap: spacing.xl, paddingBottom: spacing.huge },
  toolbar: { gap: spacing.sm, padding: layout.screenPadding, backgroundColor: themes.dark.bg },
  toolbarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  toolbarGrow: { flex: 1 },
  title: { color: themes.dark.textPrimary, ...nativeTextStyle('display') },
  frame: { padding: layout.screenPadding, gap: spacing.xl },
  surfaceTag: { ...nativeTextStyle('caption') },
});
