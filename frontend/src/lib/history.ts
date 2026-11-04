import { computed } from "vue";
import { useSpace } from "../stores/space";
import { today } from "./date";

/* 「一起做过的」唯一数据源：见面/里程碑 + 共同兑换。
   一起页取最近 5 条当摘要，做过页取全部 —— 两处必须是同一份数据，
   否则会出现「摘要里有兑换、点进去反而没有」这种前后不一致。 */
export type HistoryItem = {
  id: string;
  date: string;
  title: string;
  kind: string;
  source: "milestone" | "redemption";
  note: string;
  month: string;
};

export function useHistory(limit = 0) {
  const s = useSpace();
  const all = computed<HistoryItem[]>(() => {
    const rows: HistoryItem[] = [
      ...s.data.milestones
        .filter((m) => m.date <= today())
        .map((m) => ({
          id: m.id,
          date: m.date,
          title: m.title,
          kind: m.kind,
          source: "milestone" as const,
          note: m.note || m.plan || "",
          month: m.date.slice(0, 7),
        })),
      ...s.data.redemptions
        .filter(
          (r) =>
            !["pending", "cancelled", "reversed"].includes(r.status || "") &&
            r.wallet === "ours",
        )
        .map((r) => ({
          id: r.id,
          date: r.date,
          title: r.name,
          kind: "redeem",
          source: "redemption" as const,
          note: "",
          month: r.date.slice(0, 7),
        })),
    ];
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  });
  const items = computed(() =>
    limit > 0 ? all.value.slice(0, limit) : all.value,
  );
  const groups = computed(() => {
    const out: { month: string; label: string; items: HistoryItem[] }[] = [];
    for (const item of items.value) {
      const last = out[out.length - 1];
      if (last && last.month === item.month) last.items.push(item);
      else
        out.push({
          month: item.month,
          label: Number(item.month.slice(5)) + "月",
          items: [item],
        });
    }
    return out;
  });
  return { all, items, groups };
}
