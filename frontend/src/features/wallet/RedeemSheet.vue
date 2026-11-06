<script setup lang="ts">
import { computed } from "vue";
import { useSpace } from "../../stores/space";
import { useTask } from "../../lib/task";
import Modal from "../../components/Modal.vue";
import Icon from "../../components/Icon.vue";
import type { Wish } from "../../models";
const props = defineProps<{ wish: Wish; confirming?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const s = useSpace(),
  task = useTask();
const shared = computed(() => (props.wish.scope || "both") === "both"),
  cost = computed(() => Number(props.wish.pointsLabel) || 0),
  /* 发起这次兑换时，池子里还剩多少 */
  before = computed(() =>
    shared.value ? s.poolOurs() : s.balance(s.slot),
  ),
  after = computed(() => Math.max(0, before.value - cost.value)),
  poolName = computed(() => (shared.value ? "我们一起的分" : "我的分"));
function confirmIt() {
  task.run(async () => {
    await s.redeem(props.wish.id);
    s.notice = shared.value ? "已经发出去了，等他点头" : "兑换成功";
    emit("close");
  });
}
</script>
<template>
  <Modal title="确认兑换" @close="emit('close')">
    <div class="rd-what">
      <span class="rd-ico"
        ><Icon :name="wish.icon || 'star'" :size="19"
      /></span>
      <span class="rd-name">{{ wish.name }}</span>
    </div>
    <p class="rd-line">需要 <b>{{ cost }} 分</b></p>
    <p class="rd-line">
      从{{ poolName }}里扣 {{ cost }} 分，扣完剩 <b>{{ after }} 分</b>
    </p>
    <p v-if="shared && !confirming" class="rd-hint">
      他点头之后才真扣，现在反悔还来得及。
    </p>
    <p v-else-if="shared" class="rd-hint">你点头之后就扣分。</p>
    <p class="v2-error" role="alert">{{ task.error.value }}</p>
    <div class="rd-acts">
      <button type="button" class="rd-no" :disabled="task.busy.value" @click="emit('close')">
        再想想
      </button>
      <button type="button" class="rd-ok" :disabled="task.busy.value" @click="confirmIt">
        确认兑换
      </button>
    </div>
  </Modal>
</template>
