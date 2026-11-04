<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { useSpace } from "../stores/space";
import { useTask } from "../lib/task";
import { confirmCommand } from "../lib/confirmCommand";
import { today } from "../lib/date";
import { daysBetween, monthDay } from "../lib/presentation";
import { useHistory, type HistoryItem } from "../lib/history";
import type { Milestone } from "../models";
import PageHead from "../components/PageHead.vue";
import HistoryTimeline from "../components/HistoryTimeline.vue";
import Modal from "../components/Modal.vue";
import Icon from "../components/Icon.vue";
const s = useSpace(),
  route = useRoute(),
  task = useTask(),
  editor = ref(false),
  form = ref({
    id: "",
    date: today(),
    title: "见面",
    note: "",
    baseVersion: undefined as number | undefined,
  });
const past = computed(() => route.path === "/past"),
  { all: history } = useHistory(),
  meetings = computed(() =>
    s.data.milestones
      .filter((m) => m.kind === "meet")
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date)),
  );
/* 做过页顶部的一行：共几件、跨了几个月 */
const historySpan = computed(() => {
  const list = history.value;
  if (!list.length) return "";
  const label = (m: string) => Number(m.slice(5)) + " 月";
  const oldest = list[list.length - 1].month,
    newest = list[0].month;
  return oldest === newest
    ? label(newest)
    : label(oldest) + "到" + label(newest);
});
const next = computed(
  () =>
    s.data.milestones
      .filter((m) => m.kind === "meet" && m.date >= today())
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))[0],
);
function edit(m?: Milestone) {
  form.value = {
    id: m?.id || crypto.randomUUID(),
    date: m?.date || today(),
    title: m?.title || "见面",
    note: m?.note || m?.plan || "",
    baseVersion: m ? s.version("milestones", m.id) : undefined,
  };
  editor.value = true;
}
function save() {
  task.run(async () => {
    await s.submit(
      "meeting.save",
      { ...form.value },
      "见面安排",
      "milestones",
      form.value.baseVersion,
    );
    editor.value = false;
  });
}
function remove(m: Milestone) {
  task.run(async () => {
    await confirmCommand(
      s,
      m.kind === "meet" ? "meeting.delete" : "milestone.delete",
      "milestones",
      m.id,
      "删除这条共同安排或回忆？其他记录和积分不受影响。",
      "删除共同安排",
    );
  });
}
/* 时间线里的一行换回里程碑对象，操作逻辑跟原来一致 */
function findMilestone(item: HistoryItem) {
  return s.data.milestones.find((m) => m.id === item.id);
}
function editItem(item: HistoryItem) {
  const m = findMilestone(item);
  if (m) edit(m);
}
function removeItem(item: HistoryItem) {
  const m = findMilestone(item);
  if (m) remove(m);
}
</script>
<template>
  <div class="page">
    <div class="sub-wrap">
      <PageHead
        :title="past ? '一起做过的' : '下次见面'"
        back
        back-to="/together"
      />
      <template v-if="past">
        <p v-if="history.length" class="tl-total">
          共 {{ history.length }} 件 · {{ historySpan }}
        </p>
        <section class="card">
          <HistoryTimeline manage show-note @edit="editItem" @remove="removeItem" />
        </section>
        <RouterLink class="btn-ghost" to="/story/full"
          >查看我们的一篇</RouterLink
        >
      </template>
      <template v-else>
        <section class="count-card">
          <div class="count-main">
            <div class="count-k">距离下一次见面</div>
            <strong
              >{{ next ? daysBetween(today(), next.date) : "—" }}<em>天</em></strong
            >
            <p class="muted">{{ next?.date || "还没定，一起挑个日子吧" }}</p>
          </div>
          <Icon name="heart" :size="28" />
        </section>
        <button class="add-block" @click="edit(next)">
          <Icon name="calendar" :size="16" />{{
            next ? "修改下次见面" : "安排下一次见面"
          }}
        </button>
        <section class="card">
          <div class="card-title">
            见面安排<button class="card-link" @click="edit()">新增</button>
          </div>
          <article v-for="m in meetings" :key="m.id" class="prog-row">
            <span class="prog-ico"
              ><Icon name="users" :size="17" /></span
            ><span class="prog-main"
              ><span class="prog-name">{{ m.title }}</span
              ><span class="prog-dots"
                ><span class="txt"
                  >{{ monthDay(m.date) }} · {{ m.note || m.plan }}</span
                ></span
              ></span
            ><button
              class="re"
              :aria-label="'修改安排：' + m.title"
              @click="edit(m)"
            >
              <Icon name="edit" :size="15" /></button
            ><button
              class="re danger-text"
              :aria-label="'删除安排：' + m.title"
              @click="remove(m)"
            >
              <Icon name="trash" :size="15" />
            </button>
          </article>
          <div v-if="!meetings.length" class="empty">
            慢慢攒下你们的共同回忆。
          </div>
        </section>
      </template>
      <p class="v2-error" role="alert">{{ task.error.value }}</p>
      <Modal v-if="editor" title="见面安排" @close="editor = false"
        ><form @submit.prevent="save">
          <label class="field"
            ><span class="field-k">日期</span
            ><input
              v-model="form.date"
              type="date"
              class="input-box"
              required /></label
          ><label class="field"
            ><span class="field-k">主题</span
            ><input
              v-model="form.title"
              class="input-box"
              required
              maxlength="200" /></label
          ><label class="field"
            ><span class="field-k">计划</span
            ><textarea
              v-model="form.note"
              class="textarea"
              maxlength="10000"
            ></textarea>
          </label>
          <p class="v2-error">{{ task.error.value }}</p>
          <button class="btn-primary" :disabled="task.busy.value">
            保存安排
          </button>
        </form></Modal
      >
    </div>
  </div>
</template>
