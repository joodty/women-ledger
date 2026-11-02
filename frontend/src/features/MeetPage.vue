<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { useSpace } from "../stores/space";
import { useTask } from "../lib/task";
import { confirmCommand } from "../lib/confirmCommand";
import { today } from "../lib/date";
import { daysBetween, monthDay } from "../lib/presentation";
import type { Milestone } from "../models";
import PageHead from "../components/PageHead.vue";
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
  meetings = computed(() =>
    s.data.milestones
      .filter((m) => (past.value ? m.date <= today() : m.kind === "meet"))
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date)),
  );
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
</script>
<template>
  <div class="page">
    <div class="sub-wrap">
      <PageHead
        :title="past ? '一起做过的' : '下次见面'"
        back
        back-to="/together"
      />
      <section v-if="!past" class="count-card">
        <div class="count-main">
          <div class="count-k">距离下一次见面</div>
          <strong
            >{{ next ? daysBetween(today(), next.date) : "—"
            }}<em>天</em></strong
          >
          <p class="muted">{{ next?.date || "还没定，一起挑个日子吧" }}</p>
        </div>
        <Icon name="heart" :size="28" />
      </section>
      <button v-if="!past" class="add-block" @click="edit(next)">
        <Icon name="calendar" :size="16" />{{
          next ? "修改下次见面" : "安排下一次见面"
        }}
      </button>
      <section class="card">
        <div class="card-title">
          {{ past ? "共同回忆" : "见面安排"
          }}<button v-if="!past" class="card-link" @click="edit()">新增</button>
        </div>
        <article v-for="m in meetings" :key="m.id" class="prog-row">
          <span class="prog-ico"
            ><Icon
              :name="m.kind === 'meet' ? 'users' : 'heart'"
              :size="17" /></span
          ><span class="prog-main"
            ><span class="prog-name">{{ m.title }}</span
            ><span class="prog-dots"
              ><span class="txt"
                >{{ monthDay(m.date) }} · {{ m.note || m.plan }}</span
              ></span
            ></span
          ><button
            v-if="m.kind === 'meet'"
            class="re"
            :aria-label="'修改安排：' + m.title"
            @click="edit(m)"
          >
            <Icon name="edit" :size="15" /></button
          ><button
            v-if="m.kind !== 'goal'"
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
      <p class="v2-error" role="alert">{{ task.error.value }}</p>
      <RouterLink v-if="past" class="btn-ghost" to="/story/full"
        >查看我们的一篇</RouterLink
      ><Modal v-if="editor" title="见面安排" @close="editor = false"
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
