<script setup lang="ts">
import { computed } from "vue";
import Modal from "../../components/Modal.vue";
import { useSpace } from "../../stores/space";
import { useDraft } from "../../lib/draft";
import { useTask } from "../../lib/task";
import { today } from "../../lib/date";
import type { Entry } from "../../models";
const props = defineProps<{ entry?: Entry; goalId?: string }>(),
  emit = defineEmits<{ close: [] }>(),
  s = useSpace(),
  task = useTask();
const initial = {
  id: props.entry?.id || crypto.randomUUID(),
  date: props.entry?.date || today(),
  start: props.entry?.start || "09:00",
  end: props.entry?.end || "10:00",
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
  if (props.entry && confirm("删除这条记录？"))
    task.run(async () => {
      await s.submit(
        "record.delete",
        { id: props.entry!.id },
        "删除记录",
        "entries",
        f.value.baseVersion,
      );
      clear();
      emit("close");
    });
}
</script>
<template>
  <Modal :title="entry ? '修改记录' : '记一笔'" @close="emit('close')"
    ><form @submit.prevent="save">
      <label class="v2-field"
        >日期<input v-model="f.date" type="date" required
      /></label>
      <div class="v2-grid">
        <label class="v2-field"
          >开始<input
            id="f-start"
            v-model="f.start"
            type="time"
            required /></label
        ><label class="v2-field"
          >结束<input id="f-end" v-model="f.end" type="time" required
        /></label>
      </div>
      <label class="v2-field"
        >做了什么<textarea
          id="f-content"
          v-model="f.content"
          required
          maxlength="10000"
          placeholder="一句话就好，也可以慢慢写"
        ></textarea></label
      ><label class="v2-field"
        >分类<select v-model="f.categoryId">
          <option value="">未分类</option>
          <option
            v-for="c in s.data.categories.filter((c) => c.id !== 'none')"
            :key="c.id"
            :value="c.id"
          >
            {{ c.name }}
          </option>
        </select></label
      ><label class="v2-field"
        >计入哪个约定<select id="f-goal" v-model="f.goalId">
          <option value="">不计入约定</option>
          <option v-for="g in goals" :key="g.id" :value="g.id">
            {{ g.name }}
          </option>
        </select></label
      ><label class="v2-field"
        >可见范围<select id="f-visibility" v-model="f.visibility">
          <option value="shared">双方可见</option>
          <option value="private">仅自己可见</option>
        </select></label
      ><label class="v2-field"
        >心情<select v-model="f.happy">
          <option :value="null">不填写</option>
          <option v-for="n in 5" :key="n" :value="n">{{ n }} 分</option>
        </select></label
      ><label class="v2-field"
        >补充备注<textarea v-model="f.note" maxlength="10000"></textarea>
      </label>
      <p class="v2-error" role="alert">{{ warning || task.error.value }}</p>
      <button
        class="btn-primary"
        :disabled="task.busy.value"
        data-act="save-entry"
      >
        保存记录</button
      ><button v-if="entry" class="btn-ghost" type="button" @click="remove">
        删除记录
      </button>
    </form></Modal
  >
</template>
