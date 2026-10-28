import type { CSSProperties, ReactNode } from 'react';
import { coverFamilies } from '@ongod/tokens';

const FAMILIES = Object.values(coverFamilies);

/**
 * Typographic 16:9 cover in one of the DESIGN cover families (an episode without a picture).
 * The colors come from packages/tokens; the layout is `.portal-typecover` in portal.css.
 */
export function TypeCover({
  index,
  className,
  children,
}: {
  /** Picks the cover family (cycles through the five). */
  index: number;
  className?: string;
  children?: ReactNode;
}) {
  const [from, middle, to] = FAMILIES[index % FAMILIES.length]!;
  const style: CSSProperties = {
    background: `linear-gradient(135deg, ${from}, ${middle} 55%, ${to})`,
  };
  return (
    <span
      className={className ? `portal-typecover ${className}` : 'portal-typecover'}
      style={style}
    >
      {children}
    </span>
  );
}
