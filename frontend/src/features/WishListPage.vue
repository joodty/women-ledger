<script setup lang="ts">
import { computed, ref } from "vue";
import { useSpace } from "../stores/space";
import { useTask } from "../lib/task";
import { confirmCommand } from "../lib/confirmCommand";
import type { Wish } from "../models";
import PageHead from "../components/PageHead.vue";
import Icon from "../components/Icon.vue";
import WishEditor from "./wallet/WishEditor.vue";
const s = useSpace(),
  task = useTask(),
  editor = ref(false),
  editing = ref<Wish>();
const scoped = (w: Wish) => w.scope || "both";
const isDone = (w: Wish) => ["done", "redeemed"].includes(w.status || "");
const sortByPoints = (a: Wish, b: Wish) =>
  (Number(a.pointsLabel) || 10001) - (Number(b.pointsLabel) || 10001);
const openOf = (both: boolean) =>
  s.data.wishlist
    .filter((w) => !isDone(w) && (scoped(w) === "both") === both)
    .sort(sortByPoints);
const doneList = computed(() => s.data.wishlist.filter(isDone));
const owned = (w: Wish) =>
  !w.scope || w.scope === "both" || w.scope === s.slot;
const whose = (w: Wish) => {
  const k = scoped(w);
  return k === "both" ? "我们一起" : k === s.slot ? "我的" : "对方的";
};
function edit(w?: Wish) {
  editing.value = w;
  editor.value = true;
}
function remove(w: Wish) {
  task.run(async () => {
    await confirmCommand(
      s,
      "wish.delete",
      "wishlist",
      w.id,
      "删除这项内容？已有兑换流水不会删除，待确认申请请先取消。",
      "删除" + w.name,
    );
  });
}
</script>
<template>
  <div class="page">
    <div class="sub-wrap">
      <PageHead title="愿望清单" back back-to="/points" />
      <div class="tip-band">
        <Icon name="star" :size="14" />想到什么就加一条，不用着急实现。
      </div>
      <p class="v2-error" role="alert">{{ task.error.value }}</p>
      <section class="card">
        <div class="card-title">
          想做的事<button class="wg-add" @click="edit()">
            <Icon name="plus" :size="12" />新增愿望
          </button>
        </div>
        <section
          v-for="both in [true, false]"
          :key="String(both)"
          class="wl-sec"
        >
          <div class="wl-sec-head">
            {{ both ? "一起的" : "单人的"
            }}<span class="n">{{ openOf(both).length }}</span>
          </div>
          <article v-for="w in openOf(both)" :key="w.id" class="wi-row">
            <span
              class="wi-ico"
              style="background: var(--pink-soft); color: var(--pink-deep)"
              ><Icon :name="w.icon || 'star'" :size="19" /></span
            ><span class="wi-main"
              ><span class="wi-name">{{ w.name }}</span
              ><span class="wi-meta"
                >{{ both ? "我们一起" : whose(w) }} ·
                {{ w.pointsLabel }} 分</span
              ></span
            ><button
              v-if="owned(w)"
              class="wi-edit"
              :aria-label="'修改愿望：' + w.name"
              @click="edit(w)"
            >
              <Icon name="edit" :size="15" /></button
            ><button
              v-if="owned(w)"
              class="wi-edit danger-text"
              :aria-label="'删除愿望：' + w.name"
              @click="remove(w)"
            >
              <Icon name="trash" :size="15" /></button
            ><RouterLink v-if="owned(w)" class="wi-btn saving" to="/points"
              >去兑换<Icon name="right" :size="12" /></RouterLink
            ><span v-else class="wi-btn his">对方来兑</span>
          </article>
          <div
            v-if="!openOf(both).length"
            class="empty"
            style="padding: 10px 0"
          >
            还没有{{ both ? "两个人一起" : "只属于一个人" }}想做的事。
          </div>
        </section>
      </section>
      <section v-if="doneList.length" class="card">
        <div class="card-title">
          已经做过的<span class="sub">{{ doneList.length }} 件</span>
        </div>
        <article v-for="w in doneList" :key="w.id" class="wi-row wi-done">
          <span class="wi-main"
            ><span class="wi-name">{{ w.name }}</span
            ><span class="wi-meta"
              >{{ w.pointsLabel }} 分 · 已完成</span
            ></span
          ><button
            v-if="owned(w)"
            class="wi-edit danger-text"
            :aria-label="'删除愿望：' + w.name"
            @click="remove(w)"
          >
            <Icon name="trash" :size="15" />
          </button>
        </article>
      </section>
      <div class="page-foot">把期待写下来，一起慢慢完成</div>
      <WishEditor
        v-if="editor"
        :key="editing?.id || 'new'"
        :wish="editing"
        @close="editor = false"
      />
    </div>
  </div>
</template>
