/** "32 мин", "1 цаг", "1 цаг 05 мин": episode length for lists and cards (Mongolian). */
export function formatDurationMn(totalSeconds: number): string {
  const minutes = Math.max(1, Math.round(totalSeconds / 60));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${minutes} мин`;
  if (rest === 0) return `${hours} цаг`;
  return `${hours} цаг ${String(rest).padStart(2, '0')} мин`;
}

/**
 * A plan's length in the unit people use: 365/366 days are "1 year", 730/731 "2 years", 30/31
 * "1 month", 90 "3 months"; anything else stays in days. The words live in each app's mn.ts.
 */
export function planLength(days: number): { unit: 'year' | 'month' | 'day'; count: number } {
  const years = Math.round(days / 365);
  if (years >= 1 && Math.abs(days - years * 365) <= years) return { unit: 'year', count: years };
  const months = Math.round(days / 30);
  if (months >= 1 && months < 12 && Math.abs(days - months * 30) <= months) {
    return { unit: 'month', count: months };
  }
  return { unit: 'day', count: days };
}
