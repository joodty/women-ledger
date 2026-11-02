<script setup lang="ts">
import { computed, ref } from "vue";
import { useSpace } from "../stores/space";
import PageHead from "../components/PageHead.vue";
import { today, duration, shift } from "../lib/date";
import type { Slot } from "../models";
const s = useSpace(),
  month = ref(today().slice(0, 7)),
  scope = ref<Slot | "all">(s.slot),
  selected = ref(""),
  low = ref(false);
const rows = computed(() =>
  s.data.entries.filter(
    (e) =>
      e.date.startsWith(month.value) &&
      (scope.value === "all" || e.memberId === scope.value) &&
      (!selected.value || e.date === selected.value) &&
      (!low.value || (!!e.happy && e.happy <= 2)),
  ),
);
const total = computed(() => rows.value.reduce((n, e) => n + e.minutes, 0)),
  days = computed(() => new Set(rows.value.map((e) => e.date)).size);
const dist = computed(() =>
  s.data.categories
    .map((c) => ({
      ...c,
      minutes: rows.value
        .filter((e) => (e.categoryId || "none") === c.id)
        .reduce((n, e) => n + e.minutes, 0),
    }))
    .filter((c) => c.minutes),
);
const calendar = computed(() => {
  const first = month.value + "-01",
    offset = (new Date(first + "T12:00:00").getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => {
    const key = shift(first, i - offset);
    return {
      key,
      day: Number(key.slice(8)),
      inside: key.startsWith(month.value),
      has: s.data.entries.some(
        (e) =>
          e.date === key &&
          (scope.value === "all" || e.memberId === scope.value),
      ),
    };
  });
});
const mood = computed(() => {
  const list = rows.value.filter((e) => e.happy);
  return list.length
    ? (list.reduce((n, e) => n + e.happy!, 0) / list.length).toFixed(1)
    : "—";
});
</script>
<template>
  <PageHead title="回看" subtitle="回头看看，是怎样一点点走过来的。" />
  <div class="v2-grid">
    <label class="v2-field"
      >月份<input v-model="month" type="month" @change="selected = ''" /></label
    ><label class="v2-field"
      >谁的记录<select v-model="scope">
        <option :value="s.slot">{{ s.member(s.slot).name }}</option>
        <option :value="s.other">{{ s.member(s.other).name }}分享的</option>
        <option value="all">双方可见记录</option>
      </select></label
    >
  </div>
  <section class="card">
    <div class="v2-grid">
      <div>
        <span class="muted">记录时长</span>
        <p class="v2-metric" style="font-size: 23px">{{ duration(total) }}</p>
      </div>
      <div>
        <span class="muted">有记录的日子</span>
        <p class="v2-metric">{{ days }}</p>
      </div>
    </div>
    <p class="muted">平均心情 {{ mood }} · {{ rows.length }} 条记录</p>
  </section>
  <section class="card">
    <div class="card-title">
      这个月的足迹<button
        v-if="selected"
        class="card-link"
        @click="selected = ''"
      >
        查看全月
      </button>
    </div>
    <div class="v2-calendar">
      <span
        v-for="w in ['一', '二', '三', '四', '五', '六', '日']"
        :key="w"
        class="muted"
        >{{ w }}</span
      ><button
        v-for="d in calendar"
        :key="d.key"
        :disabled="!d.inside"
        :class="{ marked: d.has, selected: d.key === selected }"
        @click="selected = d.key === selected ? '' : d.key"
      >
        {{ d.day }}
      </button>
    </div>
  </section>
  <section class="card">
    <div class="card-title">时间都去了哪里</div>
    <article v-for="c in dist" :key="c.id" class="v2-item">
      <span class="v2-dot" :style="{ background: c.color }" />
      <div class="v2-item-main">
        <strong>{{ c.name }} · {{ duration(c.minutes) }}</strong>
        <div class="v2-progress">
          <span
            :style="{
              width: (c.minutes / Math.max(total, 1)) * 100 + '%',
              background: c.color,
            }"
          />
        </div>
      </div>
    </article>
    <p v-if="!dist.length" class="empty">这个范围里还没有记录。</p>
  </section>
  <button class="btn-ghost" @click="low = !low">
    {{ low ? "显示全部记录" : "看看心情低落的时候" }}
  </button>
  <section class="card">
    <div class="card-title">{{ selected || month }} 的记录</div>
    <article
      v-for="e in rows
        .slice()
        .sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start))"
      :key="e.id"
      class="v2-item"
    >
      <div class="v2-item-main">
        <strong>{{ e.content }}</strong>
        <p>
          {{ e.date }} {{ e.start }}–{{ e.end }} · {{ s.member(e.memberId).name
          }}<template v-if="e.happy"> · 心情 {{ e.happy }}</template>
        </p>
        <p v-if="e.note">{{ e.note }}</p>
      </div>
    </article>
    <p v-if="!rows.length" class="empty">还没有记录。</p>
  </section>
</template>
