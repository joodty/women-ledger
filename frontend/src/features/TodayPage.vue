<script setup lang="ts">
import { computed, ref } from "vue";
import { useSpace } from "../stores/space";
import { useGoalCheckin } from "../lib/checkin";
import type { Entry, Goal, Slot } from "../models";
import Icon from "../components/Icon.vue";
import MemberAvatar from "../components/MemberAvatar.vue";
import EntryList from "../components/EntryList.vue";
import TimeDistribution from "../components/TimeDistribution.vue";
import RecordEditor from "./records/RecordEditor.vue";
import GoalEditor from "./goals/GoalEditor.vue";
import TidySheet from "./records/TidySheet.vue";
import { today, duration } from "../lib/date";
import { monthDay, weekday } from "../lib/presentation";
const s = useSpace(),
  { justLogged, log: logOne, undo: undoOne } = useGoalCheckin(),
  side = ref<Slot>(s.slot),
  editor = ref(false),
  editing = ref<Entry>(),
  goalEditor = ref(false),
  tidying = ref(false);
const rows = computed(() =>
  s.data.entries
    .filter((e) => e.date === today() && e.memberId === side.value)
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start)),
);
const goals = computed(() =>
  s.data.goals.filter(
    (g) =>
      g.status === "active" && (g.memberId === s.slot || g.scope === "both"),
  ),
);
/* 到没到量：一次就完看有没有做过一次，每周要做看本周次数够不够 */
const target = (g: Goal) => (g.kind === "once" ? 1 : g.timesPerWeek || 1);
const reached = (g: Goal) => s.progress(g) >= target(g);
/* 没做到的排前面，做过的沉到底部；不隐藏任何一条，超出三行的折成一行字 */
const goalsSorted = computed(() =>
  goals.value
    .slice()
    .sort((a, b) => Number(reached(a)) - Number(reached(b))),
);
const shownGoals = computed(() => goalsSorted.value.slice(0, 3));
const restGoals = computed(() => goalsSorted.value.length - shownGoals.value.length);
const unclassified = computed(() =>
  rows.value.filter((e) => !e.categoryId || e.categoryId === "none"),
);
const other = computed(() => (side.value === s.slot ? s.other : s.slot));

function switchSide() {
  side.value = other.value;
}
function add() {
  editing.value = undefined;
  editor.value = true;
}
function edit(e: Entry) {
  if (e.memberId === s.slot) {
    editing.value = e;
    editor.value = true;
  }
}
</script>
<template>
  <div class="page">
    <div class="topline">
      <div class="brand">我们</div>
      <div class="topline-date">
        <span>{{ monthDay(today()) }} {{ weekday(today()) }}</span
        ><Icon name="calendar" :size="17" />
      </div>
      <RouterLink class="top-gear" to="/settings" aria-label="设置"
        ><Icon name="gear" :size="18"
      /></RouterLink>
    </div>
    <div class="page-head">
      <h1 class="page-title">今天，过得怎么样？</h1>
    </div>
    <section v-if="side === s.slot" class="card">
      <div class="card-title">
        约定<RouterLink class="card-link" to="/goals"
          >管理<Icon name="right" :size="12"
        /></RouterLink>
      </div>
      <div
        v-for="g in shownGoals"
        :key="g.id"
        class="prog-row"
        :class="{ 'goal-done': reached(g) }"
      >
        <span class="prog-main"
          ><span class="prog-name">{{ g.name }}</span
          ><span v-if="justLogged[g.id]" class="goal-just"
            >刚刚记了一次 ·
            <button class="goal-undo" @click="undoOne(g)">撤销</button></span
          ></span
        ><span v-if="g.scope === 'both'" class="task-who">我们的</span
        ><span class="goal-p" :class="{ ok: reached(g) }">{{
          g.joined === false
            ? "等待加入"
            : g.kind === "once"
              ? s.progress(g)
                ? "已完成"
                : "一次就完"
              : `本周 ${s.progress(g)}/${g.timesPerWeek || 1}`
        }}</span
        ><button
          v-if="reached(g) && g.joined !== false"
          class="goal-do done"
          disabled
          :aria-label="'已完成：' + g.name"
        >
          已做到</button
        ><button
          v-else-if="g.joined !== false"
          class="goal-do"
          :aria-label="(g.kind === 'once' ? '完成：' : '记一次：') + g.name"
          @click="logOne(g)"
        >
          {{ g.kind === "once" ? "完成" : "记一次" }}
        </button>
      </div>
      <RouterLink v-if="restGoals" class="goal-fold" to="/goals"
        >还有 {{ restGoals }} 个约定 ›</RouterLink
      ><button
        v-if="!goals.length"
        class="add-block"
        @click="goalEditor = true"
      >
        定一个约定
      </button>
    </section>
    <section class="card">
      <div class="card-title">
        <span class="who-title"
          ><MemberAvatar :member="s.member(side)" :size="26" /><span
            >{{ s.member(side).name }} ·
            {{ side === s.slot ? "我的记录" : "对方分享的记录" }}</span
          ></span
        ><button
          class="side-switch"
          type="button"
          :aria-label="'看' + s.member(other).name + '的记录'"
          @click="switchSide"
          ><MemberAvatar :member="s.member(other)" :size="22" /><Icon
            name="right"
            :size="11"
        /></button>
      </div>
      <EntryList :entries="rows" :editable="side === s.slot" @edit="edit" />
    </section>
    <section class="card">
      <div class="card-title">
        今日时间分布<span class="sub"
          >共 {{ duration(rows.reduce((n, e) => n + e.minutes, 0)) }}</span
        >
      </div>
      <TimeDistribution :entries="rows" /><button
        v-if="side === s.slot && unclassified.length"
        class="tip-row"
        @click="tidying = true"
      >
        <Icon name="clock" :size="14" /><span
          >{{ unclassified.length }} 条未分类 · 去整理</span
        ><span class="go"><Icon name="right" :size="13" /></span>
      </button>
    </section>
    <button class="fab" data-act="add" @click="add">
      <Icon name="plus" :size="15" />记一笔
    </button>
    <RecordEditor
      v-if="editor"
      :entry="editing"
      @close="editor = false"
    /><GoalEditor v-if="goalEditor" @close="goalEditor = false" />
    <TidySheet v-if="tidying" @close="tidying = false" />
  </div>
</template>
