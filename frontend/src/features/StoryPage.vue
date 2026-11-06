<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useSpace } from "../stores/space";
import { useDraft } from "../lib/draft";
import { useTask } from "../lib/task";
import { useStoryTurn } from "../lib/story";
import PageHead from "../components/PageHead.vue";
import Icon from "../components/Icon.vue";
import { useSpeech } from "./speech/useSpeech";
const s = useSpace(),
  task = useTask(),
  router = useRouter(),
  extra = ref("");
const { draft, warning, clear } = useDraft(
  `women.v2.draft.${s.session!.account}.story`,
  { text: "", id: crypto.randomUUID() },
);
const stories = computed(() =>
    s.data.story_entries.slice().sort((a, b) => a.seq - b.seq),
  ),
  { last, yourTurn } = useStoryTurn();
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
    router.push("/story/full");
  });
}
function spark() {
  if (draft.value.text && !confirm("已有草稿，要用灵感开头替换吗？")) return;
  const list = s.data.sparks;
  draft.value.text = list[Math.floor(Math.random() * list.length)] || "";
}
</script>
<template>
  <div class="page">
    <div class="sub-wrap">
      <PageHead
        title="我们的故事接龙"
        subtitle="不用同时在线，也能一起写完一个故事。"
        back
        back-to="/together"
      />
      <section v-if="last" class="prev-card">
        <div class="prev-head">
          <span class="ico"><Icon name="speech" :size="13" /></span>上一段 ·
          {{ s.member(last.memberId).name }}写于{{
            Number(last.date.slice(5, 7))
          }}月{{ Number(last.date.slice(8)) }}日
        </div>
        <div class="prev-body v2-wrap">{{ last.text }}</div>
      </section>
      <div v-if="yourTurn" class="turn-badge">
        <Icon name="heart" :size="13" />轮到你续写啦
      </div>
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
              :disabled="
                ['preparing', 'transcribing'].includes(speech.phase.value)
              "
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
              换个灵感（可选）
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
        <div class="point-band">
          <span class="icon"><Icon name="star" :size="15" /></span
          ><span
            ><span class="k">一起把故事慢慢写下去</span
            ><span class="d">不需要每天写，想到了再继续</span></span
          >
        </div>
        <div class="btn-row">
          <button
            class="btn-primary"
            :disabled="task.busy.value || speech.phase.value !== 'idle'"
            data-act="publish"
          >
            发布这一段</button
          ><RouterLink class="btn-ghost" to="/story/full"
            >查看整篇故事</RouterLink
          >
        </div>
      </form>
      <div class="foot-line">统一用第三人称，接龙才能连成一篇。</div>
    </div>
  </div>
</template>
