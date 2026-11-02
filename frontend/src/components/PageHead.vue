<script setup lang="ts">
import { useRouter } from "vue-router";
import Icon from "./Icon.vue";
defineProps<{ title: string; subtitle?: string; back?: boolean }>();
const router = useRouter();
</script>
<template>
  <header class="page-head">
    <div class="v2-head">
      <button v-if="back" aria-label="返回" @click="router.back()">
        <Icon name="left" />
      </button>
      <h1 class="page-title">{{ title }}</h1>
      <slot /><RouterLink
        v-if="!back"
        to="/settings"
        aria-label="设置"
        class="top-gear"
        ><Icon name="gear"
      /></RouterLink>
    </div>
    <p v-if="subtitle" class="page-sub">{{ subtitle }}</p>
  </header>
</template>
