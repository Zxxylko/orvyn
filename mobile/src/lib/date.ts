export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDeadline(value: string | null): string {
  if (!value) return 'Tanpa deadline';

  const deadline = new Date(value);
  const now = new Date();
  const today = localDateKey(now);
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const dateKey = localDateKey(deadline);
  const time = new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(deadline);

  if (deadline.getTime() < now.getTime()) return `Terlambat · ${time}`;
  if (dateKey === today) return `Hari ini · ${time}`;
  if (dateKey === localDateKey(tomorrowDate)) return `Besok · ${time}`;

  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(deadline);
}

export function greetingForNow(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}
