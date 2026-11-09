<script setup lang="ts">
import { computed, ref } from "vue";
import { useSpace } from "../stores/space";
import { useTask } from "../lib/task";
import PageHead from "../components/PageHead.vue";
import Icon from "../components/Icon.vue";
import GoalEditor from "./goals/GoalEditor.vue";
import { useGoalCheckin } from "../lib/checkin";
import { confirmCommand } from "../lib/confirmCommand";
import { today } from "../lib/date";
import type { Goal } from "../models";
const s = useSpace(),
  task = useTask(),
  editor = ref(false),
  editing = ref<Goal>(),
  shared = ref(false),
  { justLogged, gained, log: logGoal } = useGoalCheckin(),
  openAction = ref(""),
  archived = ref(false);
/* 共同的约定两个人都能改能删 —— 谁先建的不该决定谁说了算；个人的仍只归自己 */
const canEdit = (g: Goal) => g.memberId === s.slot || g.scope === "both";
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
/* 分组标题只留主谓：卡片里已经写清楚了是什么，标题再重复一遍只是噪音 */
const groups = computed(() => [
  { title: "我的", items: ordered(false) },
  { title: "一起", items: ordered(true) },
]);
const done = (g: Goal) => s.reached(g);
const catOf = (g: Goal) =>
  s.data.categories.find((c) => c.id === g.categoryId);
const catName = (g: Goal) => catOf(g)?.name || "未分类";
const catColor = (g: Goal) => catOf(g)?.color || "var(--ink-3)";
/* 一周要做七八次的约定，点会顶到卡片外面去被切掉（实机截图里就是这样）。
   超过五个就不画点，只留数字 —— 旁边那个 0/7 已经把话说清楚了 */
const dots = (g: Goal) => {
  const n = g.timesPerWeek || 1;
  return n > 5 ? 0 : n;
};
/* 今天为这个约定打过卡没有。服务端也拦着，这里只是让按钮提前把答案说出来，
   不然她得点一下才发现打不进去 */
const todayDone = (g: Goal) =>
  s.data.entries.some(
    (e) => e.goalId === g.id && e.memberId === s.slot && e.date === today(),
  );
/* 右边那格只放一件事，按这个顺序挑最重要的一件：
   能不能加入 → 本周做够了没有 → 今天打过没有 → 可以打卡 */
type Cta = "join" | "wait" | "done" | "today" | "log" | "none";
const cta = (g: Goal): Cta => {
  if (g.joined === false)
    return g.memberId !== s.slot && !archived.value ? "join" : "wait";
  if (archived.value) return "none";
  if (s.reached(g)) return "done";
  if (justLogged.value[g.id] || todayDone(g)) return "today";
  return "log";
};
/* 撤销今天这一下：不占打卡键旁边的地方 —— 那格只有一个位置，
   窄屏上「已打卡」加「撤销」会把第二行挤到看不见。
   放进「更多」里，刷新之后也还能撤 */
function undoToday(g: Goal) {
  const e = s.data.entries.find(
    (x) => x.goalId === g.id && x.memberId === s.slot && x.date === today(),
  );
  if (!e) return;
  task.run(async () => {
    await s.submit("record.delete", { id: e.id }, "撤销今天的打卡", "entries");
    openAction.value = "";
  });
}
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
      <PageHead title="约定" back
        ><span
          >{{ visible.filter((g) => g.scope !== "both").length }}/3</span
        ></PageHead
      >
      <div class="mini-tabs goal-status-tabs">
        <button
          class="mini-tab"
          :class="{ on: !archived }"
          @click="archived = false"
        >
          正在进行</button
        ><button class="mini-tab" :class="{ on: archived }" @click="archived = true">
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
            'goal-card-done': done(g),
            'goal-card-archived': archived,
          }"
        >
          <span class="goal-ico">
            <Icon
              :name="done(g) ? 'check' : g.scope === 'both' ? 'rings' : 'ring'"
              :size="22"
            />
          </span>
          <div class="goal-line">
            <span class="goal-name">{{ g.name }}</span
            ><span v-if="g.memberId !== s.slot" class="goal-by"
              >{{ s.member(g.memberId).name }}建的</span
            >
          </div>
          <div class="goal-acts">
            <button
              v-if="canEdit(g)"
              class="goal-edit"
              :aria-label="'修改约定：' + g.name"
              @click="
                editing = g;
                editor = true;
              "
            >
              <Icon name="edit" :size="16" /></button
            ><button
              v-if="canEdit(g)"
              class="goal-dots"
              :aria-label="'更多操作：' + g.name"
              :aria-expanded="openAction === g.id"
              @click="openAction = openAction === g.id ? '' : g.id"
            >
              <Icon name="down" :size="14" />
            </button>
          </div>
          <div class="goal-meta">
            <span v-if="g.joined === false" class="goal-txt">等待对方加入</span>
            <template v-else>
              <span v-if="g.kind !== 'once'" class="prog-dots"
                ><span
                  v-for="n in dots(g)"
                  :key="n"
                  class="dot-s"
                  :class="{ on: n <= s.progress(g) }"
                  :style="{ color: catColor(g) }"
                ></span
                ><span class="txt"
                  >{{ s.progress(g) }}/{{ g.timesPerWeek || 1 }}</span
                ></span
              >
              <span v-else class="goal-txt">{{
                s.progress(g) ? "已完成" : "一次就完"
              }}</span>
              <span class="goal-sep">·</span
              ><span class="goal-cat" :style="{ color: catColor(g) }">{{
                catName(g)
              }}</span
              ><span class="goal-sep">·</span
              ><span
                class="goal-pt"
                :class="{ just: justLogged[g.id] && gained[g.id] }"
                >+{{ g.pointsPerCheckin }}</span
              >
            </template>
          </div>
          <div class="goal-cta">
            <button
              v-if="cta(g) === 'join'"
              class="btn-mini"
              @click="
                task.run(async () => {
                  await s.submit('goal.join', { id: g.id }, '加入约定');
                })
              "
            >
              加入</button
            ><span v-else-if="cta(g) === 'today'" class="btn-check on"
              >已打卡</span
            ><button
              v-else-if="cta(g) === 'done' || cta(g) === 'log'"
              class="btn-check"
              :class="{ off: cta(g) === 'done' }"
              :disabled="cta(g) === 'done'"
              :aria-label="
                (cta(g) === 'done'
                  ? '已完成：'
                  : g.kind === 'once'
                    ? '完成：'
                    : '打卡：') + g.name
              "
              @click="logGoal(g)"
            >
              {{
                cta(g) === "done"
                  ? "已完成"
                  : g.kind === "once"
                    ? "完成"
                    : "打卡"
              }}
            </button>
          </div>
          <div v-if="canEdit(g) && openAction === g.id" class="goal-more">
            <button
              v-if="!archived && todayDone(g)"
              class="card-link"
              @click="undoToday(g)"
            >
              撤销今天的打卡</button
            ><button v-if="!archived" class="card-link" @click="archive(g)">
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
