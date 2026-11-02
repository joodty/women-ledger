<script setup lang="ts">
import { useSpace } from "../../stores/space";
import { useDraft } from "../../lib/draft";
import { useTask } from "../../lib/task";
import Modal from "../../components/Modal.vue";
import type { Wish } from "../../models";
const props = withDefaults(
    defineProps<{ wish?: Wish; kind?: "wish" | "reward" }>(),
    { kind: "wish" },
  ),
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
</script>
<template>
  <Modal
    :title="kind === 'wish' ? '愿望清单' : '奖励设置'"
    @close="emit('close')"
    ><form @submit.prevent="save">
      <label class="v2-field"
        >名称<input
          v-model="f.name"
          required
          maxlength="200"
          placeholder="比如：周末一起看展" /></label
      ><label class="v2-field"
        >需要的积分<input
          v-model="f.pointsLabel"
          required
          placeholder="正整数，或填写待定" /></label
      ><label v-if="kind === 'wish'" class="v2-field"
        >属于谁<select v-model="f.scope">
          <option value="both">我们俩</option>
          <option :value="s.slot">{{ s.member(s.slot).name }}</option>
          <option :value="s.other">{{ s.member(s.other).name }}</option>
        </select></label
      ><label class="v2-field"
        >谁来安排<select v-model="f.executor">
          <option value="both">我们一起</option>
          <option :value="s.slot">{{ s.member(s.slot).name }}</option>
          <option :value="s.other">{{ s.member(s.other).name }}</option>
        </select></label
      >
      <p class="muted">
        共同愿望用共同积分，各付一半，需要双方确认；个人愿望由本人用个人积分兑换。
      </p>
      <p class="v2-error">{{ warning || task.error.value }}</p>
      <button class="btn-primary" :disabled="task.busy.value">保存</button>
    </form></Modal
  >
</template>
