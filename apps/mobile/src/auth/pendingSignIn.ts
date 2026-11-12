/**
 * ADR-0092: the email and password of a sign-up that is waiting for its email code, kept in
 * memory only (never stored), so the app can sign the new member in right after the code instead
 * of asking for the same password again. Taken once; gone when the app restarts.
 */
let pending: { email: string; password: string } | null = null;

export function holdSignIn(email: string, password: string): void {
  pending = { email, password };
}

/** The password held for this email, or null. The holder is emptied either way. */
export function takeSignIn(email: string): string | null {
  const held = pending;
  pending = null;
  return held && held.email === email ? held.password : null;
}
