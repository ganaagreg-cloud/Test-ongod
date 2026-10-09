import { IconButton, useToast } from '@ongod/ui-web';
import { copyText } from '../lib/clipboard';
import { mn } from '../i18n/mn';

/** A label, a value and a copy button. `big` is the transfer reference code. */
export function CopyRow({
  label,
  value,
  copyValue = value,
  big = false,
}: {
  label: string;
  value: string;
  /** What lands in the clipboard when it differs from what is shown (e.g. the amount without ₮). */
  copyValue?: string;
  big?: boolean;
}) {
  const toast = useToast();
  const copy = async () => {
    const ok = await copyText(copyValue);
    toast.show(ok ? mn.pay.copied : mn.pay.copyFailed, { tone: ok ? 'success' : 'danger' });
  };
  return (
    <div className={big ? 'portal-copy portal-copy--big' : 'portal-copy'}>
      <div className="portal-copy__text">
        <dt className="portal-copy__label">{label}</dt>
        <dd className="portal-copy__value" data-testid={big ? 'reference-code' : undefined}>
          {value}
        </dd>
      </div>
      <IconButton icon="copy" label={`${mn.pay.copy}: ${label}`} onClick={() => void copy()} />
    </div>
  );
}
