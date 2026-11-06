import { computed } from "vue";
import { useSpace } from "../stores/space";

/* 接龙轮到谁了。
   不需要「已读」状态：接龙本来就是轮流写的，所以「最后一段不是我写的」就等于「轮到我」。
   seq 在服务端是全局单调递增的（stories.cjs: max(seq) + 1），比另记一份
   「我上次看到第几段」简单得多，也不会因为漏存而永远不消。 */
export function useStoryTurn() {
  const s = useSpace();
  const last = computed(() =>
    s.data.story_entries.slice().sort((a, b) => a.seq - b.seq).at(-1),
  );
  /* 轮到我：一片空白时也算，因为第一段谁写都行 */
  const yourTurn = computed(() => !last.value || last.value.memberId !== s.slot);
  /* 有他新写的还没接：必须已经有一段，且那段不是我写的。
     和 yourTurn 只差「一片空白」这一种情况 —— 那时候根本没有"新内容"，不该亮红点。 */
  const unread = computed(() => !!last.value && last.value.memberId !== s.slot);
  return { last, yourTurn, unread };
}
