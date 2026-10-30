import { View } from 'react-native';
import Svg, { Path, Text as SvgText } from 'react-native-svg';
import { iconPaths, iconStrokeWidth, iconViewBox, layout, nativeFontFamily } from '@ongod/tokens';
import { useSurface } from './surface';

/** Digit height in the 24-unit icon box: a third of it leaves clear room inside the arrow. */
const NUMBER_SIZE = iconViewBox / 3;
/** Digits sit on the baseline; this lifts it so their middle is on the circle's centre. */
const BASELINE_SHIFT = NUMBER_SIZE * 0.35;

/**
 * The round "skip" arrow with the seconds inside. The back and forward arrows are mirror images
 * (assets.ts) and the number is drawn in the same SVG, centred on the arrow's circle, so it
 * scales with the icon instead of being laid over it. Decorative: the label is on the button.
 */
export function SkipIcon({
  direction,
  seconds,
  size = layout.iconSizeLarge,
  color,
}: {
  direction: 'back' | 'forward';
  seconds: number;
  size?: number;
  color?: string;
}) {
  const { colors } = useSurface();
  const tint = color ?? colors.textPrimary;
  const { paths } = iconPaths[direction === 'back' ? 'skipBack' : 'skipForward'];
  const centre = iconViewBox / 2;
  return (
    <View aria-hidden>
      <Svg width={size} height={size} viewBox={`0 0 ${iconViewBox} ${iconViewBox}`}>
        {paths.map((d) => (
          <Path
            key={d}
            d={d}
            fill="none"
            stroke={tint}
            strokeWidth={iconStrokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        <SvgText
          x={centre}
          y={centre + BASELINE_SHIFT}
          fill={tint}
          fontSize={NUMBER_SIZE}
          fontFamily={nativeFontFamily.ui[600]}
          textAnchor="middle"
        >
          {String(seconds)}
        </SvgText>
      </Svg>
    </View>
  );
}
