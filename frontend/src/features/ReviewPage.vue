<script setup lang="ts">
import { computed, ref } from "vue";
import { useSpace } from "../stores/space";
import type { Entry, Slot } from "../models";
import { today, shift, weekStart, duration } from "../lib/date";
import { monthDay, weekday, catIcon, rgba } from "../lib/presentation";
import PageHead from "../components/PageHead.vue";
import Icon from "../components/Icon.vue";
import MemberAvatar from "../components/MemberAvatar.vue";
import EntryList from "../components/EntryList.vue";
import MonthCalendar from "../components/MonthCalendar.vue";
import MoodChart from "../components/MoodChart.vue";
import RecordEditor from "./records/RecordEditor.vue";
const s = useSpace(),
  month = ref(today().slice(0, 7)),
  selected = ref(today()),
  scope = ref<Slot | "all">("all"),
  happyDay = ref(""),
  low = ref(false),
  editing = ref<Entry>();
const dayRows = (slot: Slot) =>
  s.data.entries
    .filter((e) => e.date === selected.value && e.memberId === slot)
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start));
const monthRows = computed(() =>
  s.data.entries.filter(
    (e) =>
      e.date.startsWith(month.value) &&
      (scope.value === "all" || e.memberId === scope.value),
  ),
);
const distribution = computed(() =>
  s.data.categories
    .map((c) => ({
      ...c,
      minutes: monthRows.value
        .filter((e) => (e.categoryId || "none") === c.id)
        .reduce((n, e) => n + e.minutes, 0),
    }))
    .filter((c) => c.minutes)
    .sort((a, b) => b.minutes - a.minutes),
);
const series = computed(() =>
  Array.from({ length: 7 }, (_, i) => {
    const date = shift(today(), i - 6),
      rows = s.data.entries.filter(
        (e) =>
          e.date === date &&
          e.happy &&
          e.memberId === (scope.value === s.other ? s.other : s.slot),
      );
    return {
      date,
      value: rows.length
        ? rows.reduce((n, e) => n + (e.happy || 0), 0) / rows.length
        : null,
    };
  }),
);
const lows = computed(() =>
  s.data.entries.filter(
    (e) =>
      e.happy &&
      e.happy <= 2 &&
      e.memberId === (scope.value === s.other ? s.other : s.slot) &&
      (happyDay.value
        ? e.date === happyDay.value
        : e.date >= shift(today(), -6) && e.date <= today()),
  ),
);
const selfTime = computed(() =>
  s.data.entries
    .filter(
      (e) =>
        e.date >= weekStart() &&
        e.date <= today() &&
        ["growth", "leisure"].includes(e.categoryId || "") &&
        (scope.value === "all" || e.memberId === scope.value),
    )
    .reduce((n, e) => n + e.minutes, 0),
);
</script>
<template>
  <div class="page narrow">
    <div class="topline">
      <div class="brand">我们</div>
      <div class="topline-date"><Icon name="calendar" :size="17" /></div>
    </div>
    <PageHead title="回看" subtitle="没有记录的日子也没关系。" hide-settings />
    <section class="card">
      <MonthCalendar
        v-model:month="month"
        v-model:selected="selected"
        :entries="s.data.entries"
        :slot="s.slot"
      />
    </section>
    <section class="card">
      <div class="card-title">
        <span
          >{{ monthDay(selected) }} ·
          {{ selected === today() ? "今天" : weekday(selected) }}</span
        ><span class="sub">两人并排</span>
      </div>
      <div class="review-pair">
        <div v-for="slot in [s.slot, s.other]" :key="slot" class="review-col">
          <div class="who-title">
            <MemberAvatar :member="s.member(slot)" :size="20" /><span>{{
              s.member(slot).name
            }}</span>
          </div>
          <EntryList
            :entries="dayRows(slot)"
            :editable="slot === s.slot"
            @edit="editing = $event"
          />
        </div>
      </div>
    </section>
    <section class="card">
      <div class="card-title">
        时间分布
        <div class="mini-tabs" style="margin: 0" aria-label="回看范围">
          <button
            class="mini-tab"
            :class="{ on: scope === 'all' }"
            @click="scope = 'all'"
          >
            我们</button
          ><button
            class="mini-tab"
            :class="{ on: scope === s.slot }"
            @click="scope = s.slot"
          >
            我</button
          ><button
            class="mini-tab"
            :class="{ on: scope === s.other }"
            @click="scope = s.other"
          >
            对方
          </button>
        </div>
      </div>
      <div v-for="c in distribution" :key="c.id" class="bar-row">
        <span
          class="bar-ico"
          :style="{ background: rgba(c.color), color: c.color }"
          ><Icon :name="catIcon(c.id)" :size="14" /></span
        ><span class="bar-name">{{ c.name }}</span
        ><span class="bar-track"
          ><i
            :style="{
              width: (c.minutes / (distribution[0]?.minutes || 1)) * 100 + '%',
              background: c.color,
            }"
          ></i></span
        ><span class="bar-val">{{ Math.round(c.minutes / 6) / 10 }}h</span>
      </div>
      <div v-if="!distribution.length" class="empty">这个月还没有记录。</div>
      <div class="self-line">
        <span>给自己的时间 · 本周</span><b>{{ duration(selfTime) }}</b>
      </div>
    </section>
    <section class="card">
      <div class="card-title">
        快乐值<span class="sub">近 7 天</span
        ><button
          class="card-link"
          @click="
            low = !low;
            happyDay = '';
          "
        >
          {{ low ? "收起低分记录" : "看看低分记录" }}
        </button>
      </div>
      <template v-if="series.some((p) => p.value !== null)"
        ><MoodChart
          :series="series"
          :selected="happyDay"
          @select="
            happyDay = $event;
            low = true;
          "
        />
        <div class="chart-tip">
          点某一天 → 看那天的低分记录。不做评价，也不扣分。
        </div></template
      >
      <div v-else class="empty">
        近 7 天还没有快乐值记录。<br />记一笔的时候可以顺手打一个分。
      </div>
      <div v-if="low" class="low-list">
        <div v-for="e in lows" :key="e.id" class="low-item">
          <span class="t">{{ monthDay(e.date) }}</span
          ><span>{{ e.content }}</span
          ><span class="s">{{ e.happy }} 分</span>
        </div>
        <p v-if="!lows.length" class="chip-hint">
          {{ happyDay ? monthDay(happyDay) : "近 7 天" }}没有低分记录。
        </p>
      </div>
    </section>
    <RecordEditor
      v-if="editing"
      :entry="editing"
      @close="editing = undefined"
    />
  </div>
</template>
