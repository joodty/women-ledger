<script setup lang="ts">
import { onMounted, onBeforeUnmount } from "vue";
import Icon from "./Icon.vue";
defineProps<{ title: string }>();
const emit = defineEmits<{ close: [] }>();
let overflow = "";
const escape = (e: KeyboardEvent) => {
  if (e.key === "Escape") emit("close");
};
onMounted(() => {
  overflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  document.addEventListener("keydown", escape);
});
onBeforeUnmount(() => {
  document.body.style.overflow = overflow;
  document.removeEventListener("keydown", escape);
});
</script>
<template>
  <Teleport to="body"
    ><div class="sheet-mask" @click.self="$emit('close')">
      <section
        class="sheet"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
      >
        <div class="sheet-grip"></div>
        <header class="sheet-head">
          <h2 class="sheet-title">{{ title }}</h2>
          <button
            class="sheet-x"
            type="button"
            aria-label="关闭"
            @click="$emit('close')"
          >
            <Icon name="x" :size="18" />
          </button>
        </header>
        <slot />
      </section></div
  ></Teleport>
</template>
