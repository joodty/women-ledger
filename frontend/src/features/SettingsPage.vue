<script setup lang="ts">
import { ref } from "vue";
import { useSpace } from "../stores/space";
import { api, post } from "../lib/api";
import { exportFile, requestReminders, clearNative } from "../lib/native";
import { useTask } from "../lib/task";
import PageHead from "../components/PageHead.vue";
import Modal from "../components/Modal.vue";
import type { Category } from "../models";
const sinceVersion=ref<number>();
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
function openProfile() {
  name.value = s.member(s.slot).name;
  avatar.value = s.member(s.slot).avatar || null;
  profileVersion.value = s.version("members", s.slot);
  section.value = "profile";
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
  <PageHead title="设置" subtitle="把空间调整成你们习惯的样子。" back />
  <p class="v2-error" role="alert">{{ task.error.value }}</p>
  <section class="card">
    <div class="card-title">个人资料</div>
    <div class="v2-head">
      <span class="v2-avatar"
        ><img
          v-if="s.member(s.slot).avatar"
          :src="s.member(s.slot).avatar!"
          alt=""
        /><template v-else>{{ s.member(s.slot).name[0] }}</template></span
      >
      <div style="flex: 1">
        {{ s.member(s.slot).name }}
        <div class="muted" style="font-size: 12px">
          账号 {{ s.session!.account }}
        </div>
      </div>
      <button class="card-link" @click="openProfile">修改</button>
    </div>
    <p class="muted">另一位：{{ s.member(s.other).name }}</p>
    <button v-if="s.session!.canInvite" class="btn-blue" @click="invitePartner">
      邀请另一位加入
    </button>
  </section>
  <section class="card">
    <div class="card-title">我们的空间</div>
    <p>在一起的第一天：{{ s.data.couple.since }}</p>
    <button
      class="card-link"
      @click="
        since = s.data.couple.since; sinceVersion=s.version('settings','couple');
        section = 'since';
      "
    >
      修改起始日期
    </button>
    <div class="v2-actions">
      <RouterLink class="btn-ghost" to="/goals">管理约定</RouterLink
      ><RouterLink class="btn-ghost" to="/points">管理愿望与奖励</RouterLink>
    </div>
  </section>
  <section class="card">
    <div class="card-title">
      记录分类<button class="card-link" @click="editCategory()">新增</button>
    </div>
    <div v-for="c in s.data.categories" :key="c.id" class="v2-item">
      <span class="v2-dot" :style="{ background: c.color }" />
      <div class="v2-item-main">
        <strong>{{ c.name }}</strong>
        <p>{{ c.desc }}</p>
      </div>
      <template v-if="c.id !== 'none'"
        ><button
          class="card-link"
          @click="
            task.run(() =>
              s
                .submit(
                  'category.move',
                  { id: c.id, direction: 'up' },
                  '调整分类顺序',
                  'categories',
                )
                .then(() => {}),
            )
          "
        >
          上移</button
        ><button class="card-link" @click="editCategory(c)">
          修改
        </button></template
      >
    </div>
  </section>
  <section class="card">
    <div class="card-title">数据与账号</div>
    <button class="btn-ghost" @click="exportBackup">导出账本备份</button
    ><button class="btn-ghost" @click="exportPending">导出本机待提交内容</button
    ><label class="btn-ghost"
      >从备份补回个人记录<input
        type="file"
        accept="application/json,.json"
        hidden
        @change="importBackup" /></label
    ><button class="btn-ghost" @click="showHistory">查看历史版本</button
    ><button class="btn-ghost" @click="exportDiagnostics">导出故障信息</button
    ><button class="btn-ghost" @click="requestReminders">通知与提醒权限</button
    ><button class="btn-ghost" @click="section = 'password'">修改密码</button
    ><button class="btn-ghost" @click="logout">退出登录</button>
  </section>
  <p class="foot-line">网页版本 2.0.0 · 未提交内容按账号保存在本机</p>
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
        >分类名称<input v-model="catForm.name" required maxlength="20" /></label
      ><label class="v2-field"
        >说明<input v-model="catForm.desc" maxlength="200" /></label
      ><label class="v2-field"
        >颜色<input v-model="catForm.color" type="color"
      /></label>
      <p class="v2-error">{{ task.error.value }}</p>
      <button class="btn-primary">保存分类</button>
    </form></Modal
  >
  <Modal v-if="section === 'since'" title="在一起的第一天" @close="section = ''"
    ><form
      @submit.prevent="
        task.run(async () => {
          await s.submit('couple.update', { id: 'couple', since }, '在一起的起始日期', 'settings', sinceVersion);
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
    ><p class="muted">历史快照用于核对和恢复，内容按当前账号的可见权限展示。</p>
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
</template>
