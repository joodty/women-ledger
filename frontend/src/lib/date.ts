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
/* 时长只有一种写法：45min / 1h / 1h05min / 0min
   分钟补两位是为了右对齐时各位数咬得住，否则 1h5min 和 1h50min 长度不一，整列会参差。 */
export function duration(minutes: number) {
  const h = Math.floor(minutes / 60),
    m = minutes % 60;
  return h ? `${h}h${m ? String(m).padStart(2, "0") + "min" : ""}` : `${m}min`;
}
