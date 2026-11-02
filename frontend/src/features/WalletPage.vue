<script setup lang="ts">
import { computed, ref } from "vue";
import { useSpace } from "../stores/space";
import { useTask } from "../lib/task";
import { post } from "../lib/api";
import PageHead from "../components/PageHead.vue";
import WishEditor from "./wallet/WishEditor.vue";
import type { Wish } from "../models";
const s = useSpace(),
  task = useTask(),
  filter = ref("both"),
  editor = ref(false),
  editing = ref<Wish>(),
  kind = ref<"wish" | "reward">("wish"),
  showLedger = ref(false);
const wishes = computed(() =>
  s.data.wishlist
    .filter(
      (w) =>
        !["done", "redeemed"].includes(w.status || "") &&
        (filter.value === "both" ? (w.scope || "both") === "both" : w.scope === s.slot),
    )
    .sort((a, b) => gap(a) - gap(b)),
);
const pending = computed(() =>
  s.data.redemptions.filter((r) => r.status === "pending"),
);
function gap(w: Wish) {
  const cost = Number(w.pointsLabel);
  if (!cost) return Infinity;
  return (w.scope || "both") === "both"
    ? Math.max(
        cost / 2 - s.balance(s.slot, "ours"),
        cost / 2 - s.balance(s.other, "ours"),
      )
    : cost - s.balance(s.slot);
}
function edit(w?: Wish, k: "wish" | "reward" = "wish") {
  editing.value = w;
  kind.value = k;
  editor.value = true;
}
function redeem(w: Wish, k: "wish" | "reward" = "wish") {
  if (
    confirm(
      k === "wish" && (w.scope || "both") === "both"
        ? `兑换「${w.name}」需双方各付 ${Number(w.pointsLabel) / 2} 共同分，继续？`
        : `用 ${w.pointsLabel} 分兑换「${w.name}」？`,
    )
  )
    task.run(async () => {
      await s.redeem(k, w.id);
      s.notice = "兑换请求已处理";
    });
}
function cancel(id: string) {
  task.run(async () => {
    await post("/api/redeem/cancel", { id });
    await s.refresh();
  });
}
</script>
<template>
  <PageHead title="兑换" subtitle="把认真生活攒下的分，换成一点期待。" />
  <div class="v2-grid">
    <section class="card">
      <span class="muted">我的个人积分</span>
      <div class="v2-metric">{{ s.balance(s.slot) }}</div>
    </section>
    <section class="card">
      <span class="muted">我的共同积分</span>
      <div class="v2-metric">{{ s.balance(s.slot, "ours") }}</div>
      <small class="muted">对方 {{ s.balance(s.other, "ours") }} 分</small>
    </section>
  </div>
  <p class="v2-error" role="alert">{{ task.error.value }}</p>
  <section v-if="pending.length" class="card">
    <h2 class="card-title">等待双方确认</h2>
    <article v-for="r in pending" :key="r.id" class="v2-item">
      <div class="v2-item-main">
        <strong>{{ r.name }}</strong>
        <p>
          {{ r.memberId === s.slot ? "等待对方确认" : "对方邀请你确认兑换" }}
        </p>
        <div class="v2-actions">
          <button
            v-if="r.memberId !== s.slot"
            class="v2-small-button"
            @click="redeem(s.data.wishlist.find((w) => w.id === r.wishId)!)"
          >
            确认兑换</button
          ><button class="card-link" @click="cancel(r.id)">取消申请</button>
        </div>
      </div>
    </article>
  </section>
  <div class="v2-tabs">
    <button :class="{ on: filter === 'both' }" @click="filter = 'both'">
      一起的愿望</button
    ><button :class="{ on: filter === 'mine' }" @click="filter = 'mine'">
      我的愿望
    </button>
  </div>
  <section class="card">
    <div class="card-title">
      想做的事<button class="card-link" @click="edit()">新增</button>
    </div>
    <article v-for="w in wishes" :key="w.id" class="v2-item">
      <div class="v2-item-main">
        <strong>{{ w.name }}</strong>
        <p>
          {{ w.pointsLabel }} 分 ·
          {{
            Number.isFinite(gap(w))
              ? gap(w) <= 0
                ? "积分已经够了"
                : `还差 ${gap(w)} 分`
              : "还没设置积分"
          }}
        </p>
        <div class="v2-progress" v-if="Number(w.pointsLabel)">
          <span
            :style="{
              width:
                Math.max(
                  0,
                  Math.min(
                    100,
                    (1 - Math.max(0, gap(w)) / Number(w.pointsLabel)) * 100,
                  ),
                ) + '%',
            }"
          />
        </div>
        <div class="v2-actions">
          <button
            class="v2-small-button"
            :disabled="!Number(w.pointsLabel) || gap(w) > 0"
            @click="redeem(w)"
          >
            去兑换</button
          ><button class="card-link" @click="edit(w)">修改</button
          ><button
            v-if="w.pointsLabel === '待定'"
            class="card-link"
            @click="
              task.run(() =>
                s
                  .submit('wish.complete', { id: w.id }, '完成愿望', 'wishlist')
                  .then(() => {}),
              )
            "
          >
            标记已完成
          </button>
        </div>
      </div>
    </article>
    <p v-if="!wishes.length" class="empty">把想做的事放进来，慢慢积攒。</p>
  </section>
  <section class="card">
    <div class="card-title">
      给自己的小奖励<button
        class="card-link"
        @click="edit(undefined, 'reward')"
      >
        新增
      </button>
    </div>
    <article v-for="w in s.data.rewards" :key="w.id" class="v2-item">
      <div class="v2-item-main">
        <strong>{{ w.name }}</strong>
        <p>{{ w.pointsLabel }} 个人分</p>
      </div>
      <button
        class="card-link"
        :disabled="
          !Number(w.pointsLabel) || s.balance(s.slot) < Number(w.pointsLabel)
        "
        @click="redeem(w, 'reward')"
      >
        兑换</button
      ><button class="card-link" @click="edit(w, 'reward')">修改</button>
    </article>
  </section>
  <button class="btn-ghost" @click="showLedger = !showLedger">
    {{ showLedger ? "收起" : "查看" }}积分明细
  </button>
  <section v-if="showLedger" class="card">
    <article
      v-for="p in s.data.points_ledger
        .filter((p) => p.memberId === s.slot)
        .slice()
        .reverse()"
      :key="p.id"
      class="v2-item"
    >
      <div class="v2-item-main">
        <strong>{{ p.note || "积分记录" }}</strong>
        <p>
          {{ p.date }} · {{ p.wallet === "ours" ? "共同积分" : "个人积分" }}
        </p>
      </div>
      <span>+{{ p.points }}</span>
    </article>
    <article
      v-for="r in s.data.redemptions.filter(
        (r) => !['pending', 'cancelled'].includes(r.status || ''),
      )"
      :key="r.id"
      class="v2-item"
    >
      <div class="v2-item-main">
        <strong>{{ r.name }}</strong>
        <p>{{ r.date }}</p>
      </div>
      <span>−{{ s.slot === "me" ? r.fromMe || 0 : r.fromHim || 0 }}</span>
    </article>
  </section>
  <WishEditor
    v-if="editor"
    :wish="editing"
    :kind="kind"
    @close="editor = false"
  />
</template>
