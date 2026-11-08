<script setup lang="ts">
import { computed, ref } from "vue";
import { useSpace } from "../stores/space";
import { useTask } from "../lib/task";
import PageHead from "../components/PageHead.vue";
import Icon from "../components/Icon.vue";
import GoalEditor from "./goals/GoalEditor.vue";
import { useGoalCheckin } from "../lib/checkin";
import { confirmCommand } from "../lib/confirmCommand";
import type { Goal } from "../models";
const s = useSpace(),
  task = useTask(),
  editor = ref(false),
  editing = ref<Goal>(),
  shared = ref(false),
  { justLogged, gained, log: logGoal, undo: undoGoal } = useGoalCheckin(),
  openAction = ref(""),
  archived = ref(false);
/* 一次就完的约定打完卡会自动归档；刚打完的这一张先留在原地，好让她点「撤销」 */
const visible = computed(() =>
  s.data.goals.filter(
    (g) =>
      (g.memberId === s.slot || g.scope === "both") &&
      (archived.value
        ? g.status !== "active" && !justLogged.value[g.id]
        : g.status === "active" || !!justLogged.value[g.id]),
  ),
);
/* 每组内部：还没做到的在前，本周已达标的沉到后面。归档口径不变，它们仍是同一条约定。 */
const sunk = (g: Goal) =>
  s.progress(g) >= (g.kind === "once" ? 1 : g.timesPerWeek || 1) ? 1 : 0;
const ordered = (both: boolean) =>
  visible.value
    .filter((g) => (g.scope === "both") === both)
    .slice()
    .sort((a, b) => sunk(a) - sunk(b));
const groups = computed(() => [
  { title: "我的约定", items: ordered(false) },
  { title: "我们的约定", items: ordered(true) },
]);
function add(both = false) {
  editing.value = undefined;
  shared.value = both;
  editor.value = true;
}
function archive(g: Goal) {
  if (confirm("结束这个约定并归档？已有打卡记录和积分会保留。"))
    task.run(async () => {
      await s.submit(
        "goal.archive",
        { id: g.id, status: "done" },
        "归档约定",
        "goals",
        s.version("goals", g.id),
      );
      /* 动作做完了就把「更多」收起来，不然它会一直开着 */
      openAction.value = "";
    });
}
/* 归档不是终点：一次就完的约定会自己归档，想接着做就把它放回去。 */
function restore(g: Goal) {
  task.run(async () => {
    await s.submit(
      "goal.archive",
      { id: g.id, status: "active" },
      "放回正在进行",
      "goals",
      s.version("goals", g.id),
    );
    openAction.value = "";
  });
}
function remove(g: Goal) {
  task.run(async () => {
    await confirmCommand(
      s,
      "goal.delete",
      "goals",
      g.id,
      "删除这个约定？已有记录和积分保留，不能再为它打卡。",
      "删除约定",
    );
  });
}
</script>
<template>
  <div class="page">
    <div class="sub-wrap">
      <PageHead
        title="约定"
        subtitle="定下的事，每做到一次打一次卡，每次都有分。"
        back
        ><span
          >{{ visible.filter((g) => g.scope !== "both").length }}/3</span
        ></PageHead
      >
      <div class="mini-tabs goal-status-tabs">
        <button :class="{ on: !archived }" @click="archived = false">
          正在进行</button
        ><button :class="{ on: archived }" @click="archived = true">
          已归档
        </button>
      </div>
      <p class="v2-error" role="alert">{{ task.error.value }}</p>
      <section
        v-for="(group, index) in groups"
        :key="group.title"
        class="wl-sec"
      >
        <div class="wl-sec-head">
          {{ group.title }}<span class="n">{{ group.items.length }}</span
          ><button
            v-if="index === 1 && !archived"
            class="sum-go"
            @click="add(true)"
          >
            <Icon name="plus" :size="14" />加一个
          </button>
        </div>
        <article
          v-for="g in group.items"
          :key="g.id"
          class="goal-card"
          :class="{
            'goal-card-done':
              s.progress(g) >= (g.kind === 'once' ? 1 : g.timesPerWeek || 1),
          }"
        >
          <div class="goal-head">
            <span class="goal-ico"><Icon name="target" :size="20" /></span
            ><span class="goal-name">{{ g.name }}</span
            ><button
              v-if="g.memberId === s.slot"
              class="goal-edit"
              :aria-label="'修改约定：' + g.name"
              @click="
                editing = g;
                editor = true;
              "
            >
              <Icon name="edit" :size="17" /></button
            ><button
              v-if="g.memberId === s.slot"
              class="goal-dots"
              :aria-label="'更多操作：' + g.name"
              :aria-expanded="openAction === g.id"
              @click="openAction = openAction === g.id ? '' : g.id"
            >
              <Icon name="down" :size="15" />
            </button>
          </div>
          <div class="kv">
            <span class="kv-k">分类</span
            ><span class="kv-v">{{
              s.data.categories.find((c) => c.id === g.categoryId)?.name ||
              "未分类"
            }}</span>
          </div>
          <div class="kv">
            <span class="kv-k">做到一次</span
            ><span class="kv-v"
              >{{ g.pointsPerCheckin }} 分 · 进{{
                g.scope === "both" ? "我们的分" : "我的分"
              }}</span
            >
          </div>
          <div class="goal-foot">
            <span class="goal-stat prog-dots"
              ><template v-if="g.kind !== 'once'"
                ><span
                  v-for="n in Math.min(21, g.timesPerWeek || 1)"
                  :key="n"
                  class="dot-s"
                  :class="{ on: n <= s.progress(g) }"
                  :style="{
                    color: s.data.categories.find((c) => c.id === g.categoryId)
                      ?.color,
                  }"
                ></span></template
              ><span class="txt">{{
                g.joined === false
                  ? "等待对方加入"
                  : g.kind === "once"
                    ? s.progress(g)
                      ? "已完成"
                      : "一次就完"
                    : `${s.progress(g)}/${g.timesPerWeek || 1}`
              }}</span
            ><b v-if="justLogged[g.id] && gained[g.id]" class="goal-gain"
              >· +{{ gained[g.id].points }} 分</b
            ></span
            ><span class="goal-btns"
              ><button
                v-if="g.joined === false && g.memberId !== s.slot && !archived"
                class="btn-mini"
                @click="
                  task.run(async () => {
                    await s.submit('goal.join', { id: g.id }, '加入约定');
                  })
                "
              >
                加入</button
              ><button
                v-if="justLogged[g.id]"
                class="btn-mini undo"
                :aria-label="'撤销刚才记的：' + g.name"
                @click="undoGoal(g)"
              >
                撤销</button
              ><button
                v-else-if="g.joined !== false && !archived"
                class="btn-mini"
                :disabled="s.reached(g)"
                :aria-label="
                  (s.reached(g)
                    ? '已完成：'
                    : g.kind === 'once'
                      ? '完成：'
                      : '打卡：') + g.name
                "
                @click="logGoal(g)"
              >
                {{
                  s.reached(g)
                    ? "已完成"
                    : g.kind === "once"
                      ? "完成"
                      : "打卡"
                }}
              </button></span
            >
          </div>
          <div
            v-if="g.memberId === s.slot && openAction === g.id"
            class="goal-more"
          >
            <button v-if="!archived" class="card-link" @click="archive(g)">
              结束并归档</button
            ><button
              v-else-if="g.kind !== 'once' || !s.progress(g)"
              class="card-link"
              @click="restore(g)"
            >
              放回正在进行</button
            ><button class="card-link danger-text" @click="remove(g)">
              删除
            </button>
          </div>
        </article>
        <div v-if="!group.items.length" class="empty">
          还没有约定。<br />从一件小到不会失败的事开始。
        </div>
        <button
          v-if="index === 0 && !archived"
          class="add-block"
          @click="add(false)"
        >
          <Icon name="plus" :size="15" />新增约定 · {{ group.items.length }}/3
        </button>
      </section>
      <div class="page-foot">归档或删除后，已有记录保留</div>
      <GoalEditor
        v-if="editor"
        :goal="editing"
        :shared="shared"
        @close="editor = false"
      />
    </div>
  </div>
</template>
