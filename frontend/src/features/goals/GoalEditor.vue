<script setup lang="ts">
import { computed } from "vue";
import Modal from "../../components/Modal.vue";
import { useSpace } from "../../stores/space";
import { useDraft } from "../../lib/draft";
import { useTask } from "../../lib/task";
import { requestReminders } from "../../lib/native";
import { confirmCommand } from "../../lib/confirmCommand";
import type { Goal } from "../../models";
const props = defineProps<{ goal?: Goal; shared?: boolean }>(),
  emit = defineEmits<{ close: [] }>(),
  s = useSpace(),
  task = useTask();
const {
  draft: f,
  warning,
  clear,
} = useDraft(
  `women.v2.draft.${s.session!.account}.goal.${props.goal?.id || "new"}`,
  {
    id: props.goal?.id || crypto.randomUUID(),
    name: props.goal?.name || "",
    kind: props.goal?.kind || "repeat",
    scope: props.goal?.scope || (props.shared ? "both" : "me"),
    visibility: props.goal?.visibility || "shared",
    timesPerWeek: props.goal?.timesPerWeek || 3,
    pointsPerCheckin: props.goal?.pointsPerCheckin || 3,
    reminderTime: props.goal?.reminderTime || "",
    categoryId: props.goal?.categoryId || "growth",
    baseVersion: props.goal ? s.version("goals", props.goal.id) : undefined,
  },
);
const tiers = computed(() =>
  f.value.kind === "once" ? [1, 2, 3, 5, 8, 10, 20, 30] : [1, 2, 3, 5],
);
function kind(value: "once" | "repeat") {
  f.value.kind = value;
  if (f.value.pointsPerCheckin > (value === "once" ? 30 : 5))
    f.value.pointsPerCheckin = 3;
}
function save() {
  task.run(async () => {
    await s.submit(
      props.goal ? "goal.update" : "goal.create",
      { ...f.value },
      "约定：" + f.value.name,
      "goals",
      f.value.baseVersion,
    );
    if (f.value.reminderTime) requestReminders();
    clear();
    emit("close");
  });
}
function remove() {
  task.run(async () => {
    if (
      await confirmCommand(
        s,
        "goal.delete",
        "goals",
        f.value.id,
        "删除这个约定？已有记录和已获得的积分会保留，但不能再为它打卡。",
        "删除约定",
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
  <Modal :title="goal ? '编辑约定' : '新增约定'" @close="emit('close')"
    ><form @submit.prevent="save">
      <label class="field"
        ><span class="field-k">约定内容</span
        ><input
          id="e-name"
          v-model="f.name"
          aria-label="约定名称"
          class="input-box"
          required
          maxlength="200"
          placeholder="比如：每天走 20 分钟"
      /></label>
      <div class="field">
        <div class="field-k">归属分类</div>
        <div class="chips" role="group" aria-label="归属分类">
          <button
            v-for="c in s.data.categories.filter((c) => c.id !== 'none')"
            :key="c.id"
            class="chip-cat"
            :class="{ on: f.categoryId === c.id }"
            type="button"
            @click="f.categoryId = c.id"
          >
            <span class="cdot" :style="{ background: c.color }"></span
            >{{ c.name }}
          </button>
        </div>
      </div>
      <div class="field">
        <div class="field-k">做几次</div>
        <div class="chips" role="group" aria-label="做几次">
          <button
            type="button"
            class="chip-cat"
            :class="{ on: f.kind === 'once' }"
            @click="kind('once')"
          >
            一次就完</button
          ><button
            type="button"
            class="chip-cat"
            :class="{ on: f.kind === 'repeat' }"
            @click="kind('repeat')"
          >
            每周要做
          </button>
        </div>
        <div class="chip-hint">
          {{
            f.kind === "once"
              ? "做完就结束，可以归档。"
              : "每周做到几次，记一次算一次。"
          }}
        </div>
      </div>
      <div v-if="f.kind === 'repeat'" class="field">
        <div class="field-k">每周次数</div>
        <div class="chips" role="group" aria-label="每周次数">
          <button
            v-for="n in 7"
            :key="n"
            type="button"
            class="chip-num"
            :class="{ on: f.timesPerWeek === n }"
            @click="f.timesPerWeek = n"
          >
            {{ n }}</button
          ><span v-if="f.timesPerWeek > 7" class="chip-num on">{{
            f.timesPerWeek
          }}</span>
        </div>
        <div class="chip-hint">
          点约定上的「记一次」，或记一笔时选中它，都会计入本周进度。
        </div>
      </div>
      <div class="field">
        <div class="field-k">做到一次几分</div>
        <div class="chips" role="group" aria-label="每次完成获得积分">
          <button
            v-for="n in tiers"
            :key="n"
            class="chip-num"
            :class="{ on: f.pointsPerCheckin === n }"
            type="button"
            @click="f.pointsPerCheckin = n"
          >
            {{ n }}
          </button>
        </div>
        <div class="chip-hint">
          {{
            f.kind === "once"
              ? "小事 1–3，中等 5–10，大事 20–30。"
              : "每周要做的一次最多 5 分；攒分靠很多次。"
          }}
        </div>
      </div>
      <div class="field">
        <div class="field-k">属于谁</div>
        <div class="chips" role="group" aria-label="属于谁">
          <button
            class="chip-cat"
            :class="{ on: f.scope === 'me' }"
            type="button"
            @click="f.scope = 'me'"
          >
            只算我自己的</button
          ><button
            class="chip-cat"
            :class="{ on: f.scope === 'both' }"
            type="button"
            @click="f.scope = 'both'"
          >
            我们共同的
          </button>
        </div>
        <div class="chip-hint">
          共同的约定要两个人都点头：一人发起，另一人加入。
        </div>
      </div>
      <label class="field"
        ><span class="field-k">每天提醒（选填）</span
        ><input
          id="e-reminder-time"
          v-model="f.reminderTime"
          class="input-box"
          type="time"
        /><span class="chip-hint"
          >登录安卓 App 并允许通知，手机每天会提醒；留空关闭。</span
        ></label
      >
      <p class="v2-error" role="alert">{{ warning || task.error.value }}</p>
      <button class="btn-primary" :disabled="task.busy.value">保存约定</button
      ><button
        v-if="goal"
        type="button"
        class="btn-ghost danger-action"
        @click="remove"
      >
        删除这个约定
      </button>
      <div class="foot-line">随时可以改，历史记录会保留。</div>
    </form></Modal
  >
</template>
