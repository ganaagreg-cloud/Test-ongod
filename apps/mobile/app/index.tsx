import { Redirect } from 'expo-router';
import { StatusView } from '../src/components/StatusView';
import { useAuth } from '../src/auth/AuthContext';
import { useGate } from '../src/gate';
import { mn } from '../src/i18n/mn';
import { Button } from '../src/ui';

/**
 * The hub: every start and every change of state passes through here. It shows the states that
 * have no screen of their own (still loading, no connection, API address missing) and sends
 * everything else to the right group of screens.
 */
export default function Index() {
  const gate = useGate();
  const { reload } = useAuth();

  switch (gate) {
    case 'loading':
      return null; // the splash screen is still showing
    case 'apiMissing':
      return <StatusView title={mn.gate.apiMissingTitle} text={mn.gate.apiMissingText} />;
    case 'unreachable':
      return (
        <StatusView
          title={mn.gate.unreachableTitle}
          text={mn.gate.unreachableText}
          action={<Button label={mn.common.retry} onPress={reload} />}
        />
      );
    case 'update':
      return <Redirect href="/update-required" />;
    case 'signedOut':
      return <Redirect href="/welcome" />;
    case 'pendingProfile':
      return <Redirect href="/complete-profile" />;
    case 'signedIn':
      return <Redirect href="/home" />;
  }
}
