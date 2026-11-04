<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { useSpace } from "../stores/space";
import { useTask } from "../lib/task";
import { confirmCommand } from "../lib/confirmCommand";
import type { Wish } from "../models";
import PageHead from "../components/PageHead.vue";
import Icon from "../components/Icon.vue";
import WishEditor from "./wallet/WishEditor.vue";
const s = useSpace(),
  route = useRoute(),
  task = useTask(),
  editor = ref(false),
  openWish = ref(""),
  editing = ref<Wish>();
const reward = computed(() => route.path === "/rewards"),
  groups = computed(() =>
    reward.value
      ? [
          { key: "small", title: "小奖励" },
          { key: "mid", title: "中奖励" },
          { key: "big", title: "大奖励" },
        ]
      : [
          { key: "both", title: "我们俩的愿望" },
          { key: s.slot, title: "我的愿望" },
          { key: s.other, title: "对方的愿望" },
        ],
  );
const list = (key: string) =>
  (reward.value ? s.data.rewards : s.data.wishlist).filter((w) =>
    reward.value ? (w.tier || "small") === key : (w.scope || "both") === key,
  );
const owned = (w: Wish) => !w.scope || w.scope === "both" || w.scope === s.slot;
const isDone = (w: Wish) => ["done", "redeemed"].includes(w.status || "");
const openWishes = (both: boolean) =>
  s.data.wishlist
    .filter((w) => !isDone(w) && ((w.scope || "both") === "both") === both)
    .slice()
    .sort(
      (a, b) =>
        (Number(a.pointsLabel) || 10001) - (Number(b.pointsLabel) || 10001),
    );
const doneWishes = computed(() => s.data.wishlist.filter(isDone));
function edit(w?: Wish) {
  editing.value = w;
  editor.value = true;
}
function remove(w: Wish) {
  task.run(async () => {
    await confirmCommand(
      s,
      reward.value ? "reward.delete" : "wish.delete",
      reward.value ? "rewards" : "wishlist",
      w.id,
      "删除这项内容？已有兑换流水不会删除，待确认申请请先取消。",
      "删除" + w.name,
    );
  });
}
function redeem(w: Wish) {
  if (confirm(`用 ${w.pointsLabel} 个人分兑换「${w.name}」？`))
    task.run(async () => {
      await s.redeem("reward", w.id);
    });
}
</script>
<template>
  <div class="page">
    <div class="sub-wrap">
      <PageHead
        :title="reward ? '奖励清单' : '愿望清单管理'"
        back
        back-to="/points"
      />
      <div class="tip-band">
        <Icon name="star" :size="14" />{{
          reward
            ? "先写谁来执行，再设置需要多少分"
            : "想到什么就加一条，不用着急实现。"
        }}
      </div>
      <p class="v2-error" role="alert">{{ task.error.value }}</p>
      <section
        v-for="g in groups"
        v-if="reward"
        :key="g.key"
        class="reward-group"
      >
        <div class="reward-head">
          <span class="reward-ico"
            ><Icon :name="reward ? 'gift' : 'star'" :size="17" /></span
          ><span class="reward-k">{{ g.title }}</span>
        </div>
        <template v-for="w in list(g.key)" :key="w.id">
          <article class="wish-item">
            <span
              class="wish-ico"
              style="background: var(--pink-soft); color: var(--pink-deep)"
              ><Icon :name="w.icon || 'star'" :size="19" /></span
            ><span class="wish-main"
              ><span class="wish-name">{{ w.name }}</span
              ><span class="wish-meta"
                >{{ w.pointsLabel }} 分 ·
                {{
                  w.executor === "both"
                    ? "我们一起"
                    : s.member(w.executor || s.slot).name
                }}<template v-if="w.status === 'redeemed' || w.status === 'done'">
                  · 已完成</template
                ></span
              ></span
            ><button
              v-if="reward"
              class="wish-btn"
              :disabled="
                !Number(w.pointsLabel) ||
                s.balance(s.slot) < Number(w.pointsLabel)
              "
              @click="redeem(w)"
            >
              兑换</button
            ><button
              v-if="owned(w)"
              class="row-dots"
              :aria-label="'更多操作：' + w.name"
              :aria-expanded="openWish === w.id"
              @click="openWish = openWish === w.id ? '' : w.id"
            >
              <Icon name="down" :size="15" />
            </button>
          </article>
          <div v-if="owned(w) && openWish === w.id" class="row-actions">
            <button
              :aria-label="'修改' + (reward ? '奖励' : '愿望') + '：' + w.name"
              @click="edit(w)"
            >
              修改</button
            ><button
              class="danger-text"
              :aria-label="'删除' + (reward ? '奖励' : '愿望') + '：' + w.name"
              @click="remove(w)"
            >
              删除
            </button>
          </div>
        </template>
        <div v-if="!list(g.key).length" class="empty">
          这里还没有{{ reward ? "奖励" : "愿望" }}。
        </div>
      </section>
      <template v-if="!reward"
        ><section class="card">
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
              }}<span class="n">{{ openWishes(both).length }}</span>
            </div>
            <article v-for="w in openWishes(both)" :key="w.id" class="wi-row">
              <span
                class="wi-ico"
                style="background: var(--pink-soft); color: var(--pink-deep)"
                ><Icon :name="w.icon || 'star'" :size="19" /></span
              ><span class="wi-main"
                ><span class="wi-name">{{ w.name }}</span
                ><span class="wi-meta"
                  >{{
                    (w.scope || "both") === "both"
                      ? "我们一起"
                      : w.scope === s.slot
                        ? "我的"
                        : "对方的"
                  }}
                  · {{ w.pointsLabel }} 分</span
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
              v-if="!openWishes(both).length"
              class="empty"
              style="padding: 10px 0"
            >
              还没有{{ both ? "两个人一起" : "只属于一个人" }}想做的事。
            </div>
          </section>
        </section>
        <section v-if="doneWishes.length" class="card">
          <div class="card-title">
            已经做过的<span class="sub">{{ doneWishes.length }} 件</span>
          </div>
          <article v-for="w in doneWishes" :key="w.id" class="wi-row wi-done">
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
          </article></section
      ></template>
      <button v-if="reward" class="add-block" @click="edit()">
        <Icon name="plus" :size="15" />{{ reward ? "新增奖励" : "新增愿望" }}
      </button>
      <div class="page-foot">把期待写下来，一起慢慢完成</div>
      <WishEditor
        v-if="editor"
        :key="route.path"
        :wish="editing"
        :kind="reward ? 'reward' : 'wish'"
        @close="editor = false"
      />
    </div>
  </div>
</template>
