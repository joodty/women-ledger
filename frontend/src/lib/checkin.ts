import { ref } from "vue";
import { useSpace } from "../stores/space";
import { useTask } from "./task";
import { today, weekStart } from "./date";
import type { Goal } from "../models";

/* 从约定上打一次卡：只回答「今天做了没有」。
   生成一条时长为 0 的记录，目标进度就会 +1；要补时长就点开那条记录改。
   服务端只对带 goalId 的记录放行 0 分钟，手写的记录仍必须有真实时长。 */
export function useGoalCheckin() {
  const s = useSpace(),
    task = useTask(),
    justLogged = ref<Record<string, string>>({}),
    /* 打完这一下拿到多少分，用来在那一行原地给个回声 */
    gained = ref<Record<string, { points: number; floor: number }>>({});
  const floorRow = () =>
    s.data.points_ledger.find(
      (p) =>
        p.type === "week" && p.memberId === s.slot && p.date === weekStart(),
    );
  function payload(g: Goal) {
    const now = new Date(),
      hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(
        now.getMinutes(),
      ).padStart(2, "0")}`;
    return {
      id: crypto.randomUUID(),
      date: today(),
      start: hhmm,
      end: hhmm,
      content: g.name,
      note: "",
      happy: null,
      categoryId: g.categoryId || "none",
      goalId: g.id,
      visibility: "shared",
    };
  }
  async function log(g: Goal) {
    const hadFloor = !!floorRow(),
      entry = payload(g);
    await task.run(async () => {
      await s.submit("record.create", entry, g.name, "entries");
    });
    justLogged.value = { ...justLogged.value, [g.id]: entry.id };
    const floor = !hadFloor && floorRow() ? floorRow()!.points : 0;
    gained.value = {
      ...gained.value,
      [g.id]: { points: g.pointsPerCheckin || 0, floor },
    };
  }
  async function undo(g: Goal) {
    const id = justLogged.value[g.id];
    if (!id) return;
    await task.run(async () => {
      await s.submit("record.delete", { id }, "撤销 " + g.name, "entries");
    });
    const next = { ...justLogged.value };
    delete next[g.id];
    justLogged.value = next;
    const nextGain = { ...gained.value };
    delete nextGain[g.id];
    gained.value = nextGain;
  }
  return { justLogged, gained, log, undo };
}
