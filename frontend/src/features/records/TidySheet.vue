<script setup lang="ts">
import { computed } from "vue";
import { useSpace } from "../../stores/space";
import { useTask } from "../../lib/task";
import type { Entry } from "../../models";
import Modal from "../../components/Modal.vue";
const emit = defineEmits<{ close: [] }>(),
  s = useSpace(),
  task = useTask();
const rows = computed(() =>
  s.data.entries.filter(
    (e) => e.memberId === s.slot && (!e.categoryId || e.categoryId === "none"),
  ),
);
async function pick(e: Entry, categoryId: string) {
  const version = s.version("entries", e.id);
  task.run(async () => {
    const id = await s.submit(
      "record.update",
      { ...e, categoryId },
      "整理记录分类",
      "entries",
      version,
    );
    const error = s.pending.find(
      (p) => p.command.id === id && p.status !== "waiting",
    );
    if (error) throw Error(error.message);
  });
}
</script>
<template>
  <Modal title="整理未分类记录" @close="emit('close')"
    ><p class="chip-hint">选一个分类就保存，不影响原有记录和积分。</p>
    <section v-for="e in rows" :key="e.id" class="tidy-row">
      <div class="field-k">{{ e.start }} · {{ e.content }}</div>
      <div class="chips">
        <button
          v-for="c in s.data.categories.filter((c) => c.id !== 'none')"
          :key="c.id"
          class="chip-cat"
          type="button"
          :disabled="task.busy.value"
          @click="pick(e, c.id)"
        >
          <span class="cdot" :style="{ background: c.color }"></span
          >{{ c.name }}
        </button>
      </div>
    </section>
    <div v-if="!rows.length" class="empty">已经整理好了。</div>
    <p class="v2-error" role="alert">{{ task.error.value }}</p>
    <button class="btn-ghost" @click="emit('close')">完成整理</button></Modal
  >
</template>
