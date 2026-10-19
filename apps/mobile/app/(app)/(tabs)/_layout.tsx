import { Tabs } from 'expo-router/tabs';
import { colors } from '@ongod/tokens';
import { AppTabBar } from '../../../src/screens/AppTabBar';

/** Нүүр / Сан / Хадгалсан / Профайл (DESIGN "Tabs"), with the floating dock. */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="library" />
      <Tabs.Screen name="saved" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
