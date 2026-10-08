import {
  fontFamily,
  fontWeights,
  typeScale,
  type FontRole,
  type TextStyleName,
} from '@ongod/tokens';
import './UiPage.css';

/** Mongolian-specific letters Ө/ө and Ү/ү, which live only in the cyrillic-ext subset. */
const FONT_TEST_STRING = 'Өвөг Үүл өөрөө үүрд ӨҮ';

export default function UiPage() {
  return (
    <main className="dev-ui">
      {(Object.keys(typeScale) as TextStyleName[]).map((name) => {
        const { font, weight, fontSize, lineHeight } = typeScale[name];
        return (
          <section key={name} className="dev-ui__row">
            <div className="text-caption dev-ui__label">
              {name} · {fontFamily[font]} {weight} · {fontSize}/{lineHeight}
            </div>
            <div className={`text-${name}`}>{FONT_TEST_STRING}</div>
          </section>
        );
      })}

      {/* Every loaded weight, including ones not used by the type scale. */}
      {(Object.keys(fontWeights) as FontRole[]).flatMap((role) =>
        fontWeights[role].map((weight) => (
          <section key={`${role}-${weight}`} className="dev-ui__row">
            <div className="text-caption dev-ui__label">
              {fontFamily[role]} {weight}
            </div>
            <div
              className="text-body"
              style={{ fontFamily: `var(--font-${role})`, fontWeight: weight }}
            >
              {FONT_TEST_STRING}
            </div>
          </section>
        )),
      )}
    </main>
  );
}
