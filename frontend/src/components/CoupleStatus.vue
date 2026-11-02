<script setup lang="ts">
import { computed, ref } from "vue";
import { useSpace } from "../stores/space";
import { today } from "../lib/date";
import { daysBetween } from "../lib/presentation";
import Icon from "./Icon.vue";
import Modal from "./Modal.vue";
import { useTask } from "../lib/task";
const s = useSpace();
const editing = ref(false),
  since = ref(""),
  version = ref<number>(),
  task = useTask();
function open() {
  since.value = s.data.couple.since;
  version.value = s.version("settings", "couple");
  editing.value = true;
}
function save() {
  task.run(async () => {
    const id = await s.submit(
      "couple.update",
      { id: "couple", since: since.value },
      "在一起的起始日期",
      "settings",
      version.value,
    );
    const error = s.pending.find(
      (p) => p.command.id === id && p.status !== "waiting",
    );
    if (error) throw Error(error.message);
    editing.value = false;
  });
}
const next = computed(
  () =>
    s.data.milestones
      .filter((m) => m.kind === "meet" && m.date >= today())
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))[0],
);
</script>
<template>
  <div class="stat-row">
    <button class="stat-card me" @click="open" aria-label="修改在一起的日子">
      <div>
        <div class="stat-k">
          在一起 <span style="opacity: 0.55">· 可改</span>
        </div>
        <div class="stat-v">
          {{ Math.max(0, daysBetween(s.data.couple.since) + 1) }}<em>天</em>
        </div>
      </div>
      <span class="stat-ico"><Icon name="heart" :size="18" /></span></button
    ><RouterLink class="stat-card him" to="/meet" aria-label="安排下次见面"
      ><div>
        <div class="stat-k">下次见面</div>
        <div class="stat-v">
          {{ next ? daysBetween(today(), next.date) : "—"
          }}<em>{{ next ? "天" : "还没定" }}</em>
        </div>
      </div>
      <span class="stat-ico"><Icon name="calendar" :size="18" /></span
    ></RouterLink>
  </div>
  <Modal v-if="editing" title="在一起的第一天" @close="editing = false"
    ><form @submit.prevent="save">
      <label class="field"
        ><span class="field-k">哪一天</span
        ><input
          v-model="since"
          class="input-box"
          type="date"
          :max="today()"
          required
      /></label>
      <p class="v2-error" role="alert">{{ task.error.value }}</p>
      <button class="btn-primary" :disabled="task.busy.value">保存</button>
    </form></Modal
  >
</template>
