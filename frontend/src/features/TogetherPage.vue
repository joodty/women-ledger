<script setup lang="ts">
import { computed } from "vue";
import { useSpace } from "../stores/space";
import { useTask } from "../lib/task";
import { today } from "../lib/date";
import { monthDay } from "../lib/presentation";
import PageHead from "../components/PageHead.vue";
import CoupleStatus from "../components/CoupleStatus.vue";
import Icon from "../components/Icon.vue";
const s = useSpace(),
  task = useTask();
const goals = computed(() =>
  s.data.goals.filter((g) => g.scope === "both" && g.status === "active"),
);
const wishes = computed(() =>
  s.data.wishlist
    .filter(
      (w) =>
        (w.scope || "both") === "both" &&
        !["done", "redeemed"].includes(w.status || ""),
    )
    .slice()
    .sort(
      (a, b) =>
        (Number(a.pointsLabel) || 10001) - (Number(b.pointsLabel) || 10001),
    )
    .slice(0, 3),
);
const events = computed(() =>
  [
    ...s.data.milestones
      .filter((m) => m.date <= today())
      .map((m) => ({
        id: m.id,
        date: m.date,
        name: m.title,
        icon: m.kind === "meet" ? "users" : "heart",
      })),
    ...s.data.redemptions
      .filter(
        (r) =>
          !["pending", "cancelled", "reversed"].includes(r.status || "") &&
          r.wallet === "ours",
      )
      .map((r) => ({ id: r.id, date: r.date, name: r.name, icon: "gift" })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5),
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
    <section class="card">
      <div class="card-title">
        想一起做的事<RouterLink class="card-link" to="/wishlist"
          >管理<Icon name="right" :size="12"
        /></RouterLink>
      </div>
      <RouterLink
        v-for="w in wishes"
        :key="w.id"
        class="prog-row"
        to="/wishlist"
        ><span class="prog-ico"
          ><Icon :name="w.icon || 'star'" :size="18" /></span
        ><span class="prog-main"
          ><span class="prog-name">{{ w.name }}</span
          ><span class="prog-dots"
            ><span class="txt"
              >{{
                w.executor === "both"
                  ? "我们一起"
                  : s.member(w.executor || s.slot).name
              }}
              · {{ w.pointsLabel }} 分</span
            ></span
          ></span
        ><Icon name="right" :size="16"
      /></RouterLink>
      <div v-if="!wishes.length" class="empty">还没有想一起做的事。</div>
      <RouterLink v-if="!wishes.length" class="add-block" to="/wishlist"
        >加一个想一起做的事</RouterLink
      >
    </section>
    <section class="card">
      <div class="card-title">
        一起做过的<RouterLink class="card-link" to="/past"
          >全部<Icon name="right" :size="12"
        /></RouterLink>
      </div>
      <div v-for="e in events" :key="e.id" class="prog-row">
        <span class="prog-ico"><Icon :name="e.icon" :size="17" /></span
        ><span class="prog-main"
          ><span class="prog-name">{{ e.name }}</span
          ><span class="prog-dots"
            ><span class="txt">{{ monthDay(e.date) }}</span></span
          ></span
        >
      </div>
      <div v-if="!events.length" class="empty">
        还什么都没做过。<br />从上面挑一件，慢慢攒。
      </div>
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
