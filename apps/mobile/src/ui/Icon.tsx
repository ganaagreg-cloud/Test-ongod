import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import {
  colors,
  iconPaths,
  iconStrokeWidth,
  iconViewBox,
  layout,
  mountainLine,
  type IconName,
} from '@ongod/tokens';

// The SVG sits inside a View that is hidden from screen readers: View maps `aria-hidden` on both
// native and web, while react-native-svg would leak native-only props to the DOM on web.

/** Decorative icon: put the accessible name on the Pressable around it. */
export function Icon({
  name,
  size = 'regular',
  color = colors.textPrimary,
}: {
  name: IconName;
  size?: 'regular' | 'small';
  color?: string;
}) {
  const { paths, filled } = iconPaths[name];
  const px = size === 'small' ? layout.iconSizeSmall : layout.iconSize;
  return (
    <View aria-hidden>
      <Svg
        width={px}
        height={px}
        viewBox={`0 0 ${iconViewBox} ${iconViewBox}`}
        fill={filled ? color : 'none'}
        stroke={filled ? 'none' : color}
        strokeWidth={iconStrokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {paths.map((d) => (
          <Path key={d} d={d} />
        ))}
      </Svg>
    </View>
  );
}

/** The single thin mountain-line motif: empty states, auth screens only. */
export function MountainLine({ color = colors.textTertiary }: { color?: string }) {
  return (
    <View aria-hidden>
      <Svg
        width={layout.motifWidth}
        height={layout.motifHeight}
        viewBox={mountainLine.viewBox}
        fill="none"
        stroke={color}
        strokeWidth={mountainLine.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Path d={mountainLine.path} />
      </Svg>
    </View>
  );
}
