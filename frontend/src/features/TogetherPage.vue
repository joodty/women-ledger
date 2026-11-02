<script setup lang="ts">
import { computed, ref } from "vue";
import { useSpace } from "../stores/space";
import { useTask } from "../lib/task";
import PageHead from "../components/PageHead.vue";
import Icon from "../components/Icon.vue";
import Modal from "../components/Modal.vue";
import WishEditor from "./wallet/WishEditor.vue";
import { today } from "../lib/date";
import type { Wish } from "../models";
const s = useSpace(),
  tab = ref("plans"),
  wishEditor = ref(false),
  editing = ref<Wish>(),
  meeting = ref(false),
  task = useTask();
const meetForm = ref({
  id: "",
  date: today(),
  title: "见面",
  note: "",
  baseVersion: undefined as number | undefined,
});
const wishes = computed(() =>
  s.data.wishlist.filter((w) => !["done", "redeemed"].includes(w.status || "")),
);
const events = computed(() =>
  [
    ...s.data.milestones
      .filter((m) => m.date <= today())
      .map((m) => ({ id: m.id, date: m.date, title: m.title })),
    ...s.data.redemptions
      .filter((r) => !["pending", "cancelled"].includes(r.status || ""))
      .map((r) => ({ id: r.id, date: r.date, title: r.name })),
  ].sort((a, b) => b.date.localeCompare(a.date)),
);
const next = computed(
  () =>
    s.data.milestones
      .filter((m) => m.kind === "meet" && m.date >= today())
      .sort((a, b) => a.date.localeCompare(b.date))[0],
);
function editWish(w?: Wish) {
  editing.value = w;
  wishEditor.value = true;
}
function openMeet() {
  const m = next.value;
  meetForm.value = {
    id: m?.id || crypto.randomUUID(),
    date: m?.date || today(),
    title: m?.title || "见面",
    note: m?.note || "",
    baseVersion: m ? s.version("milestones", m.id) : undefined,
  };
  meeting.value = true;
}
function saveMeet() {
  task.run(async () => {
    await s.submit(
      "meeting.save",
      { ...meetForm.value },
      "见面安排",
      "milestones",
      meetForm.value.baseVersion,
    );
    meeting.value = false;
  });
}
</script>
<template>
  <PageHead title="一起" subtitle="把想做的事慢慢实现。" />
  <div class="v2-tabs">
    <button :class="{ on: tab === 'plans' }" @click="tab = 'plans'">
      想做的</button
    ><button :class="{ on: tab === 'past' }" @click="tab = 'past'">
      做过的</button
    ><button :class="{ on: tab === 'creative' }" @click="tab = 'creative'">
      创意
    </button>
  </div>
  <template v-if="tab === 'plans'"
    ><section class="count-card">
      <Icon name="heart" :size="28" />
      <div class="count-main">
        <div class="count-k">下一次见面</div>
        <strong>{{ next ? next.date : "还没有安排" }}</strong>
        <p v-if="next" class="muted">{{ next.note }}</p>
      </div>
      <button class="card-link" @click="openMeet">安排</button>
    </section>
    <RouterLink to="/goals" class="card v2-head"
      ><span>共同约定</span><Icon name="right"
    /></RouterLink>
    <section class="card">
      <div class="card-title">
        想一起做的事<button class="card-link" @click="editWish()">新增</button>
      </div>
      <div v-for="w in wishes" :key="w.id" class="v2-item">
        <Icon name="star" />
        <div class="v2-item-main">
          <strong>{{ w.name }}</strong>
          <p>
            {{
              w.scope==='me'||w.scope==='him' ? s.member(w.scope).name : '我们俩'
            }}
            · {{ w.pointsLabel }} 分
          </p>
        </div>
        <button class="card-link" @click="editWish(w)">修改</button>
      </div>
      <p v-if="!wishes.length" class="empty">
        想到什么就加一条，不用着急实现。
      </p>
    </section>
    <RouterLink to="/points" class="btn-blue"
      >去兑换页看看</RouterLink
    ></template
  ><template v-else-if="tab === 'past'"
    ><RouterLink to="/story" class="card v2-head"
      ><span>我们的故事 · {{ s.data.story_entries.length }} 段</span
      ><Icon name="right"
    /></RouterLink>
    <section class="card">
      <div class="card-title">一起做过的</div>
      <div v-for="event in events" :key="event.id" class="v2-item">
        <div class="v2-item-main">
          <strong>{{ event.title }}</strong>
          <p>{{ event.date }}</p>
        </div>
      </div>
      <p v-if="!events.length" class="empty">慢慢攒下你们的共同回忆。</p>
    </section></template
  >
  <section v-else class="card">
    <div class="card-title">故事接龙</div>
    <p class="muted">一人接一段，不用同时在线。</p>
    <RouterLink class="btn-primary" to="/story">继续写故事</RouterLink>
  </section>
  <p class="v2-error">{{ task.error.value }}</p>
  <WishEditor
    v-if="wishEditor"
    :wish="editing"
    @close="wishEditor = false"
  /><Modal v-if="meeting" title="见面安排" @close="meeting = false"
    ><form @submit.prevent="saveMeet">
      <label class="v2-field"
        >日期<input v-model="meetForm.date" type="date" required /></label
      ><label class="v2-field"
        >主题<input v-model="meetForm.title" required maxlength="200" /></label
      ><label class="v2-field"
        >计划<textarea v-model="meetForm.note" maxlength="10000"></textarea>
      </label>
      <p class="v2-error">{{ task.error.value }}</p>
      <button class="btn-primary" :disabled="task.busy.value">保存安排</button>
    </form></Modal
  >
</template>
