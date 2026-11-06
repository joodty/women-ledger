<script setup lang="ts">
import Modal from "../../components/Modal.vue";
import { useSpace } from "../../stores/space";
import { useDraft } from "../../lib/draft";
import { useTask } from "../../lib/task";
import { confirmCommand } from "../../lib/confirmCommand";
import type { Wish } from "../../models";
const props = defineProps<{ wish?: Wish }>(),
  emit = defineEmits<{ close: [] }>(),
  s = useSpace(),
  task = useTask();
/* 2026-11-05 愿望与奖励合并：只剩一份清单，落在 wishlist。
   rewards 表冻结只读，老数据不会从这里被写入；那些项的编辑入口也已收起。 */
const collection = "wishlist";
const {
  draft: f,
  warning,
  clear,
} = useDraft(
  `women.v2.draft.${s.session!.account}.wish.${props.wish?.id || "new"}`,
  {
    id: props.wish?.id || crypto.randomUUID(),
    name: props.wish?.name || "",
    scope: props.wish?.scope || "both",
    executor: props.wish?.executor || "both",
    pointsLabel: props.wish?.pointsLabel || "待定",
    baseVersion: props.wish ? s.version(collection, props.wish.id) : undefined,
  },
);
const canDelete = () =>
  !props.wish?.scope ||
  props.wish.scope === "both" ||
  props.wish.scope === s.slot;
function save() {
  task.run(async () => {
    await s.submit(
      "wish.save",
      { ...f.value },
      "愿望：" + f.value.name,
      collection,
      f.value.baseVersion,
    );
    clear();
    emit("close");
  });
}
function remove() {
  task.run(async () => {
    if (
      await confirmCommand(
        s,
        "wish.delete",
        collection,
        f.value.id,
        "删除这项内容？已有兑换流水保留，不会自动退分；待确认申请需要先取消。",
        "删除" + f.value.name,
        f.value.baseVersion,
      )
    ) {
      clear();
      emit("close");
    }
  });
}
</script>
<template>
  <Modal :title="(wish ? '编辑' : '新增') + '愿望'" @close="emit('close')"
    ><form @submit.prevent="save">
      <label class="field"
        ><span class="field-k">名称</span
        ><input
          v-model="f.name"
          class="input-box"
          required
          maxlength="200"
          placeholder="比如：周末一起去看展" /></label
      ><label class="field"
        ><span class="field-k">需要的分</span
        ><input
          v-model="f.pointsLabel"
          aria-label="需要的积分"
          class="input-box"
          required
          placeholder="正整数，或填写待定"
      /></label>
      <div class="field">
        <div class="field-k">属于谁</div>
        <div class="chips" role="group" aria-label="属于谁">
          <button
            v-for="who in [s.slot, s.other, 'both'] as const"
            :key="who"
            type="button"
            class="chip-cat"
            :class="{ on: f.scope === who }"
            @click="f.scope = who"
          >
            {{
              who === "both"
                ? "我们俩"
                : who === s.slot
                  ? "只属于我"
                  : "只属于对方"
            }}
          </button>
        </div>
        <div class="chip-hint">
          个人的从自己的分里扣；共同的从我们一起的分里扣，要两个人都点头。
        </div>
      </div>
      <div class="field">
        <div class="field-k">谁执行</div>
        <div class="chips" role="group" aria-label="谁来安排">
          <button
            v-for="who in [s.slot, s.other, 'both'] as const"
            :key="who"
            type="button"
            class="chip-cat"
            :class="{ on: f.executor === who }"
            @click="f.executor = who"
          >
            {{
              who === "both"
                ? "我们一起"
                : who === s.slot
                  ? "我来安排"
                  : "对方安排"
            }}
          </button>
        </div>
      </div>
      <p class="v2-error" role="alert">{{ warning || task.error.value }}</p>
      <button class="btn-primary" :disabled="task.busy.value">保存</button
      ><button
        v-if="wish && canDelete()"
        type="button"
        class="btn-ghost danger-action"
        @click="remove"
      >
        删除这项愿望
      </button>
      <div class="foot-line">随时可以改，已有兑换记录保留。</div>
    </form></Modal
  >
</template>
