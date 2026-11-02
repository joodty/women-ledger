<script setup lang="ts">
import type { Member } from "../models";
defineProps<{ member: Member; size?: number }>();
</script>
<template>
  <span
    class="member-avatar"
    :class="member.side"
    :style="{ width: (size || 26) + 'px', height: (size || 26) + 'px' }"
    ><img v-if="member.avatar" :src="member.avatar" alt="" /><span v-else>{{
      member.name.slice(0, 1)
    }}</span></span
  >
</template>
