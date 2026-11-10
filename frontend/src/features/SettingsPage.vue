<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { useRoute } from "vue-router";
import { useSpace } from "../stores/space";
import { api, post } from "../lib/api";
import { exportFile, requestReminders, clearNative } from "../lib/native";
import { useTask } from "../lib/task";
import PageHead from "../components/PageHead.vue";
import Modal from "../components/Modal.vue";
import Icon from "../components/Icon.vue";
import MemberAvatar from "../components/MemberAvatar.vue";
import { confirmCommand } from "../lib/confirmCommand";
import type { Category } from "../models";
const sinceVersion = ref<number>();
const route = useRoute(),
  palette = computed(() => route.path === "/palette");
const dragging = ref(""),
  dropTarget = ref("");
function dragStart(event: PointerEvent, id: string) {
  if (task.busy.value) return;
  dragging.value = id;
  dropTarget.value = id;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}
function dragMove(event: PointerEvent) {
  if (!dragging.value) return;
  const row = document
    .elementFromPoint(event.clientX, event.clientY)
    ?.closest<HTMLElement>("[data-category-id]");
  if (row?.dataset.categoryId && row.dataset.categoryId !== "none")
    dropTarget.value = row.dataset.categoryId;
}
function dragEnd() {
  const id = dragging.value,
    target = dropTarget.value;
  dragging.value = "";
  dropTarget.value = "";
  if (!id || id === target) return;
  const from = s.data.categories.findIndex((c) => c.id === id),
    to = s.data.categories.findIndex((c) => c.id === target);
  if (from < 0 || to < 0) return;
  task.run(async () => {
    for (let i = 0; i < Math.abs(to - from); i++) {
      const op = await s.submit(
        "category.move",
        { id, direction: to > from ? "down" : "up" },
        "调整分类顺序",
        "categories",
        s.version("categories", id),
      );
      const pending = s.pending.find((p) => p.command.id === op);
      if (pending)
        throw Error(pending.message || "排序操作已保存在本机，请联网后继续");
    }
  });
}
const s = useSpace(),
  task = useTask(),
  section = ref(""),
  name = ref(""),
  profileVersion = ref<number>(),
  avatar = ref<string | null>(null),
  since = ref(""),
  invite = ref(""),
  oldPassword = ref(""),
  newPassword = ref(""),
  categories = ref<Category>(),
  catForm = ref({
    id: "",
    name: "",
    desc: "",
    color: "#D6C6E8",
    baseVersion: undefined as number | undefined,
  }),
  history = ref<{ id: number; revision: number; created_at: string }[]>([]),
  historyPreview = ref("");
/* 顶栏那行「已同步 · 刷新」整行拆掉之后，「同步到哪一刻了」和「现在推一把」
   都只剩这一行会说。20 秒跳一次，只是为了让「刚刚」自己变成「3 分钟前」 */
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  clock = setInterval(() => (now.value = Date.now()), 20000);
});
onBeforeUnmount(() => clearInterval(clock));
/* 有待提交、有旧版内容要恢复的时候，这一行才点得开那个面板 */
const needsHandling = computed(
  () => s.pending.length + s.recoveries.length > 0,
);
const syncHint = computed(() => {
  if (s.pending.length) return `有 ${s.pending.length} 条内容还没交上去`;
  if (s.recoveries.length) return "有旧版内容可以恢复";
  if (s.offline) return "网络不稳，本机内容已保留";
  if (!s.lastSync) return "还没有连上过";
  const m = Math.floor((now.value - s.lastSync) / 60000);
  if (m < 1) return "刚刚同步过";
  if (m < 60) return `${m} 分钟前同步`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} 小时前同步` : `${Math.floor(h / 24)} 天前同步`;
});
function syncNow() {
  task.run(async () => {
    await s.refresh();
    s.notice = s.offline ? "还是连不上，稍后再试" : "已经是最新的";
  });
}
function openProfile() {
  name.value = s.member(s.slot).name;
  avatar.value = s.member(s.slot).avatar || null;
  profileVersion.value = s.version("members", s.slot);
  section.value = "profile";
}
function openSince() {
  since.value = s.data.couple.since;
  sinceVersion.value = s.version("settings", "couple");
  section.value = "since";
}
watch(
  () => route.fullPath,
  () => {
    if (route.query.section === "since") openSince();
    else if (route.query.section === "history") showHistory();
    else if (
      route.query.section === "backup" ||
      route.query.section === "password"
    )
      section.value = String(route.query.section);
  },
  { immediate: true },
);
function removeCategory(c: Category) {
  task.run(async () => {
    await confirmCommand(
      s,
      "category.delete",
      "categories",
      c.id,
      "删除这个分类？相关记录和约定会转到未分类，内容和积分保留。",
      "删除分类",
    );
  });
}
function saveProfile() {
  task.run(async () => {
    await s.submit(
      "profile.update",
      { id: s.slot, name: name.value, avatar: avatar.value },
      "个人资料",
      "members",
      profileVersion.value,
    );
    section.value = "";
  });
}
async function image(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  task.run(async () => {
    if (!file.type.startsWith("image/")) throw Error("请选择图片");
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 160;
    const context = canvas.getContext("2d")!;
    const side = Math.min(bitmap.width, bitmap.height);
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      160,
      160,
    );
    avatar.value = canvas.toDataURL("image/jpeg", 0.8);
    bitmap.close();
  });
}
function editCategory(c?: Category) {
  categories.value = c;
  catForm.value = {
    id: c?.id || crypto.randomUUID(),
    name: c?.name || "",
    desc: c?.desc || "",
    color: c?.color || "#D6C6E8",
    baseVersion: c ? s.version("categories", c.id) : undefined,
  };
  section.value = "category";
}
function saveCategory() {
  task.run(async () => {
    await s.submit(
      "category.save",
      { ...catForm.value },
      "分类：" + catForm.value.name,
      "categories",
      catForm.value.baseVersion,
    );
    section.value = "";
  });
}
function exportBackup() {
  task.run(async () => {
    await exportFile(
      "我们-账本备份.json",
      JSON.stringify(
        {
          format: "women-ledger-v2",
          account: s.session!.account,
          slot: s.slot,
          exportedAt: new Date().toISOString(),
          data: s.data,
        },
        null,
        2,
      ),
    );
    s.notice = "文件保存操作已完成，账本仍然保留";
  });
}
function exportPending() {
  task.run(() =>
    exportFile(
      "我们-本机待提交.json",
      JSON.stringify(
        {
          account: s.session!.account,
          pending: s.pending,
          legacy: s.recoveries,
        },
        null,
        2,
      ),
    ),
  );
}
function importBackup(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  task.run(async () => {
    if (f.size > 1500 * 1024) throw Error("备份文件过大");
    const backup = JSON.parse(await f.text());
    if (
      !confirm(
        "将补回备份中当前缺少的个人记录。相同编号的现有内容不会覆盖，积分以服务器为准。继续？",
      )
    )
      return;
    await s.submit("backup.restoreOwn", { backup }, "补回备份中的个人记录");
    s.notice = "恢复请求已提交";
  });
}
function invitePartner() {
  task.run(async () => {
    const x = await post<{ token: string }>("/api/invite", {});
    invite.value = location.origin + "/?invite=" + encodeURIComponent(x.token);
    section.value = "invite";
  });
}
function password() {
  task.run(async () => {
    if (s.pending.length) throw Error("请先处理本机待提交内容");
    await post("/api/password", {
      currentPassword: oldPassword.value,
      newPassword: newPassword.value,
    });
    oldPassword.value = "";
    newPassword.value = "";
    section.value = "";
    await s.logout().catch(() => s.init());
  });
}
function showHistory() {
  task.run(async () => {
    history.value = (
      await api<{ items: typeof history.value }>("/api/history")
    ).items;
    historyPreview.value = "";
    section.value = "history";
  });
}
function previewHistory(id: number) {
  task.run(async () => {
    const x = await api<{ data: unknown }>("/api/history/" + id);
    historyPreview.value = JSON.stringify(x.data, null, 2);
  });
}
function logout() {
  task.run(async () => {
    if (confirm("退出当前账号？")) {
      await clearNative(s.session!.account);
      await s.logout();
    }
  });
}
function copyInvite() {
  task.run(async () => {
    await navigator.clipboard.writeText(invite.value);
    s.notice = "邀请链接已复制";
  });
}
function exportDiagnostics() {
  task.run(() =>
    exportFile(
      "我们-故障信息.json",
      localStorage.getItem("women.v2.diagnostics") || "[]",
    ),
  );
}
</script>
<template>
  <div class="page narrow">
    <PageHead
      v-if="palette"
      title="分类与色板"
      subtitle="分类只帮助整理，不评价生活。"
      back
      back-to="/settings"
    /><PageHead
      v-else
      title="设置"
      subtitle="把我们的空间调整成舒服的样子"
      hide-settings
    />
    <p class="v2-error" role="alert">{{ task.error.value }}</p>
    <template v-if="!palette">
      <section class="card member-settings">
        <div class="member-card">
          <div class="member">
            <button
              class="member-ava-btn"
              aria-label="修改头像"
              @click="openProfile"
            >
              <MemberAvatar :member="s.member(s.slot)" :size="62" /></button
            ><button
              class="member-nm"
              aria-label="修改个人资料"
              @click="openProfile"
            >
              {{ s.member(s.slot).name }}<i>· 我</i
              ><span class="nm-edit"><Icon name="edit" :size="12" /></span>
            </button>
          </div>
          <div class="member-mid">
            <span class="h"><Icon name="heart" :size="18" /></span
            ><span class="conn">两位成员共享这个空间</span
            ><span class="code-row">成员账号已启用</span>
          </div>
          <div class="member">
            <span class="member-ava-btn"
              ><MemberAvatar :member="s.member(s.other)" :size="62" /></span
            ><span class="member-nm"
              >{{ s.member(s.other).name }}<i>· 对方</i></span
            >
          </div>
        </div>
        <div class="member-tip">点自己的头像换照片 · 点自己的名字改称呼</div>
        <button
          v-if="s.session!.canInvite"
          class="btn-blue"
          @click="invitePartner"
        >
          邀请另一位加入
        </button>
      </section>
      <div class="card" style="padding: 14px; margin-bottom: 16px">
        记录和约定可选择仅自己或双方可见；愿望等共同内容双方可见。
      </div>
      <div class="list-group">
        <RouterLink class="list-row" to="/palette"
          ><span class="list-ico"><Icon name="palette" :size="19" /></span
          ><span class="list-main"
            ><span class="list-k">分类与色板</span
            ><span class="list-d">六域 ＋ 未分类 · 顺序全局生效</span></span
          ><Icon name="right" :size="16"
        /></RouterLink>
      </div>
      <div class="list-group">
        <!-- 一行说完：同步到哪一刻，右边按一下就推一次。
             待提交内容没处理完的时候，左边这块才点得开那个面板 -->
        <div class="list-row sync-row">
          <span class="list-ico"><Icon name="sync" :size="19" /></span>
          <button
            class="list-main sync-main"
            :class="{ 'sync-main-on': needsHandling }"
            :disabled="!needsHandling"
            @click="s.pendingOpen = true"
          >
            <span class="list-k">同步状态</span
            ><span class="list-d">{{ syncHint }}</span>
          </button>
          <button class="sync-now" :disabled="task.busy.value" @click="syncNow">
            立即同步
          </button>
        </div>
        <button class="list-row" @click="section = 'backup'">
          <span class="list-ico"><Icon name="cloud" :size="19" /></span
          ><span class="list-main"
            ><span class="list-k">数据备份与恢复</span
            ><span class="list-d">导出、补回记录与查看历史</span></span
          ><Icon name="right" :size="16" /></button
        ><button class="list-row" @click="requestReminders">
          <span class="list-ico"><Icon name="clock" :size="19" /></span
          ><span class="list-main"
            ><span class="list-k">通知与提醒权限</span
            ><span class="list-d">允许手机在约定时间提醒</span></span
          ><Icon name="right" :size="16" /></button
        ><button class="list-row" @click="section = 'password'">
          <span class="list-ico"><Icon name="lock" :size="19" /></span
          ><span class="list-main"><span class="list-k">修改密码</span></span
          ><Icon name="right" :size="16" /></button
        ><button class="list-row" @click="logout">
          <span class="list-ico"><Icon name="left" :size="19" /></span
          ><span class="list-main"><span class="list-k">退出登录</span></span
          ><Icon name="right" :size="16" />
        </button>
      </div>
      <div class="page-foot">一起记录，慢慢变好。</div>
    </template>
    <template v-else
      ><div class="list-group">
        <article
          v-for="c in s.data.categories"
          :key="c.id"
          class="list-row"
          :data-category-id="c.id"
          :class="{
            'category-dragging': dragging === c.id,
            'category-drop': dropTarget === c.id && dragging !== c.id,
          }"
        >
          <button
            v-if="c.id !== 'none'"
            class="category-grip"
            :aria-label="'拖动排序：' + c.name"
            @pointerdown="dragStart($event, c.id)"
            @pointermove="dragMove"
            @pointerup="dragEnd"
            @pointercancel="
              dragging = '';
              dropTarget = '';
            "
          >
            ⠿
          </button>
          <span
            class="list-ico"
            :style="{ background: c.color + '33', color: c.color }"
            ><Icon name="palette" :size="19" /></span
          ><span class="list-main"
            ><span class="list-k">{{ c.name }}</span
            ><span class="list-d">{{ c.desc }}</span></span
          ><template v-if="c.id !== 'none'"
            ><button
              class="re"
              :aria-label="'上移分类：' + c.name"
              @click="
                task.run(async () => {
                  await s.submit(
                    'category.move',
                    { id: c.id, direction: 'up' },
                    '调整分类顺序',
                    'categories',
                  );
                })
              "
            >
              <Icon name="up" :size="15" /></button
            ><button
              class="re"
              :aria-label="'修改分类：' + c.name"
              @click="editCategory(c)"
            >
              <Icon name="edit" :size="15" /></button
            ><button
              class="re danger-text"
              :aria-label="'删除分类：' + c.name"
              @click="removeCategory(c)"
            >
              <Icon name="trash" :size="15" /></button
          ></template>
        </article>
      </div>
      <button class="add-block" @click="editCategory()">
        <Icon name="plus" :size="15" />新增分类
      </button>
      <div class="foot-line">删除分类会转入未分类，不删除记录。</div></template
    >
    <Modal
      v-if="section === 'backup'"
      title="数据备份与恢复"
      @close="section = ''"
    >
      <button class="btn-ghost" @click="exportBackup">导出账本备份</button
      ><button class="btn-ghost" @click="exportPending">
        导出本机待提交内容</button
      ><label class="btn-ghost"
        >从备份补回个人记录<input
          type="file"
          accept="application/json,.json"
          hidden
          @change="importBackup" /></label
      ><button class="btn-ghost" @click="showHistory">查看历史版本</button
      ><button class="btn-ghost" @click="exportDiagnostics">
        导出故障信息
      </button>
      <p class="v2-error">{{ task.error.value }}</p></Modal
    >
    <Modal v-if="section === 'profile'" title="个人资料" @close="section = ''"
      ><form @submit.prevent="saveProfile">
        <label class="v2-field"
          >昵称<input v-model="name" required maxlength="200" /></label
        ><label class="v2-field"
          >头像<input type="file" accept="image/*" @change="image"
        /></label>
        <p class="v2-error">{{ task.error.value }}</p>
        <button class="btn-primary">保存资料</button>
      </form></Modal
    >
    <Modal v-if="section === 'category'" title="分类设置" @close="section = ''"
      ><form @submit.prevent="saveCategory">
        <label class="v2-field"
          >分类名称<input
            v-model="catForm.name"
            required
            maxlength="20" /></label
        ><label class="v2-field"
          >说明<input v-model="catForm.desc" maxlength="200" /></label
        ><label class="v2-field"
          >颜色<input v-model="catForm.color" type="color"
        /></label>
        <p class="v2-error">{{ task.error.value }}</p>
        <button class="btn-primary">保存分类</button>
      </form></Modal
    >
    <Modal
      v-if="section === 'since'"
      title="在一起的第一天"
      @close="section = ''"
      ><form
        @submit.prevent="
          task.run(async () => {
            await s.submit(
              'couple.update',
              { id: 'couple', since },
              '在一起的起始日期',
              'settings',
              sinceVersion,
            );
            section = '';
          })
        "
      >
        <label class="v2-field"
          >哪一天<input v-model="since" type="date" required
        /></label>
        <p class="v2-error">{{ task.error.value }}</p>
        <button class="btn-primary">保存</button>
      </form></Modal
    >
    <Modal v-if="section === 'invite'" title="邀请另一位" @close="section = ''"
      ><p>链接 24 小时有效，发给你希望一起记录的人。</p>
      <label class="v2-field"
        >邀请链接<textarea v-model="invite" readonly></textarea></label
      ><button class="btn-primary" @click="copyInvite">
        复制邀请链接
      </button></Modal
    >
    <Modal v-if="section === 'password'" title="修改密码" @close="section = ''"
      ><form @submit.prevent="password">
        <label class="v2-field"
          >当前密码<input
            v-model="oldPassword"
            type="password"
            autocomplete="current-password"
            required /></label
        ><label class="v2-field"
          >新密码（至少 12 位）<input
            v-model="newPassword"
            type="password"
            autocomplete="new-password"
            minlength="12"
            required
        /></label>
        <p class="v2-error">{{ task.error.value }}</p>
        <button class="btn-primary">保存密码</button>
      </form></Modal
    >
    <Modal v-if="section === 'history'" title="历史版本" @close="section = ''"
      ><p class="muted">
        历史快照用于核对和恢复，内容按当前账号的可见权限展示。
      </p>
      <button
        v-for="h in history"
        :key="h.id"
        class="btn-ghost"
        @click="previewHistory(h.id)"
      >
        {{ new Date(h.created_at).toLocaleString() }} · 版本
        {{ h.revision }}</button
      ><template v-if="historyPreview"
        ><button
          class="btn-blue"
          @click="
            task.run(() =>
              exportFile(
                '我们-历史快照.json',
                JSON.stringify({
                  format: 'women-ledger-v2',
                  account: s.session!.account,
                  slot: s.slot,
                  data: JSON.parse(historyPreview),
                }),
              ),
            )
          "
        >
          导出所选快照
        </button></template
      ></Modal
    >
  </div>
</template>
