// Calendar weeks run Monday 00:00 through next Monday 00:00, Asia/Jakarta.
function wibWeek(now = new Date()) {
  const instant = new Date(now).getTime();
  if (!Number.isFinite(instant)) throw new Error('Waktu minggu LMS tidak valid.');
  const wib = new Date(instant + 7 * 3600000);
  const day = Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate());
  const start = day - ((wib.getUTCDay() + 6) % 7) * 86400000 - 7 * 3600000;
  return { start, end: start + 7 * 86400000 };
}
function inWibWeek(deadline, week) {
  const value = Date.parse(deadline);
  return Number.isFinite(value) && value >= week.start && value < week.end;
}
module.exports = { wibWeek, inWibWeek };
