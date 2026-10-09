/** "32 мин", "1 цаг", "1 цаг 05 мин": episode length for lists and cards (Mongolian). */
export function formatDurationMn(totalSeconds: number): string {
  const minutes = Math.max(1, Math.round(totalSeconds / 60));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${minutes} мин`;
  if (rest === 0) return `${hours} цаг`;
  return `${hours} цаг ${String(rest).padStart(2, '0')} мин`;
}
