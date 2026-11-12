import { deleteItem, getItem, setItem } from '../storage/secureStore';

// ADR-0090: after a new sign-up the app may offer one optional step before Home (the gift-code
// step, shown only while the server switch is on). The mark is set when the account is confirmed
// and taken (read and removed) the first time the signed-in area starts, so it shows at most once.
const KEY = 'ongod.startPrompt';

export const markStartPrompt = (): Promise<void> => setItem(KEY, '1');

/** True once after `markStartPrompt()`; the mark is removed by reading it. */
export async function takeStartPrompt(): Promise<boolean> {
  if ((await getItem(KEY)) !== '1') return false;
  await deleteItem(KEY);
  return true;
}
