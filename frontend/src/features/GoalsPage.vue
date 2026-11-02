<script setup lang="ts">
import { computed, ref } from "vue";
import { useSpace } from "../stores/space";
import { useTask } from "../lib/task";
import PageHead from "../components/PageHead.vue";
import GoalEditor from "./goals/GoalEditor.vue";
import RecordEditor from "./records/RecordEditor.vue";
import type { Goal } from "../models";
const s = useSpace(),
  task = useTask(),
  editor = ref(false),
  editing = ref<Goal>(),
  checkin = ref(""),
  archived = ref(false);
const goals = computed(() =>
  s.data.goals.filter(
    (g) =>
      (g.memberId === s.slot || g.scope === "both") &&
      (archived.value ? g.status !== "active" : g.status === "active"),
  ),
);
function add() {
  editing.value = undefined;
  editor.value = true;
}
function edit(g: Goal) {
  editing.value = g;
  editor.value = true;
}
function join(g: Goal) {
  task.run(() =>
    s.submit("goal.join", { id: g.id }, "加入约定：" + g.name).then(() => {}),
  );
}
function archive(g: Goal, status: string) {
  if (confirm("结束这个约定并归档？已有打卡记录会保留。"))
    task.run(() =>
      s
        .submit("goal.archive", { id: g.id, status }, "归档约定", "goals")
        .then(() => {}),
    );
}
</script>
<template>
  <PageHead
    title="约定"
    subtitle="约定做什么，做到一次就记下来。"
    back
  /><button class="btn-primary" data-act="goal-add" @click="add">
    新增约定
  </button>
  <div class="v2-tabs" style="margin-top: 18px">
    <button :class="{ on: !archived }" @click="archived = false">
      正在进行</button
    ><button :class="{ on: archived }" @click="archived = true">已归档</button>
  </div>
  <p class="v2-error">{{ task.error.value }}</p>
  <section v-for="g in goals" :key="g.id" class="card">
    <div class="card-title">
      {{ g.name
      }}<span class="sub">{{
        g.scope === "both" ? "共同约定" : "个人约定"
      }}</span>
    </div>
    <p class="muted">
      {{ g.kind === "once" ? "一次就完" : `每周 ${g.timesPerWeek || 1} 次` }} ·
      每次 {{ g.pointsPerCheckin }} 分
    </p>
    <p v-if="g.joined === false">
      {{ g.memberId === s.slot ? "等待对方加入" : "对方邀请你加入这个约定" }}
    </p>
    <template v-else
      ><p class="v2-metric">
        {{ s.progress(g)
        }}<small style="font-size: 14px">
          / {{ g.kind === "once" ? 1 : g.timesPerWeek || 1 }}</small
        >
      </p>
      <div class="v2-progress">
        <span
          :style="{
            width:
              Math.min(
                100,
                (s.progress(g) /
                  (g.kind === 'once' ? 1 : g.timesPerWeek || 1)) *
                  100,
              ) + '%',
          }"
        /></div
    ></template>
    <div v-if="g.status === 'active'" class="v2-actions">
      <button
        v-if="g.joined === false && g.memberId !== s.slot"
        class="btn-primary"
        data-act="join-goal"
        @click="join(g)"
      >
        加入</button
      ><button
        v-if="g.joined !== false"
        class="btn-primary"
        @click="checkin = g.id"
      >
        记一次打卡</button
      ><button v-if="g.memberId === s.slot" class="btn-ghost" @click="edit(g)">
        修改
      </button>
    </div>
    <div
      v-if="g.status === 'active' && g.memberId === s.slot"
      class="v2-actions"
    >
      <button class="card-link" @click="archive(g, 'done')">结束并归档</button
      ><button class="card-link" @click="archive(g, 'dropped')">放弃</button>
    </div>
  </section>
  <p v-if="!goals.length" class="empty">这里还没有约定。</p>
  <GoalEditor
    v-if="editor"
    :goal="editing"
    @close="editor = false"
  /><RecordEditor v-if="checkin" :goal-id="checkin" @close="checkin = ''" />
</template>
