import { ref } from "vue";
export function useTask() {
  const busy = ref(false),
    error = ref("");
  async function run(task: () => Promise<void>) {
    if (busy.value) return;
    busy.value = true;
    error.value = "";
    try {
      await task();
    } catch (e) {
      error.value = e instanceof Error ? e.message : "操作未完成，请重试";
    } finally {
      busy.value = false;
    }
  }
  return { busy, error, run };
}
