import { requireOptionalNativeModule } from 'expo';
import { Linking, Platform } from 'react-native';
import { themes } from '@ongod/tokens';

/**
 * Opens a web page inside the app (ADR-0093): an in-app browser sheet with its own close button,
 * so the member stays in the app and comes straight back (terms, privacy). A build made before
 * `expo-web-browser` was added has no native part: there, and when the sheet cannot open, the
 * page opens in the phone's browser as before.
 */
export async function openInApp(url: string): Promise<void> {
  const hasNative = Platform.OS === 'web' || requireOptionalNativeModule('ExpoWebBrowser') !== null;
  if (hasNative) {
    try {
      const WebBrowser = await import('expo-web-browser');
      await WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
        dismissButtonStyle: 'close',
        toolbarColor: themes.dark.bg,
        controlsColor: themes.dark.accent,
        showTitle: true,
      });
      return;
    } catch {
      // Fall through to the phone's browser.
    }
  }
  await Linking.openURL(url);
}
