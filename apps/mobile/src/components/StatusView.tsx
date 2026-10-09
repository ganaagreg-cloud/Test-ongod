import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '@ongod/tokens';
import { AuroraBackground, EmptyState, SurfaceProvider } from '../ui';

/** A calm full-screen message (no connection, update required, unexpected error). */
export function StatusView({
  title,
  text,
  action,
}: {
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <SurfaceProvider surface="dark">
      <View style={styles.root}>
        <AuroraBackground variant="soft" />
        <EmptyState title={title} text={text} action={action} />
      </View>
    </SurfaceProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
