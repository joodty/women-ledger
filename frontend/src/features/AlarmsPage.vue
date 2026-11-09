<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { useSpace } from "../stores/space";
import { useTask } from "../lib/task";
import { requestReminders, wakeAlarmNative } from "../lib/native";
import { shift, today } from "../lib/date";
import PageHead from "../components/PageHead.vue";
import Modal from "../components/Modal.vue";
import Icon from "../components/Icon.vue";
import type { WakeAlarm } from "../models";
import gentle from "../../../android/res/raw/wake_gentle.wav?url";
import bright from "../../../android/res/raw/wake_bright.wav?url";
import rising from "../../../android/res/raw/wake_rising.wav?url";

const s = useSpace(), task = useTask();
const tones = [
  { id: "gentle", label: "轻柔", url: gentle },
  { id: "bright", label: "清脆", url: bright },
  { id: "rising", label: "渐强", url: rising },
] as const;
const weekdays = ["一", "二", "三", "四", "五", "六", "日"];
const rows = computed(() => s.data.wake_alarms || []);
const recipient = computed(() => s.member(s.other).name);
const editing = ref(false);
const existing = ref<string>();
const draftId = ref("");
const version = ref<number>();
const repeat = ref(false);
function defaults() {
  return { date: shift(today(), 1), time: "07:30", days: [] as number[],
    tone: "gentle" as WakeAlarm["tone"], note: "" };
}
const form = ref(defaults());
let player: HTMLAudioElement | undefined;
function close() {
  player?.pause();
  editing.value = false;
}
onBeforeUnmount(() => player?.pause());

function edit(alarm?: WakeAlarm) {
  existing.value = alarm?.id;
  draftId.value = alarm?.id || crypto.randomUUID();
  version.value = alarm ? s.version("wake_alarms", alarm.id) : undefined;
  repeat.value = !!alarm?.days.length;
  form.value = alarm ? {
    date: alarm.date || shift(today(), 1), time: alarm.time, days: [...alarm.days],
    tone: alarm.tone, note: alarm.note,
  } : defaults();
  task.error.value = "";
  editing.value = true;
}

function dateTime(at: number) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai",
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
}
function state(alarm: WakeAlarm) {
  const receipt = s.alarmReceipts[alarm.id];
  const applied = receipt && receipt.version === s.version("wake_alarms", alarm.id);
  if (!applied) {
    const pending = alarm.enabled ? "待手机同步" : "暂停待同步";
    return receipt?.status === "scheduled" && receipt.nextAt > Date.now()
      ? pending + " · 旧时间 " + dateTime(receipt.nextAt) + " 仍可能响" : pending;
  }
  if (receipt.status === "scheduled")
    return receipt.nextAt > Date.now() ? "手机已设好 · " + dateTime(receipt.nextAt) : "上次设定时间已过";
  if (receipt.status === "permission") return "接收手机需开启闹钟和通知权限";
  if (receipt.status === "error") return "手机暂未设好，等待重试";
  return receipt.status === "expired" ? "本次时间已过" : "已暂停";
}

async function commit(type: string, payload: Record<string, unknown>, expected?: number) {
  if (s.pending.some((x) => x.command.type.startsWith("alarm.") && x.command.payload.id === payload.id))
    throw Error("这条闹钟还有待处理的修改");
  const id = await s.submit(type, payload, "叫醒闹钟", type === "alarm.create" ? undefined : "wake_alarms", expected);
  const pending = s.pending.find((x) => x.command.id === id);
  if (pending && pending.status !== "waiting") throw Error(pending.message || "请处理待提交的修改");
  return !pending;
}
function save() {
  task.run(async () => {
    if (repeat.value && !form.value.days.length) throw Error("请选择至少一个星期");
    if (!repeat.value && Date.parse(form.value.date + "T" + form.value.time + ":00+08:00") <= Date.now())
      throw Error("请选择将来的时间");
    const saved = await commit(existing.value ? "alarm.update" : "alarm.create",
      { ...form.value, id: draftId.value, days: repeat.value ? form.value.days : [] },
      version.value);
    close();
    if (saved) s.notice = "已保存，等待对方手机同步";
  });
}
function stop(alarm: WakeAlarm) {
  task.run(async () => {
    await commit("alarm.pause", { id: alarm.id }, s.version("wake_alarms", alarm.id));
  });
}
function remove(alarm: WakeAlarm) {
  if (confirm("移除这个已暂停的闹钟？"))
    task.run(async () => {
      await commit("alarm.delete", { id: alarm.id }, s.version("wake_alarms", alarm.id));
    });
}
function removable(alarm: WakeAlarm) {
  const receipt = s.alarmReceipts[alarm.id];
  return receipt?.version === s.version("wake_alarms", alarm.id) &&
    ["paused", "expired"].includes(receipt?.status || "");
}
async function preview() {
  player?.pause();
  player = new Audio(tones.find((t) => t.id === form.value.tone)!.url);
  try { await player.play(); }
  catch { task.error.value = "暂时无法试听铃声"; }
}
</script>
<template>
  <div class="page">
    <div class="sub-wrap">
      <PageHead title="叫醒闹钟" subtitle="把一句早安留到响铃时。" back back-to="/together" />
      <button v-if="!s.session?.canInvite" class="add-block" @click="edit()">
        <Icon name="clock" :size="17" /> 给{{ recipient }}设闹钟
      </button>
      <section class="card">
        <div class="card-title">我们的闹钟</div>
        <div v-if="!rows.length" class="empty">还没有叫醒闹钟。</div>
        <article v-for="alarm in rows" :key="alarm.id" class="prog-row">
          <span class="prog-ico"><Icon name="clock" :size="17" /></span>
          <span class="prog-main">
            <span class="prog-name">{{ alarm.time }} · {{ alarm.memberId === s.slot ? "叫醒" + recipient : "叫醒我" }}</span>
            <span class="prog-dots"><span class="txt">{{ alarm.days.length ? "每周 " + alarm.days.map(d => weekdays[d - 1]).join("、") : alarm.date }} · 北京时间</span></span>
            <span class="prog-dots"><span class="txt">{{ state(alarm) }}</span></span>
          </span>
          <button v-if="alarm.memberId === s.slot" class="card-link" :disabled="task.busy.value" @click="edit(alarm)">修改</button>
          <button v-if="alarm.enabled && !removable(alarm)" class="card-link" :disabled="task.busy.value" @click="stop(alarm)">暂停</button>
          <button v-if="removable(alarm)" class="card-link danger-text" :disabled="task.busy.value" @click="remove(alarm)">移除</button>
        </article>
      </section>
      <div v-if="!editing" class="v2-error" role="alert">{{ task.error.value }}</div>
      <p v-if="s.session?.canInvite" class="muted">绑定两人空间后可以为对方设闹钟。</p>
      <button v-if="wakeAlarmNative" class="btn-ghost" @click="requestReminders">检查本机响铃权限</button>
      <p v-else class="muted">响铃需要在接收手机上安装新版安卓 App。</p>
      <p class="muted">手机后台同步可能延迟。打开 App 可以尽快同步。</p>
      <Modal v-if="editing" :title="existing ? '修改叫醒闹钟' : '新建叫醒闹钟'" @close="close">
        <form @submit.prevent="save">
          <label class="field"><span class="field-k">时间（北京时间）</span>
            <input v-model="form.time" class="input-box" type="time" required />
          </label>
          <label class="field"><span class="field-k">重复</span>
            <select v-model="repeat" class="input-box">
              <option :value="false">仅一次</option><option :value="true">每周重复</option>
            </select>
          </label>
          <label v-if="!repeat" class="field"><span class="field-k">日期</span>
            <input v-model="form.date" class="input-box" type="date" :min="today()" required />
          </label>
          <fieldset v-else class="field">
            <legend class="field-k">星期</legend>
            <div class="wake-days">
              <label v-for="(day, index) in weekdays" :key="day">
                <input v-model="form.days" type="checkbox" :value="index + 1" /> {{ day }}
              </label>
            </div>
          </fieldset>
          <label class="field"><span class="field-k">铃声</span>
            <select v-model="form.tone" class="input-box" @change="player?.pause()">
              <option v-for="tone in tones" :key="tone.id" :value="tone.id">{{ tone.label }}</option>
            </select>
          </label>
          <button type="button" class="btn-ghost" @click="preview">试听铃声</button>
          <label class="field"><span class="field-k">早安留言（可选，响铃时显示）</span>
            <input v-model="form.note" class="input-box" maxlength="200" placeholder="早呀，今天也要开心" />
          </label>
          <p class="v2-error" role="alert">{{ task.error.value }}</p>
          <button class="btn-primary" :disabled="task.busy.value">保存闹钟</button>
        </form>
      </Modal>
    </div>
  </div>
</template>
<style scoped>
fieldset.field { min-width: 0; border: 0; padding: 0; }
.wake-days { display: flex; flex-wrap: wrap; gap: 8px 14px; }
.wake-days label { padding: 6px 0; }
</style>
