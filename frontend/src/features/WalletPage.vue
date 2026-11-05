<script setup lang="ts">
import { computed } from "vue";
import { useSpace } from "../stores/space";
import { useTask } from "../lib/task";
import { post } from "../lib/api";
import { confirmCommand } from "../lib/confirmCommand";
import { monthDay } from "../lib/presentation";
import { useWishes } from "../lib/wishes";
import type { WishItem } from "../lib/wishes";
import PageHead from "../components/PageHead.vue";
import Icon from "../components/Icon.vue";
import type { Wish, Redemption } from "../models";
const s = useSpace(),
  task = useTask(),
  { all, kindOf, isDone } = useWishes();
const each = (w: Wish) => (w.scope || "both") === "both";
function gap(w: Wish) {
  const cost = Number(w.pointsLabel);
  if (!cost) return Infinity;
  if (w.scope && w.scope !== "both" && w.scope !== s.slot) return Infinity;
  return (w.scope || "both") === "both"
    ? Math.max(
        0,
        cost / 2 - s.balance(s.slot, "ours"),
        cost / 2 - s.balance(s.other, "ours"),
      )
    : Math.max(0, cost - s.balance(s.slot));
}
const wishes = computed(() =>
  all.value.filter((w) => !isDone(w)).slice().sort((a, b) => gap(a) - gap(b)),
);
const byId = (id?: string) => all.value.find((w) => w.id === id);
const pending = computed(() =>
  s.data.redemptions.filter((r) => r.status === "pending"),
);
const history = computed(() =>
  s.data.redemptions
    .filter(
      (r) =>
        !["pending", "cancelled", "reversed"].includes(r.status || "") &&
        (r.wallet === "ours" || r.memberId === s.slot),
    )
    .slice()
    .reverse(),
);
function redeem(w: WishItem) {
  if (
    confirm(
      (w.scope || "both") === "both"
        ? `兑换「${w.name}」需双方各付 ${Number(w.pointsLabel) / 2} 共同分，继续？`
        : `用 ${w.pointsLabel} 分兑换「${w.name}」？`,
    )
  )
    task.run(async () => {
      await s.redeem(kindOf(w), w.id);
      s.notice = "兑换请求已处理";
    });
}
function cancel(r: Redemption) {
  if (confirm("取消这次兑换申请？尚未扣除积分。"))
    task.run(async () => {
      await post("/api/redeem/cancel", { id: r.id });
      await s.refresh();
    });
}
function reverse(r: Redemption) {
  task.run(async () => {
    await confirmCommand(
      s,
      "redemption.reverse",
      "redemptions",
      r.id,
      r.wallet === "ours"
        ? "撤销这次共同兑换需要双方确认，双方确认后退回各自积分。"
        : "撤销这次兑换并退回个人积分？",
      "撤销兑换",
    );
  });
}
</script>
<template>
  <div class="page narrow">
    <PageHead title="兑换" subtitle="攒够分，就把想做的事做掉。" />
    <section class="card">
      <div class="pool" style="grid-template-columns: 1fr 1fr">
        <div class="pool-cell me">
          <div class="pool-k">我们的分</div>
          <div class="pool-v" aria-label="我的共同积分">
            {{ s.balance(s.slot, "ours") }}
          </div>
          <div class="pool-d">一起做的事 · 各出一半</div>
        </div>
        <div class="pool-cell him">
          <div class="pool-k">我的分</div>
          <div class="pool-v" aria-label="我的个人积分">
            {{ s.balance(s.slot) }}
          </div>
          <div class="pool-d">只属于我的事</div>
        </div>
      </div>
    </section>
    <section v-if="pending.length" class="card">
      <div class="card-title">
        兑换申请<span class="sub">两个人都点头才扣分</span>
      </div>
      <article v-for="r in pending" :key="r.id" class="wish-item">
        <span class="wish-ico"><Icon name="heart" :size="19" /></span
        ><span class="wish-main"
          ><span class="wish-name">{{ r.name }}</span
          ><span class="wish-meta">{{
            r.memberId === s.slot
              ? "你发起 · 等对方点头"
              : "对方发起 · 等你点头"
          }}</span></span
        ><button
          v-if="r.memberId !== s.slot && byId(r.wishId)"
          class="wish-btn"
          @click="redeem(byId(r.wishId)!)"
        >
          去确认</button
        ><button class="wish-btn saving" @click="cancel(r)">取消申请</button>
      </article>
    </section>
    <section class="card">
      <div class="card-title">
        想做的事<RouterLink class="card-link" to="/wishlist"
          >管理<Icon name="right" :size="12"
        /></RouterLink>
      </div>
      <article v-for="w in wishes" :key="w.id" class="wish-item">
        <span
          class="wish-ico"
          style="background: var(--pink-soft); color: var(--pink-deep)"
          ><Icon :name="w.icon || 'star'" :size="19" /></span
        ><span class="wish-main"
          ><span class="task-top"
            ><span class="wish-name">{{ w.name }}</span
            ><span v-if="w.scope !== 'both'" class="task-who">{{
              w.scope === s.other ? "对方的" : "我的"
            }}</span
            ><button
              v-if="Number.isFinite(gap(w))"
              class="wish-btn"
              :disabled="gap(w) > 0"
              @click="redeem(w)"
            >
              {{ gap(w) > 0 ? `${each(w) ? "各差" : "还差"} ${gap(w)} 分` : "去兑换" }}</button
            ><span v-else class="task-gap off">{{
              Number(w.pointsLabel) ? "对方来兑" : "没定分值"
            }}</span></span
          >
          <div v-if="gap(w) > 0 && Number.isFinite(gap(w))" class="task-bar">
            <i
              :style="{
                width:
                  Math.max(
                    0,
                    100 -
                      (gap(w) /
                        (Number(w.pointsLabel) /
                          ((w.scope || 'both') === 'both' ? 2 : 1))) *
                        100,
                  ) + '%',
                background: 'var(--pink)',
              }"
            ></i></div
        ></span>
      </article>
      <div v-if="!wishes.length" class="empty">
        还没有想做的事。<br />去「一起」加一个，再来这里兑。
      </div>
    </section>
    <RouterLink to="/wishlist" class="list-row reward-link"
      ><span class="list-ico"><Icon name="star" :size="19" /></span
      ><span class="list-main"
        ><span class="list-k">愿望清单</span
        ><span class="list-d">想到什么就加一条，攒够分再兑</span></span
      ><Icon name="right" :size="16"
    /></RouterLink>
    <section class="card">
      <div class="card-title">兑换记录</div>
      <article v-for="r in history" :key="r.id" class="prog-row">
        <span class="prog-ico"><Icon name="gift" :size="17" /></span
        ><span class="prog-main"
          ><span class="prog-name">{{ r.name }}</span
          ><span class="prog-dots"
            ><span class="txt"
              >{{ r.wallet === "ours" ? "一起的" : "我的" }} ·
              {{ monthDay(r.date)
              }}{{ r.reverseRequestedBy ? " · 撤销申请待确认" : "" }}</span
            ></span
          ></span
        ><button
          class="card-link danger-text"
          :disabled="r.reverseRequestedBy === s.slot"
          @click="reverse(r)"
        >
          {{
            r.reverseRequestedBy
              ? r.reverseRequestedBy === s.slot
                ? "等待对方确认"
                : "确认撤销"
              : "撤销"
          }}
        </button>
      </article>
      <div v-if="!history.length" class="empty">还没兑换过。</div>
    </section>
    <p class="v2-error" role="alert">{{ task.error.value }}</p>
  </div>
</template>
