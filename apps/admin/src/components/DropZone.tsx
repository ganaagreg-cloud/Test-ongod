import { useState, type ReactNode } from 'react';

interface DropZoneProps {
  /** Names the (invisible) file input for screen readers and tests. */
  label: string;
  accept: string;
  disabled?: boolean;
  /** One file (the first, when several are dropped). */
  onFile?: (file: File) => void;
  /** Several files at once ("Олон файл", ADR-0070); turns on the input's `multiple`. */
  onFiles?: (files: File[]) => void;
  className?: string;
  children: ReactNode;
}

/**
 * A big click-or-drop target. The real <input type="file"> covers the whole area (invisible), so
 * the browser does the picking and the dropping, and the keyboard and screen readers get a normal
 * file field.
 */
export function DropZone({
  label,
  accept,
  disabled,
  onFile,
  onFiles,
  className,
  children,
}: DropZoneProps) {
  const [over, setOver] = useState(false);
  // Counted: dragenter/leave also fire for every child, and a plain boolean would flicker.
  const [depth, setDepth] = useState(0);
  const classes = ['admin-drop', over ? 'is-over' : '', disabled ? 'is-disabled' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      onDragEnter={() => {
        setDepth((d) => d + 1);
        setOver(true);
      }}
      onDragLeave={() => {
        setDepth((d) => {
          if (d <= 1) setOver(false);
          return Math.max(0, d - 1);
        });
      }}
      onDrop={() => {
        setDepth(0);
        setOver(false);
      }}
    >
      {children}
      <input
        type="file"
        className="admin-drop__input"
        aria-label={label}
        accept={accept}
        multiple={onFiles !== undefined}
        disabled={disabled}
        // `depth` only exists to keep `over` honest while dragging
        data-depth={depth}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          // The same file chosen twice must fire again.
          event.target.value = '';
          if (files.length === 0) return;
          onFiles?.(files);
          onFile?.(files[0]!);
        }}
      />
    </div>
  );
}
