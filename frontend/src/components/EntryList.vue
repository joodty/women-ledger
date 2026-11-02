<script setup lang="ts">
import { computed } from "vue";
import { useSpace } from "../stores/space";
import type { Entry } from "../models";
import Icon from "./Icon.vue";
import { catIcon, rgba } from "../lib/presentation";
const props = defineProps<{ entries: Entry[]; editable?: boolean }>();
const emit = defineEmits<{ edit: [entry: Entry] }>();
const s = useSpace(),
  total = computed(() => props.entries.reduce((n, e) => n + e.minutes, 0));
const cat = (e: Entry) =>
  s.data.categories.find((c) => c.id === (e.categoryId || "none")) || {
    name: "未分类",
    color: "#D8D5D2",
    id: "none",
  };
</script>
<template>
  <div v-if="!entries.length" class="empty">
    这天还没有记录。<br />记下来，就已经很好。
  </div>
  <div v-else class="entries">
    <article
      v-for="e in entries"
      :key="e.id"
      class="entry"
      :class="{ editable }"
      :role="editable ? 'button' : undefined"
      :tabindex="editable ? 0 : undefined"
      :aria-label="editable ? '修改记录：' + e.content : undefined"
      @click="editable && emit('edit', e)"
      @keydown.enter="editable && emit('edit', e)"
    >
      <div
        class="entry-ico"
        :style="{ background: rgba(cat(e).color), color: cat(e).color }"
      >
        <Icon :name="catIcon(cat(e).id)" :size="20" />
      </div>
      <div class="entry-main">
        <div class="entry-line1">
          <span class="entry-time">{{ e.start }} – {{ e.end }}</span
          ><span
            class="entry-chip"
            :style="{ background: rgba(cat(e).color), color: cat(e).color }"
            >{{ cat(e).name }}</span
          ><span class="entry-dur">{{ Math.round(e.minutes / 6) / 10 }}h</span>
        </div>
        <div class="entry-text">{{ e.content }}</div>
        <div v-if="e.visibility === 'private'" class="entry-private">
          仅自己可见
        </div>
        <div class="entry-bar">
          <i
            :style="{
              width: Math.min(100, (e.minutes / (total || 1)) * 100) + '%',
              background: cat(e).color,
            }"
          ></i>
        </div>
      </div>
      <div v-if="editable" class="entry-arrow">
        <Icon name="right" :size="15" />
      </div>
    </article>
  </div>
</template>
