<script setup lang="ts">
import { ref } from "vue";
import Icon from "./Icon.vue";
import { useHistory, type HistoryItem } from "../lib/history";
const props = withDefaults(
    defineProps<{ limit?: number; showNote?: boolean; manage?: boolean }>(),
    { limit: 0, showNote: false, manage: false },
  ),
  emit = defineEmits<{ edit: [HistoryItem]; remove: [HistoryItem] }>(),
  { groups } = useHistory(props.limit),
  openId = ref("");
const mmdd = (d: string) => d.slice(5, 7) + "." + d.slice(8, 10);
const tag = (e: HistoryItem) =>
  e.kind === "redeem" ? "兑换" : e.kind === "meet" ? "见面" : "记下";
function toggle(id: string) {
  openId.value = openId.value === id ? "" : id;
}
function pick(e: HistoryItem, action: "edit" | "remove") {
  openId.value = "";
  if (action === "edit") emit("edit", e);
  else emit("remove", e);
}
</script>
<template>
  <div v-if="groups.length" class="tl">
    <div v-for="g in groups" :key="g.month" class="tl-group">
      <div
        v-for="(e, i) in g.items"
        :key="e.source + e.id"
        class="tl-row"
        :data-history="e.source"
      >
        <span class="tl-rail"
          ><span class="tl-dot" :class="{ open: e.kind === 'redeem' }"></span
        ></span>
        <span v-if="i === 0" class="tl-month">{{ g.label }}</span
        ><span v-else class="tl-month"></span>
        <span class="tl-main">
          <span class="tl-head">
            <span class="tl-title">{{ e.title }}</span
            ><span class="tl-tag" :class="e.kind === 'redeem' ? 'gift' : 'meet'">{{
              tag(e)
            }}</span
            ><button
              v-if="manage && e.source === 'milestone'"
              class="tl-more"
              type="button"
              :aria-label="'更多操作：' + e.title"
              @click="toggle(e.id)"
            >
              <Icon name="down" :size="13" />
            </button>
          </span>
          <span v-if="showNote" class="tl-note"
            >{{ mmdd(e.date)
            }}<template v-if="e.note"> · {{ e.note }}</template></span
          >
          <span v-if="manage && openId === e.id" class="tl-actions">
            <button type="button" @click="pick(e, 'edit')">修改</button>
            <button
              type="button"
              class="danger-text"
              @click="pick(e, 'remove')"
            >
              删除
            </button>
          </span>
        </span>
      </div>
    </div>
  </div>
  <div v-else class="empty">慢慢攒下你们的共同回忆。</div>
</template>
