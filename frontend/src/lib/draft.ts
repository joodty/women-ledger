import { ref, watch } from "vue";
export function useDraft<T extends object>(key: string, initial: T) {
  let data = initial;
  try {
    const saved = localStorage.getItem(key);
    if (saved) data = JSON.parse(saved);
  } catch {}
  const draft = ref(data) as import("vue").Ref<T>;
  const warning = ref("");
  watch(
    draft,
    (v) => {
      try {
        localStorage.setItem(key, JSON.stringify(v));
        warning.value = "";
      } catch {
        warning.value = "本机空间不足，草稿暂未保存，请及时提交或复制文字";
      }
    },
    { deep: true, flush: "sync" },
  );
  function clear() {
    localStorage.removeItem(key);
  }
  return { draft, warning, clear };
}
