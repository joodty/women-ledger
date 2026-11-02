<script setup lang="ts">
import { computed } from "vue";
import { useSpace } from "../stores/space";
import type { Entry } from "../models";
const props = defineProps<{ entries: Entry[] }>(),
  s = useSpace();
const total = computed(() => props.entries.reduce((n, e) => n + e.minutes, 0));
const rows = computed(() =>
  s.data.categories.map((c) => ({
    ...c,
    minutes: props.entries
      .filter((e) => (e.categoryId || "none") === c.id)
      .reduce((n, e) => n + e.minutes, 0),
  })),
);
</script>
<template>
  <div v-if="total" class="stack">
    <span
      v-for="c in rows"
      :key="c.id"
      :style="{ width: (c.minutes / total) * 100 + '%', background: c.color }"
      :title="c.name"
    ></span>
  </div>
  <div v-else class="stack">
    <span style="width: 100%; background: var(--gray-soft)"></span>
  </div>
  <div class="legend">
    <span v-for="c in rows" :key="c.id" class="legend-item"
      ><i class="legend-dot" :style="{ background: c.color }"></i>{{ c.name }}
      <b>{{
        c.minutes ? Math.round(c.minutes / 6) / 10 + "h" : "0分"
      }}</b></span
    >
  </div>
</template>
