import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { api, post, ApiError } from "../lib/api";
import type {
  Bootstrap,
  Session,
  SpaceData,
  Pending,
  Command,
  Slot,
  Goal,
  Redemption,
} from "../models";
import { today, weekStart } from "../lib/date";
const empty: SpaceData = {
  version: 4,
  couple: { since: today(), shareOpen: true },
  members: [],
  categories: [],
  entries: [],
  goals: [],
  wishlist: [],
  story_entries: [],
  milestones: [],
  points_ledger: [],
  redemptions: [],
  weekly_settlements: [],
  sparks: [],
};
export const useSpace = defineStore("space", () => {
  const data = ref<SpaceData>(structuredClone(empty)),
    session = ref<Session | null>(null),
    versions = ref<Bootstrap["versions"]>({}),
    alarmReceipts = ref<NonNullable<Bootstrap["alarmReceipts"]>>({}),
    revision = ref(0),
    ready = ref(false),
    needsLogin = ref(false),
    offline = ref(false),
    sending = ref(false),
    pending = ref<Pending[]>([]),
    notice = ref(""),
    fatal = ref(""),
    /* 最后一次和服务端对上话的时间。顶栏拆掉之后，「同步到哪一刻了」
       这件事只有设置页那一行会说，所以每次 accept() 都要记一笔 */
    lastSync = ref(0);
  let initialized = false;
  const slot = computed<Slot>(() => session.value?.slot || "me"),
    other = computed<Slot>(() => (slot.value === "me" ? "him" : "me"));
  const key = () => `women.v2.pending.${session.value!.account}`;
  function persist() {
    try {
      localStorage.setItem(key(), JSON.stringify(pending.value));
    } catch {
      throw Error("本机存储空间不足，请先导出待提交内容");
    }
  }
  function accept(b: Bootstrap) {
    data.value = b.data;
    session.value = b.session;
    versions.value = b.versions;
    alarmReceipts.value = b.alarmReceipts || {};
    revision.value = b.revision;
    ready.value = true;
    offline.value = false;
    needsLogin.value = false;
    lastSync.value = Date.now();
  }
  function version(collection: string, id: string) {
    return versions.value[collection]?.[id];
  }
  async function refresh() {
    if (sending.value) return;
    try {
      accept(await api<Bootstrap>("/api/v2/bootstrap"));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) needsLogin.value = true;
      else offline.value = true;
    }
  }
  async function init() {
    try {
      accept(await api<Bootstrap>("/api/v2/bootstrap"));
      let saved: Pending[] = [];
      try {
        saved = JSON.parse(localStorage.getItem(key()) || "[]");
      } catch {}
      pending.value = saved.filter(
        (x) =>
          x.account === session.value!.account &&
          x.spaceId === session.value!.spaceId,
      );
      recoveries.value = findLegacy();
      flush();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) needsLogin.value = true;
      else fatal.value = "暂时无法连接网站，请稍后重试。";
    }
    if (!initialized) {
      initialized = true;
      setInterval(() => {
        flush();
        if (!pending.value.length) refresh();
      }, 15000);
      window.addEventListener("online", () => {
        flush();
        refresh();
      });
    }
  }
  async function login(
    user: string,
    password: string,
    register = false,
    invitation = "",
  ) {
    if (register)
      await post("/api/register", { username: user, password, invitation });
    await post("/api/login", { user, password });
    await init();
  }
  async function logout() {
    if (pending.value.length) throw Error("还有本机待提交内容，请先处理或导出");
    await post("/api/logout", {});
    data.value = structuredClone(empty);
    alarmReceipts.value = {};
    ready.value = false;
    session.value = null;
    needsLogin.value = true;
  }
  async function submit(
    type: string,
    payload: Record<string, unknown>,
    label: string,
    collection?: string,
    expectedVersion?: number,
  ) {
    if (!session.value) throw Error("请先登录");
    const command: Command = { id: crypto.randomUUID(), type, payload };
    if (collection && typeof payload.id === "string")
      command.expectedVersion =
        expectedVersion ?? version(collection, payload.id);
    const item: Pending = {
      account: session.value.account,
      spaceId: session.value.spaceId,
      command,
      label,
      status: "waiting",
    };
    pending.value.push(item);
    try {
      persist();
    } catch (e) {
      pending.value.pop();
      throw e;
    }
    await flush();
    notice.value = pending.value.some((x) => x.command.id === command.id)
      ? "已保存在本机，等待提交"
      : "已保存";
    return command.id;
  }
  async function flush() {
    if (sending.value || !session.value) return;
    sending.value = true;
    try {
      while (true) {
        const item = pending.value.find((x) => x.status === "waiting");
        if (!item) break;
        try {
          const result = await post<Bootstrap>(
            "/api/v2/commands",
            item.command,
          );
          accept(result);
          pending.value = pending.value.filter(
            (x) => x.command.id !== item.command.id,
          );
          persist();
        } catch (e) {
          const err = e as ApiError;
          if (err.status === 0 || err.status >= 500) {
            offline.value = true;
            break;
          }
          if (err.status === 401) {
            needsLogin.value = true;
            break;
          }
          item.status = err.status === 409 ? "conflict" : "error";
          item.message = err.message;
          item.details = err.details as Pending["details"];
          persist();
        }
      }
    } finally {
      sending.value = false;
    }
  }
  async function retry(item: Pending) {
    if (item.status === "conflict" && item.details)
      throw Error("请先核对双方版本，再决定是否使用这次修改");
    item.status = "waiting";
    persist();
    await flush();
  }
  async function resolve(item: Pending, useLocal: boolean) {
    if (!useLocal) {
      pending.value = pending.value.filter(
        (x) => x.command.id !== item.command.id,
      );
      persist();
      await refresh();
      return;
    }
    if (!item.details) throw Error("请先重新检查这条修改");
    item.command = {
      ...item.command,
      id: crypto.randomUUID(),
      expectedVersion: item.details.version,
    };
    item.status = "waiting";
    persist();
    await flush();
  }
  function member(id: Slot) {
    return (
      data.value.members.find((m) => m.id === id) || { id, name: "待加入" }
    );
  }
  function balance(id: Slot, wallet: "mine" | "ours" = "mine") {
    return (
      data.value.points_ledger
        .filter((p) => p.memberId === id && (p.wallet || "mine") === wallet)
        .reduce((n, p) => n + p.points, 0) -
      data.value.redemptions
        .filter(
          (r) =>
            !["pending", "cancelled", "reversed"].includes(r.status || "") &&
            (r.wallet || "mine") === wallet,
        )
        .reduce((n, r) => n + (id === "me" ? r.fromMe || 0 : r.fromHim || 0), 0)
    );
  }
  /* 双人池：一起做的事赚到的分，全部流进这里，只有一个数，不分你我。
     历史里「各出一半」的兑换拆成了 fromMe / fromHim，两半相加就是它从池子里扣掉的总额。 */
  function poolOurs() {
    const fromOurs = (r: Redemption) =>
      Number.isFinite(r.fromOurs) ? r.fromOurs! : (r.fromMe || 0) + (r.fromHim || 0);
    return (
      data.value.points_ledger
        .filter((p) => (p.wallet || "mine") === "ours")
        .reduce((n, p) => n + p.points, 0) -
      data.value.redemptions
        .filter(
          (r) =>
            !["pending", "cancelled", "reversed"].includes(r.status || "") &&
            (r.wallet || "mine") === "ours",
        )
        .reduce((n, r) => n + fromOurs(r), 0)
    );
  }
  /* 谁的进度：看自己用 progress()，看对方用 progressOf()。
     两个人的进度必须分开数，否则「各自做到的」会把对方算进自己身上。 */
  function progressOf(g: Goal, memberId: Slot) {
    return data.value.entries.filter(
      (e) =>
        e.memberId === memberId &&
        e.goalId === g.id &&
        (g.kind === "once" || (e.date >= weekStart() && e.date <= today())),
    ).length;
  }
  const progress = (g: Goal) => progressOf(g, slot.value);
  /* 这条约定本周到到量了吗：一次就完看有没有做过一次，每周要做看本周次数够不够 */
  const reached = (g: Goal, memberId: Slot = slot.value) =>
    progressOf(g, memberId) >= (g.kind === "once" ? 1 : g.timesPerWeek || 1);
  async function redeem(id: string) {
    if (pending.value.length) throw Error("请先提交本机修改");
    const k = `women.v2.redeem.${session.value!.account}.wish.${id}`;
    const requestId = localStorage.getItem(k) || crypto.randomUUID();
    localStorage.setItem(k, requestId);
    try {
      await post("/api/redeem", { kind: "wish", id, requestId });
      localStorage.removeItem(k);
      await refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500)
        localStorage.removeItem(k);
      throw e;
    }
  }
  const recoveries = ref<{ key: string; value: string }[]>([]);
  /* 待处理面板原来由顶栏那个「查看待处理」开关。顶栏整行去掉之后，
     入口挪到设置页的「同步状态」，两边共用这一个开关 */
  const pendingOpen = ref(false);
  function findLegacy() {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (
        !k.startsWith("women.pending.v1.") ||
        !(
          k.endsWith("." + session.value!.account) ||
          (session.value!.legacySpace && k.endsWith("." + session.value!.slot))
        )
      )
        continue;
      const value = localStorage.getItem(k)!;
      try {
        const old = JSON.parse(value);
        if (old.user === session.value!.slot && old.data)
          out.push({ key: k, value });
      } catch {}
    }
    return out;
  }
  function canonical(old: SpaceData) {
    const d = structuredClone(old);
    if (slot.value !== "him") return d;
    const swap = (v: string) => (v === "me" ? "him" : v === "him" ? "me" : v);
    for (const m of d.members) m.id = swap(m.id) as Slot;
    for (const list of [
      d.entries,
      d.goals,
      d.points_ledger,
      d.story_entries,
      d.redemptions,
    ])
      for (const x of list) x.memberId = swap(x.memberId) as Slot;
    for (const w of d.wishlist)
      if (w.scope) w.scope = swap(w.scope) as Slot | "both";
    for (const w of d.wishlist)
      if (w.executor) w.executor = swap(w.executor) as Slot | "both";
    for (const r of d.redemptions)
      [r.fromMe, r.fromHim] = [r.fromHim, r.fromMe];
    return d;
  }
  async function restoreLegacy(item: { key: string; value: string }) {
    const old = JSON.parse(item.value);
    await post("/api/state", {
      revision: old.revision,
      data: canonical(old.data),
    });
    if (localStorage.getItem(item.key) === item.value)
      localStorage.removeItem(item.key);
    recoveries.value = findLegacy();
    await refresh();
  }
  return {
    data,
    session,
    versions,
    alarmReceipts,
    revision,
    ready,
    needsLogin,
    offline,
    sending,
    pending,
    notice,
    fatal,
    slot,
    other,
    recoveries,
    pendingOpen,
    lastSync,
    init,
    login,
    logout,
    refresh,
    submit,
    flush,
    retry,
    resolve,
    member,
    balance,
    poolOurs,
    progress,
    progressOf,
    reached,
    redeem,
    version,
    restoreLegacy,
  };
});
