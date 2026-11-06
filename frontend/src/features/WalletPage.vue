<script setup lang="ts">
import { computed, ref } from "vue";
import { useSpace } from "../stores/space";
import { useTask } from "../lib/task";
import { post } from "../lib/api";
import { confirmCommand } from "../lib/confirmCommand";
import { monthDay } from "../lib/presentation";
import PageHead from "../components/PageHead.vue";
import Icon from "../components/Icon.vue";
import RedeemSheet from "./wallet/RedeemSheet.vue";
import type { Wish, Redemption } from "../models";
const s = useSpace(),
  task = useTask();
const asking = ref<Wish>(),
  confirming = ref(false);
const isDone = (w: Wish) => ["done", "redeemed"].includes(w.status || "");
const shared = (w: Wish) => (w.scope || "both") === "both";
const cost = (w: Wish) => {
  const n = Number(w.pointsLabel);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
/* 我能付的：共同愿望看双人池；自己的单人愿望看自己的分；对方的单人愿望付不了 */
const payable = (w: Wish) => shared(w) || (w.scope || "both") === s.slot;
const gap = (w: Wish) => {
  if (!cost(w) || !payable(w)) return Infinity;
  const have = shared(w) ? s.poolOurs() : s.balance(s.slot);
  return Math.max(0, cost(w) - have);
};
const wishes = computed(() =>
  s.data.wishlist
    .filter((w) => !isDone(w))
    .slice()
    .sort((a, b) => gap(a) - gap(b)),
);
const byId = (id?: string) => s.data.wishlist.find((w) => w.id === id);
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
function ask(w: Wish, asConfirm = false) {
  asking.value = w;
  confirming.value = asConfirm;
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
        ? "撤销这次共同兑换需要双方确认，双方确认后退回双人池。"
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
          <div class="pool-k">我们一起的分</div>
          <div class="pool-v" aria-label="双人池共同积分">{{ s.poolOurs() }}</div>
          <div class="pool-d">一起做的事从这里扣</div>
        </div>
        <div class="pool-cell him">
          <div class="pool-k">我的分</div>
          <div class="pool-v" aria-label="我的个人积分">{{ s.balance(s.slot) }}</div>
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
          @click="ask(byId(r.wishId)!, true)"
        >
          去确认</button
        ><button class="wish-btn saving" @click="cancel(r)">取消申请</button>
      </article>
    </section>
    <section class="card">
      <div class="card-title">
        愿望清单<RouterLink class="card-link" to="/wishlist"
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
            ><span v-if="!shared(w)" class="task-who">{{
              w.scope === s.other ? "对方的" : "我的"
            }}</span
            ><span v-if="!cost(w)" class="task-gap off">没定分值</span
            ><span v-else-if="!payable(w)" class="task-gap off">对方来兑</span
            ><button v-else class="wish-btn" :disabled="gap(w) > 0" @click="ask(w)">
              去兑换</button
            ></span
          ><span class="task-num"
            >{{ cost(w) ? cost(w) + " 分" : "待定"
            }}<em v-if="gap(w) > 0 && Number.isFinite(gap(w))">
              · 还差 {{ gap(w) }} 分</em
            ></span
          ></span
        >
      </article>
      <div v-if="!wishes.length" class="empty">
        还没有加过愿望。<br />点右上角「管理」，加一条。
      </div>
    </section>
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
    <RedeemSheet
      v-if="asking"
      :key="asking.id"
      :wish="asking"
      :confirming="confirming"
      @close="asking = undefined"
    />
  </div>
</template>
