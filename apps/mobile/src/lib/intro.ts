import { getItem, setItem } from '../storage/secureStore';

// ADR-0088: the three intro pages show once per phone, before Welcome. The flag stays after a
// logout on purpose: a returning member goes straight to Welcome.
const KEY = 'ongod.introSeen';

export const introSeen = async (): Promise<boolean> => (await getItem(KEY)) === '1';
export const markIntroSeen = (): Promise<void> => setItem(KEY, '1');
