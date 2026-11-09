import { ref, watch } from "vue";
import type { useSpace } from "../stores/space";
let port: MessagePort | null = null;
export const wakeAlarmNative = ref(false);
const waiting = new Map<
  string,
  {
    resolve: () => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
export function connectNative(s: ReturnType<typeof useSpace>) {
  function send() {
    if (!port || !s.session || s.pending.length) return;
    if (wakeAlarmNative.value && !s.needsLogin)
      port.postMessage(JSON.stringify({ type: "wake-alarm-sync" }));
    port.postMessage(
      JSON.stringify({
        type: "sync",
        account: s.session.account,
        reminders: s.data.goals
          .filter(
            (g) =>
              g.memberId === s.slot &&
              g.status === "active" &&
              /^([01]\d|2[0-3]):[0-5]\d$/.test(g.reminderTime || ""),
          )
          .map((g) => ({ id: g.id, name: g.name, time: g.reminderTime })),
      }),
    );
  }
  window.addEventListener("message", (event) => {
    if (
      event.data !== "women-reminders-v1" ||
      !event.ports?.[0] ||
      (event.origin && event.origin !== location.origin)
    )
      return;
    port?.close();
    port = event.ports[0];
    port.onmessage = (e) => {
      try {
        const result = JSON.parse(e.data),
          entry = waiting.get(result.requestId);
        if (result.wakeAlarms === true) {
          wakeAlarmNative.value = true;
          send();
        }
        if (entry) {
          clearTimeout(entry.timer);
          waiting.delete(result.requestId);
          if (result.ok === false)
            entry.reject(Error(result.error || "文件未保存"));
          else entry.resolve();
        }
      } catch {}
    };
    send();
  });
  watch(() => [s.data.goals, s.session, s.pending.length], send, {
    deep: true,
  });
}
export function requestReminders() {
  port?.postMessage(JSON.stringify({ type: "request-permission" }));
}
export async function clearNative(account: string) {
  port?.postMessage(JSON.stringify({ type: "clear", account }));
}
export async function exportFile(
  filename: string,
  text: string,
  mime = "application/json",
) {
  if (port) {
    const requestId = crypto.randomUUID();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        waiting.delete(requestId);
        reject(Error("保存文件尚未完成，原始内容仍保留在本机"));
      }, 120000);
      waiting.set(requestId, { resolve, reject, timer });
      port!.postMessage(
        JSON.stringify({ type: "export-start", requestId, filename, mime }),
      );
      for (let i = 0; i < text.length; i += 1000)
        port!.postMessage(
          JSON.stringify({
            type: "export-chunk",
            requestId,
            text: text.slice(i, i + 1000),
          }),
        );
      port!.postMessage(JSON.stringify({ type: "export-end", requestId }));
    });
    return;
  }
  if (/; wv\)/.test(navigator.userAgent))
    throw Error("App 文件保存通道尚未就绪，请稍后重试或更新 App");
  const file = new File([text], filename, { type: mime });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: filename });
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
