// DEV ONLY: the component page shown at /dev/ui in the portal and the admin. Apps load it lazily
// under import.meta.env.DEV, so it is not in production builds. Demo text is Mongolian on purpose
// (it is what the real screens will say) but is not product copy.
import { useState } from 'react';
import {
  fontFamily,
  fontWeights,
  mountainLine,
  themes,
  typeScale,
  type FontRole,
  type TextStyleName,
} from '@ongod/tokens';
import { formatDurationMn } from '@ongod/shared';
import {
  Badge,
  Button,
  Chip,
  EmptyState,
  EpisodeCard,
  EpisodeRow,
  EpisodeRowSkeleton,
  Icon,
  FileField,
  Input,
  ListItem,
  Notice,
  Sheet,
  Skeleton,
  Textarea,
  Timeline,
  ToastProvider,
  useToast,
  type BadgeTone,
} from '../index';
import './gallery.css';

/** Mongolian-specific letters Ө/ө and Ү/ү, which live only in the cyrillic-ext subset. */
export const FONT_TEST_STRING = 'Өвөг Үүл өөрөө үүрд ӨҮ';

const cover = (shift: number) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" fill="${themes.dark.heritage}"/><path d="${mountainLine.path}" transform="translate(0 ${60 + shift})" fill="none" stroke="${themes.dark.accent}" stroke-width="${mountainLine.strokeWidth}"/></svg>`,
  )}`;

const TONES: Array<[BadgeTone, string]> = [
  ['neutral', '32 мин'],
  ['active', 'Идэвхтэй'],
  ['success', 'Баталгаажсан'],
  ['warning', 'Хүлээгдэж байна'],
  ['danger', 'Татгалзсан'],
  ['info', 'Шалгаж байна'],
];

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="dev-ui__section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Demo() {
  const toast = useToast();
  const [theme, setTheme] = useState(document.documentElement.dataset.theme ?? 'dark');
  const [category, setCategory] = useState('all');
  const [saved, setSaved] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');

  const pickTheme = (next: 'dark' | 'light') => {
    document.documentElement.dataset.theme = next;
    setTheme(next);
  };

  return (
    <main className="dev-ui">
      <h1 className="text-display">/dev/ui</h1>

      <Section id="theme" title="Theme">
        <div className="ui-row">
          <Chip selected={theme === 'dark'} onClick={() => pickTheme('dark')}>
            Харанхуй
          </Chip>
          <Chip selected={theme === 'light'} onClick={() => pickTheme('light')}>
            Цайвар (админ)
          </Chip>
        </div>
      </Section>

      <Section id="glyphs" title="Mongolian glyph test">
        <p className="text-display dev-ui__glyph">{FONT_TEST_STRING}</p>
        <p className="text-body dev-ui__glyph">{FONT_TEST_STRING}</p>
      </Section>

      <Section id="type" title="Type scale">
        {(Object.keys(typeScale) as TextStyleName[]).map((name) => {
          const { font, weight, fontSize, lineHeight } = typeScale[name];
          return (
            <div key={name} className="dev-ui__row">
              <div className="text-caption dev-ui__label">
                {name} · {fontFamily[font]} {weight} · {fontSize}/{lineHeight}
              </div>
              <div className={`text-${name}`}>{FONT_TEST_STRING}</div>
            </div>
          );
        })}
        {(Object.keys(fontWeights) as FontRole[]).flatMap((role) =>
          fontWeights[role].map((weight) => (
            <div key={`${role}-${weight}`} className="dev-ui__row">
              <div className="text-caption dev-ui__label">
                {fontFamily[role]} {weight}
              </div>
              <div
                className="text-body"
                style={{ fontFamily: `var(--font-${role})`, fontWeight: weight }}
              >
                {FONT_TEST_STRING}
              </div>
            </div>
          )),
        )}
      </Section>

      <Section id="colors" title="Colors">
        <div className="dev-ui__swatches">
          {Object.keys(themes.dark).map((name) => (
            <div key={name} className="dev-ui__swatch">
              <span
                className="dev-ui__chip"
                style={{
                  background: `var(--color-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)})`,
                }}
              />
              <span className="text-caption">{name}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section id="buttons" title="Button">
        <div className="ui-row">
          <Button>Нэвтрэх</Button>
          <Button variant="secondary">Бүртгүүлэх</Button>
          <Button variant="ghost">Нууц үгээ мартсан</Button>
          <Button variant="destructive">Бүртгэл устгах</Button>
        </div>
        <div className="ui-row">
          <Button loading={loading} onClick={() => setLoading(true)}>
            {loading ? 'Түр хүлээнэ үү' : 'Дарж ачаалах'}
          </Button>
          <Button disabled>Идэвхгүй</Button>
          <Button variant="secondary" disabled>
            Идэвхгүй
          </Button>
          <Button variant="secondary" loading>
            Хадгалж байна
          </Button>
        </div>
        <Button fullWidth>Бүтэн өргөн</Button>
      </Section>

      <Section id="inputs" title="Input">
        <Input
          label="Имэйл"
          type="email"
          placeholder="name@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          hint="Баталгаажуулах код энэ хаяг руу очно."
        />
        <Input
          label="Нууц үг"
          type="password"
          defaultValue="1234567"
          error="Хамгийн багадаа 8 тэмдэгт"
        />
        <Input label="Нэр" defaultValue="Эрдэнэ" />
        <Input label="Идэвхгүй" disabled defaultValue="Засах боломжгүй" />
      </Section>

      <Section id="fields" title="Textarea and FileField">
        <Textarea label="Төлбөрийн тэмдэглэл" hint="Хүсвэл бичнэ үү." />
        <FileField
          label="Баримтын зураг"
          accept="image/jpeg,image/png,image/webp"
          hint="JPEG, PNG эсвэл WebP, 5 MB хүртэл."
        />
        <FileField label="Алдаатай" error="Зураг 5 MB-аас том байна." />
      </Section>

      <Section id="timeline" title="Timeline">
        <Timeline
          stateLabels={{ done: 'дууссан', current: 'одоогийн алхам', upcoming: 'дараагийн алхам' }}
          steps={[
            { label: 'Хүлээгдэж байна', state: 'done', text: 'Таны хүсэлт хүлээн авлаа.' },
            { label: 'Шалгаж байна', state: 'current', text: 'Төлбөрийг шалгаж байна.' },
            { label: 'Идэвхжсэн', state: 'upcoming' },
          ]}
        />
      </Section>

      <Section id="notices" title="Notice">
        <Notice tone="info">Хүлээн авлаа.</Notice>
        <Notice tone="success" title="Идэвхжлээ">
          Таны эрх 2027.10.08 хүртэл хүчинтэй.
        </Notice>
        <Notice tone="warning">Эрх 14 хоногийн дараа дуусна.</Notice>
        <Notice tone="danger" title="Алдаа гарлаа">
          Дахин оролдоно уу.
        </Notice>
      </Section>

      <Section id="chips" title="Chip">
        <div className="ui-row">
          {[
            ['all', 'Бүгд'],
            ['history', 'Түүх'],
            ['stories', 'Үлгэр'],
            ['music', 'Хөгжим'],
          ].map(([id, label]) => (
            <Chip key={id} selected={category === id} onClick={() => setCategory(id!)}>
              {label}
            </Chip>
          ))}
        </div>
      </Section>

      <Section id="badges" title="Badge">
        <div className="ui-row">
          {TONES.map(([tone, label]) => (
            <Badge key={tone} tone={tone}>
              {label}
            </Badge>
          ))}
        </div>
      </Section>

      <Section id="episode-row" title="EpisodeRow">
        <EpisodeRow
          title="Чингис хааны нууц товчоо: эхний бүлэг"
          meta={`Түүх · ${formatDurationMn(32 * 60)}`}
          coverUrl={cover(0)}
          progress={{ value: 0.45, label: '45% сонссон' }}
          save={{
            saved,
            label: saved ? 'Хадгалснаас хасах' : 'Хадгалах',
            onToggle: () => setSaved((v) => !v),
          }}
          onSelect={() => toast.show('Ангийг нээлээ')}
        />
        <EpisodeRow
          title="Нэр нь маш урт байж болох бөгөөд хоёр мөрөөс хэтрэхгүйгээр таслагдах ёстой жишээ гарчиг"
          meta={`Үлгэр · ${formatDurationMn(75 * 60)}`}
          coverUrl={cover(10)}
          save={{ saved: false, label: 'Хадгалах', onToggle: () => undefined }}
          onSelect={() => undefined}
        />
        <EpisodeRow
          title="Зураггүй анги"
          meta={`Хөгжим · ${formatDurationMn(18 * 60)}`}
          onSelect={() => undefined}
        />
      </Section>

      <Section id="episode-card" title="EpisodeCard">
        <div className="dev-ui__cards">
          <EpisodeCard
            title="Хөх тэнгэрийн домог"
            durationLabel={formatDurationMn(41 * 60)}
            coverUrl={cover(0)}
            onSelect={() => undefined}
          />
          <EpisodeCard
            title="Говийн шөнийн дуу"
            durationLabel={formatDurationMn(26 * 60)}
            coverUrl={cover(14)}
            onSelect={() => undefined}
          />
          <EpisodeCard
            title="Алтайн цээжин дэх зүрх"
            durationLabel={formatDurationMn(58 * 60)}
            coverUrl={cover(24)}
            onSelect={() => undefined}
          />
        </div>
      </Section>

      <Section id="list-item" title="ListItem">
        <div>
          <ListItem title="Хэрэглэгчийн нэр" value="@bat" onSelect={() => undefined} />
          <ListItem title="Имэйл" value="bat@example.com" onSelect={() => undefined} />
          <ListItem title="Төхөөрөмжүүд" icon="info" onSelect={() => undefined} />
          <ListItem title="Үйлчилгээний нөхцөл" href="#glyphs" />
          <ListItem title="Бүртгэл устгах" tone="destructive" onSelect={() => undefined} />
        </div>
      </Section>

      <Section id="skeleton" title="Skeleton">
        <div aria-busy="true">
          <EpisodeRowSkeleton />
          <EpisodeRowSkeleton />
        </div>
        <div className="ui-row">
          <Skeleton shape="pill" width="96px" />
          <Skeleton shape="pill" width="72px" />
        </div>
      </Section>

      <Section id="empty" title="EmptyState">
        <EmptyState
          title="Хадгалсан анги алга"
          text="Анги дээрх тэмдэглэгээг дарж хадгалаарай."
          action={<Button variant="secondary">Сан руу очих</Button>}
        />
      </Section>

      <Section id="overlays" title="Sheet and Toast">
        <div className="ui-row">
          <Button variant="secondary" onClick={() => setSheet(true)}>
            Sheet нээх
          </Button>
          <Button variant="secondary" onClick={() => toast.show('Хадгаллаа', { tone: 'success' })}>
            Toast: амжилттай
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast.show('Холболт тасарлаа', { tone: 'danger' })}
          >
            Toast: алдаа
          </Button>
          <Button variant="secondary" onClick={() => toast.show('Шинэ анги нэмэгдлээ')}>
            Toast: мэдээлэл
          </Button>
        </div>
        <Sheet
          open={sheet}
          onClose={() => setSheet(false)}
          title="Таны эрх идэвхгүй байна"
          closeLabel="Хаах"
        >
          <Button fullWidth onClick={() => setSheet(false)}>
            Эрхээ шалгах
          </Button>
        </Sheet>
      </Section>

      <Section id="icons" title="Icons">
        <div className="ui-row">
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
            <span key={name} className="dev-ui__icon">
              <Icon name={name} />
              <span className="text-caption">{name}</span>
            </span>
          ))}
        </div>
      </Section>
    </main>
  );
}

export default function Gallery() {
  return (
    <ToastProvider closeLabel="Хаах">
      <Demo />
    </ToastProvider>
  );
}
