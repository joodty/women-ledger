<script setup lang="ts">
import { computed } from "vue";
import { useSpace } from "../stores/space";
import { useTask } from "../lib/task";
import { exportFile } from "../lib/native";
import { confirmCommand } from "../lib/confirmCommand";
import { monthDay } from "../lib/presentation";
import type { Story } from "../models";
import PageHead from "../components/PageHead.vue";
import Icon from "../components/Icon.vue";
const s = useSpace(),
  task = useTask(),
  stories = computed(() =>
    s.data.story_entries.slice().sort((a, b) => a.seq - b.seq),
  );
function remove(x: Story) {
  task.run(async () => {
    await confirmCommand(
      s,
      "story.delete",
      "story_entries",
      x.id,
      "删除自己写的这一段故事？其他段落保留，顺序不会重排。",
      "删除故事段落",
    );
  });
}
function download() {
  task.run(() =>
    exportFile(
      "我们的故事.txt",
      stories.value
        .map((x) => `${s.member(x.memberId).name} · ${x.date}\n${x.text}`)
        .join("\n\n"),
      "text/plain",
    ),
  );
}
</script>
<template>
  <div class="page">
    <div class="sub-wrap">
      <PageHead
        title="我们的一篇"
        :subtitle="`由${s.member(s.slot).name}与${s.member(s.other).name}，一句一句写成。`"
        back
        back-to="/story"
      />
      <div class="story-flow">
        <article
          v-for="x in stories"
          :key="x.id"
          class="story-seg"
          :class="{ him: x.memberId !== s.slot }"
        >
          <section class="seg-card">
            <span class="seg-who" :class="x.memberId === s.slot ? 'me' : 'him'"
              ><Icon name="heart" :size="11" />{{ s.member(x.memberId).name }} ·
              {{ monthDay(x.date) }}</span
            >
            <div class="seg-text v2-wrap">{{ x.text }}</div>
            <button
              v-if="x.memberId === s.slot"
              class="card-link danger-text segment-delete"
              @click="remove(x)"
            >
              删除这一段
            </button>
          </section>
        </article>
      </div>
      <div v-if="!stories.length" class="card">
        <div class="empty">故事还没开始，写下第一段吧。</div>
      </div>
      <section class="card">
        <div class="sum-row">
          <span class="sum-ico"><Icon name="speech" :size="17" /></span
          ><span class="sum-main"
            ><span class="sum-k">接龙 {{ stories.length }} 段</span
            ><span class="sum-d">由你们一人一句，慢慢接成</span></span
          >
        </div>
      </section>
      <p class="v2-error" role="alert">{{ task.error.value }}</p>
      <div class="btn-row">
        <button class="btn-primary" @click="download">导出整篇故事</button
        ><RouterLink class="btn-ghost" to="/story">继续写故事</RouterLink>
      </div>
    </div>
  </div>
</template>
