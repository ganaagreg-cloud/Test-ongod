import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { StatusView } from '../src/components/StatusView';
import { useAuth } from '../src/auth/AuthContext';
import { useGate } from '../src/gate';
import { mn } from '../src/i18n/mn';
import { introSeen } from '../src/lib/intro';
import { Button } from '../src/ui';

/** Signed out: the three intro pages the first time on this phone, then Welcome (ADR-0088). */
function SignedOutStart() {
  const [seen, setSeen] = useState<boolean | null>(null);
  useEffect(() => {
    void introSeen()
      .catch(() => true) // storage unreadable: skip the intro rather than block the start
      .then(setSeen);
  }, []);
  if (seen === null) return null; // the splash screen is still showing
  return <Redirect href={seen ? '/welcome' : '/intro'} />;
}

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
      return <SignedOutStart />;
    case 'pendingProfile':
      return <Redirect href="/complete-profile" />;
    case 'signedIn':
      return <Redirect href="/home" />;
  }
}
