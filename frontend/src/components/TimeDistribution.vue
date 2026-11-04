<script setup lang="ts">
import { computed } from "vue";
import { useSpace } from "../stores/space";
import type { Entry } from "../models";
const props = defineProps<{ entries: Entry[] }>(),
  s = useSpace();
const rows = computed(() =>
  s.data.categories
    .map((c) => ({
      ...c,
      minutes: props.entries
        .filter((e) => (e.categoryId || "none") === c.id)
        .reduce((n, e) => n + e.minutes, 0),
    }))
    /* 没时长的类别不显示，否则一列「0分」只是噪音；
       唯独「未分类」永远留着 —— 它不在的时候等于「忘了归类」这个提示也没了。 */
    .filter((c) => c.minutes > 0 || c.id === "none")
    .sort((a, b) => b.minutes - a.minutes),
);
const max = computed(() => Math.max(1, ...rows.value.map((c) => c.minutes)));
const hours = (m: number) => (m ? Math.round(m / 6) / 10 + "h" : "0分");
</script>
<template>
  <div class="td">
    <div v-for="c in rows" :key="c.id" class="td-row">
      <span class="td-bar" :style="{ background: c.color }"></span>
      <span class="td-name" :class="{ dim: !c.minutes }">{{ c.name }}</span>
      <span class="td-track"
        ><span
          :style="{
            width: (c.minutes / max) * 100 + '%',
            background: c.color,
          }"
        ></span
      ></span>
      <span class="td-val">{{ hours(c.minutes) }}</span>
    </div>
  </div>
</template>
