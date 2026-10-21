import { useQuery } from '@tanstack/react-query';
import { Button, EmptyState, Skeleton } from '@ongod/ui-web';
import { useNavigate } from 'react-router';
import { seriesListQuery } from '../api/queries';
import { LoadError, PageHeader } from '../components/bits';
import { mn } from '../i18n/mn';

export function SeriesPage() {
  const t = mn.series;
  const navigate = useNavigate();
  const list = useQuery(seriesListQuery());
  const series = list.data?.series ?? [];
  const create = () => void navigate('/series/new');

  return (
    <>
      <PageHeader title={t.title}>
        <Button onClick={create}>{t.new}</Button>
      </PageHeader>
      {list.error ? <LoadError error={list.error} onRetry={() => void list.refetch()} /> : null}
      {list.isPending ? <Skeleton width="70%" /> : null}
      {list.data && series.length === 0 ? (
        <EmptyState title={t.empty} action={<Button onClick={create}>{t.new}</Button>} />
      ) : null}
      {series.length > 0 ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="ui-visually-hidden">{t.title}</caption>
            <thead>
              <tr>
                <th scope="col">{t.columns.title}</th>
                <th scope="col">{t.columns.slug}</th>
                <th scope="col">{t.columns.episodes}</th>
                <th scope="col">{t.columns.actions}</th>
              </tr>
            </thead>
            <tbody>
              {series.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.title}</strong>
                  </td>
                  <td>
                    <code className="admin-code">{item.slug}</code>
                  </td>
                  <td>{item.episodeCount}</td>
                  <td>
                    <span className="admin-row-actions">
                      <Button
                        variant="secondary"
                        onClick={() => void navigate(`/series/${item.id}`)}
                      >
                        {mn.common.edit}
                      </Button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
