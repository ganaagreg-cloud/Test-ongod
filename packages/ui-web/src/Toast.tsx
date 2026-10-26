import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cx } from './cx';
import { Icon } from './Icon';
import { IconButton } from './IconButton';

export type ToastTone = 'info' | 'success' | 'danger';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
}

/** A button inside the toast, e.g. "Undo". Pressing it also dismisses the toast. */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastApi {
  show: (message: string, options?: { tone?: ToastTone; action?: ToastAction }) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast needs <ToastProvider>');
  return api;
}

const ICON = { info: 'info', success: 'check', danger: 'alert' } as const;

function ToastView({
  item,
  closeLabel,
  durationMs,
  onDismiss,
}: {
  item: ToastItem;
  closeLabel: string;
  durationMs: number;
  onDismiss: (id: number) => void;
}) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    // A toast with a button stays twice as long: there is something to read and decide.
    const timer = setTimeout(() => onDismiss(item.id), item.action ? durationMs * 2 : durationMs);
    return () => clearTimeout(timer);
  }, [paused, durationMs, item.id, item.action, onDismiss]);

  return (
    <div
      className={cx('ui-toast', `ui-toast--${item.tone}`)}
      role={item.tone === 'danger' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon name={ICON[item.tone]} />
      <span className="ui-toast__message">{item.message}</span>
      {item.action ? (
        <button
          type="button"
          className="ui-toast__action"
          onClick={() => {
            item.action?.onClick();
            onDismiss(item.id);
          }}
        >
          {item.action.label}
        </button>
      ) : null}
      <IconButton icon="close" label={closeLabel} onClick={() => onDismiss(item.id)} />
    </div>
  );
}

/** Wrap the app once; call `useToast().show("...")` anywhere below. A toast waits while hovered or focused. */
export function ToastProvider({
  children,
  closeLabel,
  durationMs = 4000,
  placement = 'center',
}: {
  children: ReactNode;
  closeLabel: string;
  durationMs?: number;
  /** Bottom centre (default, the portal) or the bottom right corner (the admin). */
  placement?: 'center' | 'end';
}) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback(
    (id: number) => setItems((all) => all.filter((t) => t.id !== id)),
    [],
  );
  const show = useCallback<ToastApi['show']>((message, options) => {
    const id = nextId.current++;
    setItems((all) => [
      ...all.slice(-2),
      {
        id,
        message,
        tone: options?.tone ?? 'info',
        ...(options?.action ? { action: options.action } : {}),
      },
    ]);
  }, []);
  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={cx('ui-toasts', placement === 'end' && 'ui-toasts--end')}>
        {items.map((item) => (
          <ToastView
            key={item.id}
            item={item}
            closeLabel={closeLabel}
            durationMs={durationMs}
            onDismiss={dismiss}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
