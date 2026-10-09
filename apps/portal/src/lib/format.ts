const UB = 'Asia/Ulaanbaatar';

/** "2027.10.08" in Ulaanbaatar time. */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: UB })
    .format(new Date(iso))
    .replaceAll('-', '.');
}

/** "100,000₮" */
export function formatMnt(amount: number): string {
  return `${new Intl.NumberFormat('en-US').format(amount)}₮`;
}

/** Value for <input type="datetime-local"> in the browser's own time zone. */
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
