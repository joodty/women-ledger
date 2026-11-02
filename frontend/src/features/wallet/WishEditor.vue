<script setup lang="ts">
import Modal from "../../components/Modal.vue";
import { useSpace } from "../../stores/space";
import { useDraft } from "../../lib/draft";
import { useTask } from "../../lib/task";
import { confirmCommand } from "../../lib/confirmCommand";
import type { Wish } from "../../models";
const props = defineProps<{ wish?: Wish; kind: "wish" | "reward" }>(),
  emit = defineEmits<{ close: [] }>(),
  s = useSpace(),
  task = useTask();
const collection = props.kind === "wish" ? "wishlist" : "rewards";
const {
  draft: f,
  warning,
  clear,
} = useDraft(
  `women.v2.draft.${s.session!.account}.${props.kind}.${props.wish?.id || "new"}`,
  {
    id: props.wish?.id || crypto.randomUUID(),
    name: props.wish?.name || "",
    scope: props.wish?.scope || (props.kind === "wish" ? "both" : s.slot),
    executor: props.wish?.executor || "both",
    pointsLabel: props.wish?.pointsLabel || "待定",
    tier: props.wish?.tier || "small",
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
      props.kind + ".save",
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
        props.kind + ".delete",
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
  <Modal
    :title="(wish ? '编辑' : '新增') + (kind === 'wish' ? '愿望' : '奖励')"
    @close="emit('close')"
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
      <div v-if="kind === 'reward'" class="field">
        <div class="field-k">档位</div>
        <div class="chips" role="group" aria-label="奖励档位">
          <button
            v-for="t in [
              { k: 'small', n: '小奖励' },
              { k: 'mid', n: '中奖励' },
              { k: 'big', n: '大奖励' },
            ]"
            :key="t.k"
            type="button"
            class="chip-cat"
            :class="{ on: f.tier === t.k }"
            @click="f.tier = t.k"
          >
            {{ t.n }}
          </button>
        </div>
      </div>
      <div v-if="kind === 'wish'" class="field">
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
          个人的用自己的分；共同的各出一半，要两个人都点头。
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
        删除这项{{ kind === "wish" ? "愿望" : "奖励" }}
      </button>
      <div class="foot-line">随时可以改，已有兑换记录保留。</div>
    </form></Modal
  >
</template>
