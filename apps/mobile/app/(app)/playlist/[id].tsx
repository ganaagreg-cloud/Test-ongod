import { useLocalSearchParams } from 'expo-router';
import { usePlaylist } from '../../../src/data/queries';
import { mn } from '../../../src/i18n/mn';
import { CollectionScreen } from '../../../src/screens/CollectionScreen';

/** Playlist page: cover, description and its published episodes. */
export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <CollectionScreen
      query={usePlaylist(id)}
      emptyTitle={mn.playlist.emptyTitle}
      emptyText={mn.playlist.emptyText}
    />
  );
}
