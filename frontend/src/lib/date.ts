export const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
export function shift(value: string, n: number) {
  const d = new Date(value + "T12:00:00");
  d.setDate(d.getDate() + n);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}
export function weekStart() {
  const t = today(),
    d = new Date(t + "T12:00:00");
  return shift(t, -((d.getDay() + 6) % 7));
}
export function duration(minutes: number) {
  return minutes >= 60
    ? `${Math.floor(minutes / 60)} 小时${minutes % 60 ? " " + (minutes % 60) + " 分" : ""}`
    : `${minutes} 分`;
}
