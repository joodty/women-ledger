<script setup lang="ts">
import { computed, ref } from "vue";
import { useSpace } from "../stores/space";
import { useDraft } from "../lib/draft";
import { useTask } from "../lib/task";
import PageHead from "../components/PageHead.vue";
import { useSpeech } from "./speech/useSpeech";
import { exportFile } from "../lib/native";
const s = useSpace(),
  task = useTask(),
  showAll = ref(false),
  extra = ref("");
const { draft, warning, clear } = useDraft(
  `women.v2.draft.${s.session!.account}.story`,
  { text: "", id: crypto.randomUUID() },
);
const stories = computed(() =>
    s.data.story_entries.slice().sort((a, b) => a.seq - b.seq),
  ),
  last = computed(() => stories.value.at(-1));
const speech = useSpeech((text) => {
  if (draft.value.text.length + text.length <= 10000) draft.value.text += text;
  else extra.value = text;
});
function publish() {
  task.run(async () => {
    await s.submit(
      "story.publish",
      { id: draft.value.id, text: draft.value.text },
      "故事草稿",
    );
    clear();
    draft.value = { text: "", id: crypto.randomUUID() };
    showAll.value = true;
  });
}
function spark() {
  if (draft.value.text && !confirm("已有草稿，要用灵感开头替换吗？")) return;
  const list = s.data.sparks;
  draft.value.text = list[Math.floor(Math.random() * list.length)] || "";
}
function exportStory() {
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
  <PageHead
    title="我们的故事接龙"
    subtitle="不用同时在线，也能一起写完一个故事。"
    back
  />
  <section v-if="last && !showAll" class="prev-card">
    <div class="prev-head">
      上一段 · {{ s.member(last.memberId).name }}写于{{ last.date }}
    </div>
    <div class="prev-body v2-wrap">{{ last.text }}</div>
  </section>
  <div class="turn-badge">♡ 轮到你续写啦</div>
  <form @submit.prevent="publish">
    <section class="write-card">
      <textarea
        id="story-input"
        v-model="draft.text"
        class="write-area"
        maxlength="10000"
        placeholder="接着上一段往下写…"
        required
      ></textarea>
      <div class="write-foot">
        <span id="story-count" class="write-count"
          >{{ draft.text.length }}/10000</span
        ><button
          id="story-mic"
          class="story-mic"
          :class="{ recording: speech.phase.value === 'recording' }"
          :disabled="['preparing', 'transcribing'].includes(speech.phase.value)"
          type="button"
          :aria-label="
            speech.phase.value === 'recording' ? '停止录音' : '开始录音'
          "
          @click="speech.toggle"
        >
          <svg
            viewBox="0 0 24 24"
            width="17"
            height="17"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            aria-hidden="true"
          >
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v4M9 22h6" /></svg
          ><span>{{
            speech.phase.value === "recording"
              ? `停止 ${speech.seconds.value}/${speech.max.value}秒`
              : speech.phase.value === "preparing"
                ? "准备中…"
                : speech.phase.value === "transcribing"
                  ? "识别中…"
                  : "语音"
          }}</span></button
        ><button class="spark-btn" type="button" @click="spark">
          换个灵感
        </button>
      </div>
      <p class="v2-error" role="alert">
        {{ warning || speech.error.value || task.error.value }}
      </p>
    </section>
    <section v-if="extra" class="card">
      <p>识别文字加上草稿超过一万字，文字保留在这里，请分段使用：</p>
      <textarea v-model="extra" class="write-area" readonly></textarea>
    </section>
    <button
      class="btn-primary"
      :disabled="task.busy.value || speech.phase.value !== 'idle'"
      data-act="publish"
    >
      发布这一段
    </button>
  </form>
  <button class="btn-ghost" @click="showAll = !showAll">
    {{ showAll ? "收起故事" : "查看整篇故事" }}</button
  ><template v-if="showAll"
    ><article
      v-for="segment in stories"
      :key="segment.id"
      class="story-seg"
      :class="{ him: segment.memberId !== s.slot }"
    >
      <section class="seg-card">
        <small class="muted"
          >{{ s.member(segment.memberId).name }} · {{ segment.date }}</small
        >
        <div class="v2-wrap">{{ segment.text }}</div>
      </section>
    </article>
    <p v-if="!stories.length" class="empty">故事还没开始，写下第一段吧。</p>
    <button class="btn-blue" @click="exportStory">
      导出整篇故事
    </button></template
  >
</template>
