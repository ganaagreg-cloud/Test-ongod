import { useLocalSearchParams } from 'expo-router';
import { useSeries } from '../../../src/data/queries';
import { mn } from '../../../src/i18n/mn';
import { CollectionScreen } from '../../../src/screens/CollectionScreen';

/** Series page: cover, description and its published episodes. */
export default function SeriesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <CollectionScreen
      query={useSeries(id)}
      emptyTitle={mn.series.emptyTitle}
      emptyText={mn.series.emptyText}
    />
  );
}
