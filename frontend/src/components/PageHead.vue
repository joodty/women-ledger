<script setup lang="ts">
import { useRouter } from "vue-router";
import Icon from "./Icon.vue";
withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    back?: boolean;
    backTo?: string;
    hideSettings?: boolean;
  }>(),
  { backTo: "/" },
);
const router = useRouter();
</script>
<template>
  <header v-if="back" class="sub-head">
    <button
      class="sub-back"
      aria-label="返回"
      @click="
        router.options.history.state.back ? router.back() : router.push(backTo)
      "
    >
      <Icon name="left" :size="17" />
    </button>
    <h1 class="sub-title">{{ title }}</h1>
    <div class="sub-right"><slot /></div>
  </header>
  <header v-else class="page-head">
    <h1 class="page-title">{{ title }}</h1>
    <RouterLink
      v-if="!hideSettings"
      class="top-gear"
      to="/settings"
      aria-label="设置"
      ><Icon name="gear" :size="18"
    /></RouterLink>
    <p v-if="subtitle" class="page-sub">{{ subtitle }}</p>
  </header>
  <p v-if="back && subtitle" class="sub-lead">{{ subtitle }}</p>
</template>
