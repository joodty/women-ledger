<script setup lang="ts">
import { computed, ref } from "vue";
import Modal from "../../components/Modal.vue";
import { useSpace } from "../../stores/space";
import { useDraft } from "../../lib/draft";
import { useTask } from "../../lib/task";
import { today, duration } from "../../lib/date";
import type { Entry } from "../../models";
import { confirmCommand } from "../../lib/confirmCommand";
const props = defineProps<{ entry?: Entry; goalId?: string }>(),
  emit = defineEmits<{ close: [] }>(),
  s = useSpace(),
  task = useTask();
/* 新建时折叠，改已有记录时默认展开——点进去就是要改，已经填过的东西得看得见 */
const more = ref(!!props.entry);
const previous = s.data.entries
  .filter((e) => e.memberId === s.slot && e.date === today())
  .slice()
  .sort((a, b) => a.start.localeCompare(b.start))
  .at(-1);
const now = new Date(),
  start =
    previous?.end ||
    `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
const endMinutes =
  (Number(start.slice(0, 2)) * 60 + Number(start.slice(3)) + 60) % 1440;
const initial = {
  id: props.entry?.id || crypto.randomUUID(),
  date: props.entry?.date || today(),
  start: props.entry?.start || start,
  end:
    props.entry?.end ||
    `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`,
  content: props.entry?.content || "",
  note: props.entry?.note || "",
  happy: props.entry?.happy ?? null,
  categoryId: props.entry?.categoryId || "",
  goalId: props.entry?.goalId || props.goalId || "",
  visibility: props.entry?.visibility || "shared",
  baseVersion: props.entry ? s.version("entries", props.entry.id) : undefined,
};
const {
  draft: f,
  warning,
  clear,
} = useDraft(
  `women.v2.draft.${s.session!.account}.entry.${props.entry?.id || "new"}`,
  initial,
);
const goals = computed(() =>
  s.data.goals.filter(
    (g) =>
      g.status === "active" &&
      g.joined !== false &&
      (g.memberId === s.slot || g.scope === "both"),
  ),
);
const minutes = computed(() => {
  const m = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3));
  return (m(f.value.end) - m(f.value.start) + 1440) % 1440;
});
function save() {
  task.run(async () => {
    await s.submit(
      props.entry ? "record.update" : "record.create",
      { ...f.value },
      f.value.content,
      "entries",
      f.value.baseVersion,
    );
    clear();
    emit("close");
  });
}
function remove() {
  if (props.entry)
    task.run(async () => {
      if (
        await confirmCommand(
          s,
          "record.delete",
          "entries",
          props.entry!.id,
          "删除这条记录？相关打卡积分将重新核算；已经消费时请先撤销兑换。",
          "删除记录",
          f.value.baseVersion,
        )
      ) {
        clear();
        emit("close");
      }
    });
}
</script>
<template>
  <Modal :title="entry ? '改一笔' : '记一笔'" @close="emit('close')"
    ><form @submit.prevent="save">
      <label v-if="entry" class="field"
        >日期<input v-model="f.date" type="date" class="input-box" required
      /></label>
      <div class="field">
        <div class="field-k">时间段</div>
        <div class="time-row">
          <label class="time-box"
            ><span class="tk">开始</span
            ><input
              id="f-start"
              v-model="f.start"
              type="time"
              class="time-input"
              required /></label
          ><label class="time-box"
            ><span class="tk">结束</span
            ><input
              id="f-end"
              v-model="f.end"
              type="time"
              class="time-input"
              required
          /></label>
          <div class="time-box time-dur">
            <div class="tk">时长</div>
            <div class="dv">{{ duration(minutes) }}</div>
          </div>
        </div>
      </div>
      <div class="field">
        <label class="field-k" for="f-content">干了什么</label
        ><textarea
          id="f-content"
          v-model="f.content"
          aria-label="做了什么"
          class="textarea"
          maxlength="10000"
          required
        ></textarea>
        <div class="textarea-foot">
          <span class="count-badge">{{ f.content.length }}/10000</span>
        </div>
      </div>
      <button
        type="button"
        class="more-toggle"
        :aria-expanded="more"
        @click="more = !more"
      >
        {{ more ? "－ 更多" : "＋ 更多" }}
      </button>
      <template v-if="more">
      <div class="field">
        <div class="field-k">分类<i>选填</i></div>
        <div class="chips">
          <button
            v-for="c in s.data.categories.filter((c) => c.id !== 'none')"
            :key="c.id"
            type="button"
            class="chip-cat"
            :class="{ on: f.categoryId === c.id }"
            @click="f.categoryId = f.categoryId === c.id ? '' : c.id"
          >
            <span class="cdot" :style="{ background: c.color }"></span
            >{{ c.name }}
          </button>
        </div>
        <div class="chip-hint">可以不选分类，先记下来。</div>
      </div>
      <label class="field"
        ><span class="field-k">计入目标<i>选填</i></span
        ><select
          id="f-goal"
          v-model="f.goalId"
          aria-label="计入哪个约定"
          class="input-box"
        >
          <option value="">不计入目标</option>
          <option v-for="g in goals" :key="g.id" :value="g.id">
            {{ g.name }}
          </option>
          <option
            v-if="f.goalId && !goals.some((g) => g.id === f.goalId)"
            :value="f.goalId"
          >
            原约定已结束，保留历史关联
          </option>
        </select></label
      >
      <div class="field">
        <div class="field-k">今天的快乐值<i>选填</i></div>
        <div class="happy-row" role="group" aria-label="快乐值">
          <button
            v-for="n in 5"
            :key="n"
            type="button"
            class="happy-dot"
            :class="{ on: f.happy === n }"
            :aria-pressed="f.happy === n"
            @click="f.happy = f.happy === n ? null : n"
          >
            {{ n }}
          </button>
        </div>
        <div class="chip-hint">回看页会按天连成一条线。</div>
      </div>
      <label class="field"
        ><span class="field-k">备注<i>选填</i></span
        ><input
          v-model="f.note"
          class="input-box"
          maxlength="10000"
          placeholder="身体、心情，或者别的事…"
      /></label>
      </template>
      <p class="v2-error" role="alert">{{ warning || task.error.value }}</p>
      <button class="btn-primary" :disabled="task.busy.value">
        {{ entry ? "保存修改" : "保存记录" }}</button
      ><button
        v-if="entry"
        class="btn-ghost danger-action"
        type="button"
        @click="remove"
      >
        删除这条记录
      </button>
      <div class="foot-line">
        {{ entry ? "改错了也没关系，随时可以再改。" : "记下来，就已经很好。" }}
      </div>
    </form></Modal
  >
</template>
