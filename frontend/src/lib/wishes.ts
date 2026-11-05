import { computed } from "vue";
import { useSpace } from "../stores/space";
import type { Wish } from "../models";

/* 愿望与奖励本来是两套清单：愿望按「谁的」分，奖励按「小中大」分，
   而两者都是「攒够分换一件事」，区别只是分组方式。
   2026-11-05 合并成一份：只留「愿望」一个词，档位取消，分直接填数字。

   rewards 表冻结只读 —— 历史数据在这里并进来显示，不迁移、不删除，
   但不能再改、不能再删。未兑换的仍然可以照常兑换，否则等于把老数据作废。 */
export type WishItem = Wish & { legacy?: boolean };

export function useWishes() {
  const s = useSpace();
  const all = computed<WishItem[]>(() => [
    ...s.data.wishlist.map((w) => ({ ...w })),
    ...s.data.rewards.map((w) => ({
      ...w,
      /* 老数据可能没有 scope，个人奖励默认算发起人自己的 */
      scope: w.scope || s.slot,
      legacy: true,
    })),
  ]);
  const kindOf = (w: WishItem): "wish" | "reward" => (w.legacy ? "reward" : "wish");
  const isDone = (w: Wish) => ["done", "redeemed"].includes(w.status || "");
  return { all, kindOf, isDone };
}
