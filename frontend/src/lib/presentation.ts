import { today } from "./date";
export const monthDay = (date: string) =>
  `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;
export const weekday = (date: string) =>
  "星期" + "日一二三四五六"[new Date(date + "T12:00:00").getDay()];
export const daysBetween = (a: string, b = today()) =>
  Math.round(
    (Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000,
  );
export const rgba = (hex: string, alpha = 0.18) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};
export const catIcon = (id?: string) =>
  ({
    health: "pulse",
    career: "briefcase",
    growth: "sprout",
    relate: "users",
    life: "house",
    leisure: "cup",
    none: "clock",
  })[id || "none"] || "clock";
