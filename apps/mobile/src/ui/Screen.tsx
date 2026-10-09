import { Children, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout, spacing, type Surface } from '@ongod/tokens';
import { AuroraBackground } from './AuroraBackground';
import { Enter } from './Enter';
import { SurfaceProvider, useSurface } from './surface';

/**
 * The frame of a form screen: surface background (`dark` listening / `cream` browsing, ADR-0028),
 * safe-area padding, screen side padding, and the keyboard pushes the content up instead of
 * covering it. Taps on buttons work while the keyboard is open.
 *
 * Dark screens get a still aurora glow in the corner. Every direct child enters one after the
 * other (fade + rise, 60 ms apart); pass `stagger={false}` to switch that off.
 */
export function Screen({
  children,
  surface = 'dark',
  background,
  stagger = true,
}: {
  children: ReactNode;
  surface?: Surface;
  /** Drawn behind the content, inside the frame. Default on dark: <AuroraBackground variant="soft" />. */
  background?: ReactNode;
  stagger?: boolean;
}) {
  return (
    <SurfaceProvider surface={surface}>
      <ScreenFrame
        background={background ?? (surface === 'dark' ? <AuroraBackground variant="soft" /> : null)}
        stagger={stagger}
      >
        {children}
      </ScreenFrame>
    </SurfaceProvider>
  );
}

function ScreenFrame({
  children,
  background,
  stagger,
}: {
  children: ReactNode;
  background: ReactNode;
  stagger: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useSurface();
  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {background}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + spacing.xl,
            paddingBottom: insets.bottom + spacing.xl,
          },
        ]}
      >
        {stagger
          ? Children.toArray(children).map((child, index) => (
              <Enter key={index} index={index}>
                {child}
              </Enter>
            ))
          : children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    flexGrow: 1,
    gap: spacing.lg,
    paddingHorizontal: layout.screenPadding,
  },
});
