<script setup lang="ts">
import { computed, ref } from "vue";
import type { Entry, Slot } from "../models";
import { today, shift } from "../lib/date";
import Icon from "./Icon.vue";
const p = defineProps<{
    month: string;
    selected: string;
    entries: Entry[];
    slot: Slot;
  }>(),
  emit = defineEmits<{
    "update:month": [month: string];
    "update:selected": [date: string];
  }>(),
  picker = ref(false),
  year = ref(Number(p.month.slice(0, 4)));
const grid = computed(() => {
  const first = p.month + "-01",
    offset = (new Date(first + "T12:00:00").getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => {
    const key = shift(first, i - offset),
      rows = p.entries.filter((e) => e.date === key);
    return {
      key,
      day: Number(key.slice(8)),
      inside: key.startsWith(p.month),
      mine: rows.some((e) => e.memberId === p.slot),
      other: rows.some((e) => e.memberId !== p.slot),
    };
  });
});
function moveMonth(n: number) {
  const d = new Date(p.month + "-01T12:00:00");
  d.setMonth(d.getMonth() + n);
  emit(
    "update:month",
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
  );
}
function select(date: string) {
  if (!date.startsWith(p.month)) emit("update:month", date.slice(0, 7));
  emit("update:selected", date);
}
</script>
<template>
  <div class="cal-head">
    <button
      class="cal-month"
      @click="
        year = Number(month.slice(0, 4));
        picker = !picker;
      "
    >
      {{ Number(month.slice(0, 4)) }} 年 {{ Number(month.slice(5)) }} 月<Icon
        name="down"
        :size="14"
      />
    </button>
    <div class="cal-nav">
      <button aria-label="上个月" @click="moveMonth(-1)">
        <Icon name="left" :size="16" /></button
      ><button aria-label="下个月" @click="moveMonth(1)">
        <Icon name="right" :size="16" />
      </button>
    </div>
  </div>
  <div v-if="picker" class="cal-picker">
    <div class="cp-year">
      <button aria-label="上一年" @click="year--">
        <Icon name="left" :size="15" /></button
      ><span>{{ year }} 年</span
      ><button aria-label="下一年" @click="year++">
        <Icon name="right" :size="15" />
      </button>
    </div>
    <div class="cp-months">
      <button
        v-for="n in 12"
        :key="n"
        class="cp-m"
        :class="{ on: month === `${year}-${String(n).padStart(2, '0')}` }"
        @click="
          emit('update:month', `${year}-${String(n).padStart(2, '0')}`);
          picker = false;
        "
      >
        {{ n }}月
      </button>
    </div>
  </div>
  <div class="cal-week">
    <span v-for="w in ['一', '二', '三', '四', '五', '六', '日']" :key="w">{{
      w
    }}</span>
  </div>
  <div class="cal-grid">
    <button
      v-for="d in grid"
      :key="d.key"
      class="cal-cell"
      :class="{
        out: !d.inside,
        today: d.key === today(),
        sel: d.key === selected,
      }"
      :aria-label="d.key"
      @click="select(d.key)"
    >
      <span class="d">{{ d.day }}</span
      ><span class="cal-marks"
        ><i v-if="d.mine && d.inside" style="background: var(--pink)"></i
        ><i v-if="d.other && d.inside" style="background: var(--blue)"></i
      ></span>
    </button>
  </div>
  <div class="cal-legend">
    <span><i style="background: var(--pink)"></i>我有记录</span
    ><span><i style="background: var(--blue)"></i>对方有记录</span
    ><span
      ><i style="background: var(--pink)"></i
      ><i style="background: var(--blue)"></i>两人都有</span
    >
  </div>
</template>
