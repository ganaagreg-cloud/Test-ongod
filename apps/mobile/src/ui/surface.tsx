import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { themes, type Surface, type ThemeColors } from '@ongod/tokens';

interface SurfaceValue {
  surface: Surface;
  colors: ThemeColors;
}

const SurfaceContext = createContext<SurfaceValue>({ surface: 'dark', colors: themes.dark });

/**
 * Screens choose a surface (ADR-0028): `dark` for listening screens, `cream` for browsing
 * screens. Every kit component reads its colors from here, so the same component works on both.
 * `<Screen surface="cream">` mounts this for you.
 */
export function SurfaceProvider({ surface, children }: { surface: Surface; children: ReactNode }) {
  const value = useMemo(() => ({ surface, colors: themes[surface] }), [surface]);
  return <SurfaceContext.Provider value={value}>{children}</SurfaceContext.Provider>;
}

export function useSurface(): SurfaceValue {
  return useContext(SurfaceContext);
}

/**
 * Styles that depend on the surface. Pass a MODULE-LEVEL factory (so it is stable):
 *   const makeStyles = (c: ThemeColors) => StyleSheet.create({ ... });
 *   const styles = useThemedStyles(makeStyles);
 */
export function useThemedStyles<T>(factory: (c: ThemeColors) => T): T {
  const { colors } = useSurface();
  return useMemo(() => factory(colors), [factory, colors]);
}
