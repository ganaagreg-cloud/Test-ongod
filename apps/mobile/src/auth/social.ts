// Google and Apple sign-in on the phone (SPEC C, ADR-0009, ADR-0019). Native only: the browser
// preview uses social.web.ts. Both return the ID token for the API, which verifies it itself;
// the phone never decides who the user is.
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { env } from '../config/env';
import { isExpoGo } from '../lib/expoGo';

export interface GoogleResult {
  idToken: string;
}

export interface AppleResult {
  idToken: string;
  /** The raw nonce: the API accepts it and checks it against what Apple signed. */
  nonce: string;
  /** Apple sends the name only the first time; used to prefill the profile form. */
  firstName?: string;
  lastName?: string;
}

/**
 * True when this build has the Google client IDs it needs (see .env.example). Always false in
 * Expo Go (ADR-0033): the native module is not there, so the button is hidden.
 */
export const googleConfigured = env.googleWebClientId !== undefined && !isExpoGo;

// Never imported at the top of the file: in Expo Go the native module does not exist and
// importing it would crash the app at start-up.
const loadGoogle = () => import('@react-native-google-signin/google-signin');

let googleReady = false;
async function configureGoogle() {
  const { GoogleSignin } = await loadGoogle();
  if (googleReady) return;
  GoogleSignin.configure({
    // The web client ID is what the ID token is issued for (the API's GOOGLE_CLIENT_IDS).
    ...(env.googleWebClientId ? { webClientId: env.googleWebClientId } : {}),
    ...(env.googleIosClientId ? { iosClientId: env.googleIosClientId } : {}),
  });
  googleReady = true;
}

/** Resolves to null when the user closes the Google sheet. */
export async function signInWithGoogle(): Promise<GoogleResult | null> {
  if (isExpoGo) return null;
  await configureGoogle();
  const { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } = await loadGoogle();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return null;
    const idToken = response.data.idToken;
    if (!idToken) throw new Error('Google returned no ID token (is the web client ID set?)');
    return { idToken };
  } catch (error) {
    if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED) return null;
    throw error;
  }
}

/** Whether to offer Sign in with Apple: iOS only, and only if the system supports it. */
export async function isAppleAvailable(): Promise<boolean> {
  // Expo Go signs with its own bundle id, so Apple would issue a token the API rejects.
  if (Platform.OS !== 'ios' || isExpoGo) return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

const toHex = (bytes: Uint8Array) =>
  [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Resolves to null when the user cancels. */
export async function signInWithApple(): Promise<AppleResult | null> {
  const nonce = toHex(Crypto.getRandomBytes(16));
  // Apple signs whatever string it is given. We give it the SHA-256 of the raw nonce, and send
  // the raw nonce to the API, which accepts "claim equals raw nonce or its SHA-256 hex".
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashed,
    });
    if (!credential.identityToken) throw new Error('Apple returned no identity token');
    return {
      idToken: credential.identityToken,
      nonce,
      ...(credential.fullName?.givenName ? { firstName: credential.fullName.givenName } : {}),
      ...(credential.fullName?.familyName ? { lastName: credential.fullName.familyName } : {}),
    };
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') return null;
    throw error;
  }
}
