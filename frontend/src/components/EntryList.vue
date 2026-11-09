<script setup lang="ts">
import { computed, ref } from "vue";
import { useSpace } from "../stores/space";
import type { Entry } from "../models";
import Icon from "./Icon.vue";
import { catIcon, rgba } from "../lib/presentation";
import { duration } from "../lib/date";
const props = defineProps<{
  entries: Entry[];
  editable?: boolean;
  showScore?: boolean;
  merge?: boolean;
}>();
const emit = defineEmits<{ edit: [entry: Entry] }>();
const s = useSpace();
const cat = (e: Entry) =>
  s.data.categories.find((c) => c.id === (e.categoryId || "none")) || {
    name: "未分类",
    color: "#D8D5D2",
    id: "none",
  };
/* 相邻同分类、时间又首尾相接的几条，看成同一段。
   只合并有真实时长的记录：打卡那种 0 分钟的并进来，时间会变成「14:00 – 14:00」。
   未分类不参与 —— 「未分类」不是一个类别，是「还不知道」。
   中间夹了别的分类就绝不跨过去合，否则成了假账。 */
type Seg = { key: string; cat: ReturnType<typeof cat>; items: Entry[] };
const segments = computed<Seg[]>(() => {
  const out: Seg[] = [];
  for (const e of props.entries) {
    const c = cat(e),
      last = out[out.length - 1],
      prev = last && last.items[last.items.length - 1];
    if (
      props.merge &&
      last &&
      prev &&
      c.id !== "none" &&
      last.cat.id === c.id &&
      (prev.minutes || 0) > 0 &&
      (e.minutes || 0) > 0 &&
      prev.end === e.start
    )
      last.items.push(e);
    else out.push({ key: e.id, cat: c, items: [e] });
  }
  return out;
});
const open = ref<Record<string, boolean>>({});
const toggle = (seg: Seg) => {
  open.value = { ...open.value, [seg.key]: !open.value[seg.key] };
};
const span = (seg: Seg) =>
  `${seg.items[0].start} – ${seg.items[seg.items.length - 1].end}`;
const total = (seg: Seg) => seg.items.reduce((n, e) => n + (e.minutes || 0), 0);
const joined = (seg: Seg) => seg.items.map((e) => e.content).join(" · ");
</script>
<template>
  <div v-if="!entries.length" class="empty">
    这天还没有记录。<br />记下来，就已经很好。
  </div>
  <div v-else class="entries">
    <template v-for="seg in segments" :key="seg.key">
      <article
        v-if="seg.items.length > 1"
        class="entry entry-seg"
        role="button"
        tabindex="0"
        :aria-expanded="!!open[seg.key]"
        :aria-label="'展开这一段：' + joined(seg)"
        @click="toggle(seg)"
        @keydown.enter="toggle(seg)"
      >
        <div class="entry-top">
          <div
            class="entry-ico"
            :style="{ background: rgba(seg.cat.color), color: seg.cat.color }"
          >
            <Icon :name="catIcon(seg.cat.id)" :size="20" />
          </div>
          <div class="entry-main">
            <div class="entry-line1">
              <span class="entry-time">{{ span(seg) }}</span
              ><span
                class="entry-chip"
                :style="{
                  background: rgba(seg.cat.color),
                  color: seg.cat.color,
                }"
                >{{ seg.cat.name }}</span
              ><span class="entry-dur">{{ duration(total(seg)) }}</span>
            </div>
            <div class="entry-text">
              {{ joined(seg)
              }}<span class="seg-count">{{ seg.items.length }} 条</span>
            </div>
          </div>
          <div class="entry-arrow">
            <Icon name="right" :size="15" />
          </div>
        </div>
        <div v-if="open[seg.key]" class="seg-rows">
          <div
            v-for="e in seg.items"
            :key="e.id"
            class="seg-row"
            :class="{ editable }"
            :role="editable ? 'button' : undefined"
            :tabindex="editable ? 0 : undefined"
            :aria-label="editable ? '修改记录：' + e.content : undefined"
            @click.stop="editable && emit('edit', e)"
            @keydown.enter.stop="editable && emit('edit', e)"
          >
            <span class="seg-time">{{ e.start }}–{{ e.end }}</span
            ><span class="seg-text">{{ e.content }}</span
            ><span class="seg-dur">{{ duration(e.minutes) }}</span>
          </div>
        </div>
      </article>
      <article
        v-else
        class="entry"
        :class="{ editable }"
        :role="editable ? 'button' : undefined"
        :tabindex="editable ? 0 : undefined"
        :aria-label="editable ? '修改记录：' + seg.items[0].content : undefined"
        @click="editable && emit('edit', seg.items[0])"
        @keydown.enter="editable && emit('edit', seg.items[0])"
      >
        <div
          class="entry-ico"
          :style="{ background: rgba(seg.cat.color), color: seg.cat.color }"
        >
          <Icon :name="catIcon(seg.cat.id)" :size="20" />
        </div>
        <div class="entry-main">
          <div class="entry-line1">
            <span class="entry-time">{{
              seg.items[0].minutes
                ? `${seg.items[0].start} – ${seg.items[0].end}`
                : seg.items[0].start
            }}</span
            ><span
              class="entry-chip"
              :style="{
                background: rgba(seg.cat.color),
                color: seg.cat.color,
              }"
              >{{ seg.cat.name }}</span
            ><span class="entry-dur">{{
              seg.items[0].minutes
                ? duration(seg.items[0].minutes)
                : "已做到"
            }}</span>
          </div>
          <div class="entry-text">{{ seg.items[0].content }}</div>
          <div v-if="showScore && seg.items[0].happy" class="entry-foot">
            <span class="entry-score">{{ seg.items[0].happy }} 分</span>
          </div>
        </div>
        <div v-if="editable" class="entry-arrow">
          <Icon name="right" :size="15" />
        </div>
      </article>
    </template>
  </div>
</template>
