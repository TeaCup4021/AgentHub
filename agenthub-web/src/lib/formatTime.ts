function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function isYesterday(a: Date, b: Date): boolean {
  const yesterday = new Date(b);
  yesterday.setDate(b.getDate() - 1);
  return isSameDay(a, yesterday);
}

function isThisWeek(a: Date, b: Date): boolean {
  const now = new Date(b);
  const dayOfWeek = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek + 1);
  monday.setHours(0, 0, 0, 0);
  return a >= monday && a <= now;
}

export function formatTime(isoString: string): string {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const hours = d.getHours().toString().padStart(2, "0");
  const mins = d.getMinutes().toString().padStart(2, "0");
  const time = `${hours}:${mins}`;

  if (isSameDay(d, now)) return time;
  if (isYesterday(d, now)) return `昨天 ${time}`;
  if (isThisWeek(d, now)) {
    const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
    return `周${weekdays[d.getDay()]} ${time}`;
  }
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${month}-${day} ${time}`;
}

export function formatFullTime(isoString: string): string {
  const d = new Date(isoString);
  const y = d.getFullYear();
  const M = (d.getMonth() + 1).toString().padStart(2, "0");
  const D = d.getDate().toString().padStart(2, "0");
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const s = d.getSeconds().toString().padStart(2, "0");
  return `${y}-${M}-${D} ${h}:${m}:${s}`;
}
