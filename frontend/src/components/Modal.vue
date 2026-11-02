<script setup lang="ts">
defineProps<{ title: string }>();
defineEmits<{ close: [] }>();
</script>
<template>
  <Teleport to="body"
    ><div class="v2-modal-mask" @click.self="$emit('close')">
      <section
        class="v2-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
      >
        <header class="v2-head">
          <h2>{{ title }}</h2>
          <button type="button" aria-label="关闭" @click="$emit('close')">
            ×
          </button>
        </header>
        <slot />
      </section></div
  ></Teleport>
</template>
