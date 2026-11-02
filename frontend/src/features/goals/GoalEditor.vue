<script setup lang="ts">
import { computed } from "vue";
import { useSpace } from "../../stores/space";
import { useDraft } from "../../lib/draft";
import { useTask } from "../../lib/task";
import Modal from "../../components/Modal.vue";
import type { Goal } from "../../models";
const props = defineProps<{ goal?: Goal; shared?: boolean }>(),
  emit = defineEmits<{ close: [] }>(),
  s = useSpace(),
  task = useTask();
const {
  draft: f,
  warning,
  clear,
} = useDraft(
  `women.v2.draft.${s.session!.account}.goal.${props.goal?.id || "new"}`,
  {
    id: props.goal?.id || crypto.randomUUID(),
    name: props.goal?.name || "",
    kind: props.goal?.kind || "repeat",
    scope: props.goal?.scope || (props.shared ? "both" : "me"),
    visibility: props.goal?.visibility || "private",
    timesPerWeek: props.goal?.timesPerWeek || 3,
    pointsPerCheckin: props.goal?.pointsPerCheckin || 3,
    reminderTime: props.goal?.reminderTime || "",
    categoryId: props.goal?.categoryId || "growth",
    baseVersion: props.goal ? s.version("goals", props.goal.id) : undefined,
  },
);
const cap = computed(() => (f.value.kind === "once" ? 30 : 5));
function save() {
  task.run(async () => {
    await s.submit(
      props.goal ? "goal.update" : "goal.create",
      { ...f.value },
      "约定：" + f.value.name,
      "goals",
      f.value.baseVersion,
    );
    clear();
    emit("close");
  });
}
</script>
<template>
  <Modal :title="goal ? '修改约定' : '新的约定'" @close="emit('close')"
    ><form @submit.prevent="save">
      <label class="v2-field"
        >约定名称<input
          id="e-name"
          v-model="f.name"
          required
          maxlength="200"
          placeholder="比如：每周运动三次" /></label
      ><label class="v2-field"
        >怎么做<select v-model="f.kind">
          <option value="repeat">每周要做</option>
          <option value="once">一次就完</option>
        </select></label
      ><label v-if="f.kind === 'repeat'" class="v2-field"
        >每周次数<input
          v-model.number="f.timesPerWeek"
          type="number"
          min="1"
          max="21"
          required /></label
      ><label class="v2-field"
        >每次完成获得积分<input
          v-model.number="f.pointsPerCheckin"
          type="number"
          min="1"
          :max="cap"
          required /></label
      ><label class="v2-field"
        >属于谁<select v-model="f.scope">
          <option value="me">自己的约定</option>
          <option value="both">我们俩的约定</option>
        </select></label
      >
      <p v-if="f.scope === 'both'" class="muted">
        对方加入后，双方的打卡分别计入自己的进度和共同积分。
      </p>
      <label v-else class="v2-field"
        >可见范围<select v-model="f.visibility">
          <option value="private">仅自己</option>
          <option value="shared">双方可见</option>
        </select></label
      ><label class="v2-field"
        >分类<select v-model="f.categoryId">
          <option v-for="c in s.data.categories" :key="c.id" :value="c.id">
            {{ c.name }}
          </option>
        </select></label
      ><label class="v2-field"
        >每天提醒时间（可不填）<input
          id="e-reminder-time"
          v-model="f.reminderTime"
          type="time"
      /></label>
      <p class="v2-error">{{ warning || task.error.value }}</p>
      <button
        class="btn-primary"
        :disabled="task.busy.value"
        data-act="save-edit"
      >
        保存约定
      </button>
    </form></Modal
  >
</template>
