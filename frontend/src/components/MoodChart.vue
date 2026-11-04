<script setup lang="ts">
import { computed } from "vue";
const p = defineProps<{
    series: { date: string; value: number | null }[];
    selected: string;
  }>(),
  emit = defineEmits<{ select: [date: string] }>();
const points = computed(() =>
  p.series.map((v, i) => ({
    ...v,
    x: 22 + (i * 290) / Math.max(1, p.series.length - 1),
    y: v.value == null ? null : 14 + 90 - ((v.value - 1) * 90) / 4,
  })),
);
const areas = computed(() => {
  const groups: (typeof points.value)[] = [];
  let group: typeof points.value = [];
  for (const point of points.value) {
    if (point.y === null) {
      if (group.length) groups.push(group);
      group = [];
    } else group.push(point);
  }
  if (group.length) groups.push(group);
  return groups
    .filter((g) => g.length > 1)
    .map(
      (g) =>
        `M ${g[0].x} 104 ${g.map((p) => `L ${p.x} ${p.y}`).join(" ")} L ${g.at(-1)!.x} 104 Z`,
    );
});
</script>
<template>
  <svg
    class="mood-chart"
    viewBox="0 0 320 128"
    role="img"
    aria-label="近七天快乐值折线，点击日期查看那天"
  >
    <path
      v-for="(area, i) in areas"
      :key="i"
      :d="area"
      fill="var(--pink)"
      opacity=".08"
    />
    <g v-for="n in 5" :key="n">
      <line
        x1="22"
        x2="312"
        :y1="104 - (n - 1) * 22.5"
        :y2="104 - (n - 1) * 22.5"
        stroke="var(--line)"
      />
      <text x="7" :y="108 - (n - 1) * 22.5" font-size="10" fill="var(--ink-3)">
        {{ n }}
      </text>
    </g>
    <template v-for="(point, i) in points" :key="point.date">
      <line
        v-if="i > 0 && point.y !== null && points[i - 1].y !== null"
        :x1="points[i - 1].x"
        :y1="points[i - 1].y!"
        :x2="point.x"
        :y2="point.y"
        stroke="var(--pink)"
        stroke-width="2"
      />
      <g
        role="button"
        tabindex="0"
        :aria-label="'查看' + point.date + '快乐值'"
        @click="emit('select', point.date)"
        @keydown.enter="emit('select', point.date)"
      >
        <rect
          :x="point.x - 18"
          y="0"
          width="36"
          height="128"
          fill="transparent"
        />
        <circle
          v-if="point.y !== null"
          :cx="point.x"
          :cy="point.y"
          :r="selected === point.date ? 5 : 3.5"
          fill="white"
          stroke="var(--pink)"
          stroke-width="1.5"
        />
        <text
          :x="point.x"
          y="124"
          text-anchor="middle"
          font-size="10"
          fill="var(--ink-3)"
        >
          {{ Number(point.date.slice(5, 7)) }}/{{ Number(point.date.slice(8)) }}
        </text>
      </g>
    </template>
  </svg>
</template>
