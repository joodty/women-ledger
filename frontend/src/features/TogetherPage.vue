<script setup lang="ts">
import { computed, ref } from "vue";
import { useSpace } from "../stores/space";
import { useTask } from "../lib/task";
import type { Slot } from "../models";
import PageHead from "../components/PageHead.vue";
import CoupleStatus from "../components/CoupleStatus.vue";
import HistoryTimeline from "../components/HistoryTimeline.vue";
import MemberAvatar from "../components/MemberAvatar.vue";
import Icon from "../components/Icon.vue";
const s = useSpace(),
  task = useTask();
const goals = computed(() =>
  s.data.goals.filter((g) => g.scope === "both" && g.status === "active"),
);
/* 各自做到的：只收「本周已经到量」的个人约定，只留名字。
   没到量的不进列表、也不写「还差几次」—— 这里只报告做到的事，不是成绩单。
   共同约定不重复，上面「我们的约定」已经在显示进度了。 */
const doneOpen = ref(false);
const doneNames = (slot: Slot) =>
  s.data.goals
    .filter(
      (g) =>
        g.status === "active" &&
        g.scope !== "both" &&
        g.memberId === slot &&
        s.reached(g, slot),
    )
    .map((g) => g.name);
const doneRows = computed(() =>
  [s.slot, s.other]
    .map((slot) => ({ slot, names: doneNames(slot) }))
    .filter((row) => row.names.length),
);
const doneTotal = computed(() =>
  doneRows.value.reduce((n, row) => n + row.names.length, 0),
);
</script>
<template>
  <div class="page narrow">
    <PageHead title="一起" subtitle="把想做的事慢慢实现" /><CoupleStatus />
    <section class="card">
      <div class="card-title">
        我们的约定<span class="sub">做到了就攒分</span
        ><RouterLink class="card-link" to="/goals"
          >管理<Icon name="right" :size="12"
        /></RouterLink>
      </div>
      <div v-for="g in goals" :key="g.id" class="wish-item">
        <span
          class="wish-ico"
          style="background: var(--pink-soft); color: var(--pink-deep)"
          ><Icon name="check" :size="18" /></span
        ><span class="wish-main"
          ><span class="task-top"
            ><span class="wish-name">{{ g.name }}</span
            ><span class="task-gap">{{
              g.joined === false
                ? "等待加入"
                : `${s.progress(g)}/${g.kind === "once" ? 1 : g.timesPerWeek || 1} · ${g.pointsPerCheckin} 分`
            }}</span></span
          ></span
        ><button
          v-if="g.joined === false && g.memberId !== s.slot"
          class="wish-btn"
          @click="
            task.run(async () => {
              await s.submit('goal.join', { id: g.id }, '加入约定');
            })
          "
        >
          加入
        </button>
      </div>
      <div v-if="!goals.length" class="empty">
        还没有一起做的事。定一件小的，谁做都算。
      </div>
    </section>
    <section v-if="doneTotal" class="card">
      <button
        type="button"
        class="done-head"
        :class="{ open: doneOpen }"
        :aria-expanded="doneOpen"
        aria-label="各自做到的，点开看"
        @click="doneOpen = !doneOpen"
      >
        <span class="done-title">各自做到的</span
        ><span class="done-sum">本周 {{ doneTotal }} 件</span
        ><Icon name="down" :size="14" />
      </button>
      <div v-if="doneOpen" class="done-body">
        <div v-for="row in doneRows" :key="row.slot" class="done-row">
          <MemberAvatar :member="s.member(row.slot)" :size="21" />
          <div class="done-main">
            <div class="done-who">{{ s.member(row.slot).name }}</div>
            <div class="done-list">{{ row.names.join("、") }}</div>
          </div>
        </div>
      </div>
    </section>
    <section class="card">
      <div class="card-title">
        一起做过的<RouterLink class="card-link" to="/past"
          >全部<Icon name="right" :size="12"
        /></RouterLink>
      </div>
      <HistoryTimeline :limit="5" />
    </section>
    <RouterLink to="/story" class="list-row story-link"
      ><span class="list-ico"><Icon name="speech" :size="19" /></span
      ><span class="list-main"
        ><span class="list-k">我们的故事接龙</span
        ><span class="list-d">一人接一段，慢慢写完一个故事</span></span
      ><Icon name="right" :size="16"
    /></RouterLink>
    <p class="v2-error" role="alert">{{ task.error.value }}</p>
  </div>
</template>
