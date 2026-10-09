import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout, spacing, type Surface } from '@ongod/tokens';
import { SurfaceProvider, useSurface } from './surface';

/**
 * The frame of a form screen: surface background (`dark` listening / `cream` browsing, ADR-0028),
 * safe-area padding, screen side padding, and the keyboard pushes the content up instead of
 * covering it. Taps on buttons work while the keyboard is open.
 */
export function Screen({
  children,
  surface = 'dark',
  background,
}: {
  children: ReactNode;
  surface?: Surface;
  /** Drawn behind the content, inside the frame (e.g. <AuroraBackground />). */
  background?: ReactNode;
}) {
  return (
    <SurfaceProvider surface={surface}>
      <ScreenFrame background={background}>{children}</ScreenFrame>
    </SurfaceProvider>
  );
}

function ScreenFrame({ children, background }: { children: ReactNode; background?: ReactNode }) {
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
        {children}
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
