// Browser preview only: there is no native Google or Apple sign-in on the web, so the buttons
// are simply not offered. (Same exports as social.ts.)

export interface GoogleResult {
  idToken: string;
}

export interface AppleResult {
  idToken: string;
  nonce: string;
  firstName?: string;
  lastName?: string;
}

export const googleConfigured = false;

export async function signInWithGoogle(): Promise<GoogleResult | null> {
  return null;
}

export async function isAppleAvailable(): Promise<boolean> {
  return false;
}

export async function signInWithApple(): Promise<AppleResult | null> {
  return null;
}
