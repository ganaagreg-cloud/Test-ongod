import {
  createColumnHelper,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
} from '@tanstack/react-table';
import { Skeleton } from '@ongod/ui-web';
import type { ReactNode } from 'react';
import { mn } from '../i18n/mn';

/** Only the core features: the API sorts, filters and pages, the table just draws the rows. */
const features = tableFeatures({});
export type Features = typeof features;
export type Column<T extends RowData> = ColumnDef<Features, T>;

/** Columns are display columns: each cell is drawn from the whole row. */
export const columnsFor = <T extends RowData>() => createColumnHelper<Features, T>();

interface DataTableProps<T extends RowData> {
  /** Names the table for screen readers. */
  caption: string;
  columns: Column<T>[];
  data: T[];
  getRowId: (row: T) => string;
  loading?: boolean;
  empty?: ReactNode;
  selectedId?: string | undefined;
  onRowOpen?: (row: T) => void;
}

const SKELETON_ROWS = 6;

export function DataTable<T extends RowData>({
  caption,
  columns,
  data,
  getRowId,
  loading = false,
  empty,
  selectedId,
  onRowOpen,
}: DataTableProps<T>) {
  const table = useTable<Features, T>({ features, columns, data, getRowId });
  const headers = table.getHeaderGroups().flatMap((group) => group.headers);

  return (
    <div className="admin-table-wrap">
      <table className="admin-table" aria-busy={loading || undefined}>
        <caption className="ui-visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header.id} scope="col">
                {header.isPlaceholder ? null : <table.FlexRender header={header} />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && data.length === 0
            ? Array.from({ length: SKELETON_ROWS }, (_, row) => (
                <tr key={row} aria-hidden="true">
                  {headers.map((header) => (
                    <td key={header.id}>
                      <Skeleton width="70%" />
                    </td>
                  ))}
                </tr>
              ))
            : table.getRowModel().rows.map((row) => {
                const selected = row.id === selectedId;
                return (
                  <tr
                    key={row.id}
                    data-row-id={row.id}
                    aria-selected={onRowOpen ? selected : undefined}
                    className={selected ? 'is-selected' : undefined}
                    tabIndex={onRowOpen ? 0 : undefined}
                    onClick={onRowOpen ? () => onRowOpen(row.original) : undefined}
                    onKeyDown={
                      onRowOpen
                        ? (event) => {
                            if (event.target !== event.currentTarget) return;
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              onRowOpen(row.original);
                            }
                          }
                        : undefined
                    }
                  >
                    {row.getAllCells().map((cell) => (
                      <td key={cell.id}>
                        <table.FlexRender cell={cell} />
                      </td>
                    ))}
                  </tr>
                );
              })}
        </tbody>
      </table>
      {!loading && data.length === 0 ? (
        <p className="admin-table__empty">{empty ?? mn.common.empty}</p>
      ) : null}
    </div>
  );
}
