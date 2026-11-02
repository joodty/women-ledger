<script setup lang="ts">
import { computed, ref } from "vue";
import { useSpace } from "../stores/space";
import PageHead from "../components/PageHead.vue";
import Icon from "../components/Icon.vue";
import RecordEditor from "./records/RecordEditor.vue";
import { today, duration } from "../lib/date";
import type { Entry, Slot } from "../models";
const s = useSpace(),
  side = ref<Slot>(s.slot),
  date = ref(today()),
  editor = ref(false),
  editing = ref<Entry>();
const rows = computed(() =>
  s.data.entries
    .filter((e) => e.date === date.value && e.memberId === side.value)
    .sort((a, b) => a.start.localeCompare(b.start)),
);
const activeGoals = computed(() =>
  s.data.goals.filter(
    (g) =>
      g.status === "active" && (g.memberId === s.slot || g.scope === "both"),
  ),
);
const category = (id?: string | null) =>
  s.data.categories.find((c) => c.id === (id || "none"));
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
  <PageHead title="今天，过得怎么样？" subtitle="记录下来，就已经很好。" />
  <div class="topline-date">
    <span>{{ today() }}</span
    ><Icon name="calendar" :size="17" />
  </div>
  <section class="card">
    <div class="v2-head">
      <div>
        <span class="v2-avatar"
          ><img
            v-if="s.member(s.slot).avatar"
            :src="s.member(s.slot).avatar!"
            alt=""
          /><template v-else>{{ s.member(s.slot).name[0] }}</template></span
        ><span style="margin-left: 10px">{{ s.member(s.slot).name }}</span>
      </div>
      <RouterLink class="card-link" to="/goals"
        >管理约定 <Icon name="right" :size="12"
      /></RouterLink>
    </div>
    <div v-for="g in activeGoals.slice(0, 4)" :key="g.id" class="v2-item">
      <Icon name="target" />
      <div class="v2-item-main">
        <strong>{{ g.name }}</strong>
        <p>
          {{
            g.joined === false
              ? "等待加入"
              : g.kind === "once"
                ? s.progress(g)
                  ? "已完成"
                  : "一次就完"
                : `本周 ${s.progress(g)} / ${g.timesPerWeek || 1}`
          }}
        </p>
      </div>
      <RouterLink class="v2-small-button" to="/goals">查看</RouterLink>
    </div>
    <p v-if="!activeGoals.length" class="empty">
      定一个小约定，让日子慢慢变好。
    </p>
  </section>
  <div class="v2-tabs">
    <button :class="{ on: side === s.slot }" @click="side = s.slot">
      {{ s.member(s.slot).name }}的空间</button
    ><button :class="{ on: side === s.other }" @click="side = s.other">
      {{ s.member(s.other).name }}的空间
    </button>
  </div>
  <label class="v2-field">哪一天<input v-model="date" type="date" /></label>
  <section class="card">
    <h2 class="card-title">
      {{ side === s.slot ? "我的记录" : "对方分享的记录" }}
    </h2>
    <p v-if="!rows.length" class="empty">这一天还没有记录。</p>
    <article v-for="e in rows" :key="e.id" class="v2-item">
      <span
        class="v2-dot"
        :style="{ background: category(e.categoryId)?.color }"
      />
      <div class="v2-item-main">
        <strong>{{ e.content }}</strong>
        <p>
          {{ e.start }}–{{ e.end }} · {{ duration(e.minutes) }} ·
          {{ category(e.categoryId)?.name || "未分类"
          }}{{ e.visibility === "private" ? " · 仅自己" : "" }}
        </p>
        <p v-if="e.note">{{ e.note }}</p>
      </div>
      <button v-if="e.memberId === s.slot" class="card-link" @click="edit(e)">
        修改
      </button>
    </article>
  </section>
  <button class="btn-primary" data-act="add" @click="add">
    <Icon name="plus" :size="18" />记一笔</button
  ><RecordEditor v-if="editor" :entry="editing" @close="editor = false" />
</template>
