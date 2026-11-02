<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useSpace } from "./stores/space";
import AuthPage from "./features/AuthPage.vue";
import Icon from "./components/Icon.vue";
import type { Pending } from "./models";
import { useTask } from "./lib/task";
import { connectNative } from "./lib/native";
const s = useSpace(),
  showPending = ref(false),
  task = useTask();
connectNative(s);
const tabs = [
  ["/", "sun", "今天"],
  ["/together", "heart", "一起"],
  ["/points", "gift", "兑换"],
  ["/review", "calendar", "回看"],
];
onMounted(() => s.init());
function discard(p: Pending) {
  if (confirm("放弃这次本机修改？服务器上的内容不会更改。"))
    task.run(() => s.resolve(p, false));
}
function replace(p: Pending) {
  if (confirm("使用这次修改覆盖这条内容的服务器版本？"))
    task.run(() => s.resolve(p, true));
}
function readable(value: unknown) {
  if (!value || typeof value !== "object") return "这条内容";
  const v = value as Record<string, unknown>;
  return (
    [v.name, v.content, v.text, v.date, v.start, v.end]
      .filter((x) => typeof x === "string")
      .join(" · ") || "内容已变更"
  );
}
</script>
<template>
  <AuthPage v-if="s.needsLogin" />
  <div v-else-if="!s.ready" class="v2-auth">
    <div class="card">
      <h1>我们</h1>
      <p>{{ s.fatal || "正在打开你们的空间…" }}</p>
      <button v-if="s.fatal" class="btn-primary" @click="s.init">
        重新连接
      </button>
    </div>
  </div>
  <div v-else class="app">
    <div class="v2-sync" role="status">
      <span>{{
        s.sending
          ? "正在保存…"
          : s.offline
            ? "网络不稳定，本机内容已保留"
            : s.pending.length
              ? "有 " + s.pending.length + " 条待处理内容"
              : s.recoveries.length
                ? "发现旧版未同步内容"
                : "已同步"
      }}</span
      ><button
        v-if="s.pending.length || s.recoveries.length"
        @click="showPending = !showPending"
      >
        查看待处理</button
      ><button v-else @click="s.refresh">刷新</button>
    </div>
    <main class="view">
      <RouterView />
      <div
        v-if="s.notice"
        class="v2-toast"
        role="status"
        @click="s.notice = ''"
      >
        {{ s.notice }}
      </div>
    </main>
    <nav class="tabbar" aria-label="主导航">
      <RouterLink
        v-for="[path, icon, label] in tabs"
        :key="path"
        :to="path"
        class="tab"
        :class="{ on: $route.path === path }"
        ><span class="tab-ico-wrap"><Icon :name="icon" :size="22" /></span
        ><span>{{ label }}</span></RouterLink
      >
    </nav>
  </div>
  <Teleport to="body"
    ><section v-if="showPending && s.ready" class="v2-pending">
      <header class="v2-head">
        <h2>本机待提交内容</h2>
        <button @click="showPending = false">收起</button>
      </header>
      <p>
        内容保存在这台设备上。网络恢复后会尝试提交，遇到需要决定的修改会继续保留。
      </p>
      <p class="v2-error">{{ task.error.value }}</p>
      <article v-for="item in s.pending" :key="item.command.id" class="card">
        <strong>{{ item.label }}</strong>
        <p>{{ item.message || "等待连接后提交" }}</p>
        <template v-if="item.details"
          ><p>服务器内容：</p>
          <p class="v2-wrap">{{ readable(item.details.current) }}</p>
          <p>这次修改：</p>
          <p class="v2-wrap">{{ readable(item.command.payload) }}</p>
          <button class="btn-primary" @click="replace(item)">
            保留这次修改
          </button></template
        ><button
          v-else
          class="btn-primary"
          @click="task.run(() => s.retry(item))"
        >
          重试提交</button
        ><button class="btn-ghost" @click="discard(item)">
          保留服务器内容
        </button>
      </article>
      <article v-for="item in s.recoveries" :key="item.key" class="card">
        <h3>旧版未同步内容</h3>
        <p>原始副本会保留到恢复成功。</p>
        <button
          class="btn-primary"
          @click="task.run(() => s.restoreLegacy(item))"
        >
          尝试恢复
        </button>
      </article>
      <p v-if="!s.pending.length && !s.recoveries.length">已经全部处理完成。</p>
    </section></Teleport
  >
</template>
