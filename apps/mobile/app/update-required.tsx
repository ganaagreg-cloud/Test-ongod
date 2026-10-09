import { Linking, Platform } from 'react-native';
import { StatusView } from '../src/components/StatusView';
import { env } from '../src/config/env';
import { mn } from '../src/i18n/mn';
import { Button } from '../src/ui';

/**
 * Blocking screen (SPEC I): the installed version is below the server's minimum. There is no way
 * past it except updating; the only action is to open the store page when its address is set.
 */
export default function UpdateRequired() {
  const storeUrl = Platform.OS === 'ios' ? env.iosStoreUrl : env.androidStoreUrl;
  return (
    <StatusView
      title={mn.update.title}
      text={mn.update.text}
      action={
        storeUrl ? (
          <Button label={mn.update.open} onPress={() => void Linking.openURL(storeUrl)} />
        ) : undefined
      }
    />
  );
}
