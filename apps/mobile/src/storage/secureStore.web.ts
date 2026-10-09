// Browser preview only: expo-secure-store has no web implementation, so keep values in memory.
// They are gone on reload, which is fine for a visual preview and never touches localStorage
// (tokens must not sit in web storage).
export const secureStoreBackend = 'memory' as const;

const memory = new Map<string, string>();

export const getItem = async (key: string): Promise<string | null> => memory.get(key) ?? null;
export const setItem = async (key: string, value: string): Promise<void> => {
  memory.set(key, value);
};
export const deleteItem = async (key: string): Promise<void> => {
  memory.delete(key);
};
