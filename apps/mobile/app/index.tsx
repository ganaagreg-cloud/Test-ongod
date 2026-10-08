import { StyleSheet, Text, View } from 'react-native';
import { colors, layout, nativeTextStyle } from '@ongod/tokens';
import { mn } from '../src/i18n/mn';

export default function Index() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>{mn.appName}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    paddingHorizontal: layout.screenPadding,
  },
  title: {
    color: colors.textPrimary,
    ...nativeTextStyle('display'),
  },
});
