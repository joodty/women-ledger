import { diagnostic } from "../../lib/diagnostics";
import { ref, onBeforeUnmount } from "vue";
import { api, post } from "../../lib/api";
function encode(samples: Float32Array) {
  const b = new ArrayBuffer(44 + samples.length * 2),
    v = new DataView(b);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, b.byteLength - 8, true);
  str(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true);
  v.setUint32(28, 32000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true);
  }
  return new Blob([b], { type: "audio/wav" });
}
async function wave(blob: Blob, max: number) {
  const ac = new AudioContext();
  try {
    const decoded = await ac.decodeAudioData(await blob.arrayBuffer()),
      n = Math.min(Math.floor(decoded.duration * 16000), max * 16000);
    if (n < 1) throw Error("没有录到声音");
    const off = new OfflineAudioContext(1, n, 16000),
      source = off.createBufferSource();
    source.buffer = decoded;
    source.connect(off.destination);
    source.start();
    return encode((await off.startRendering()).getChannelData(0));
  } finally {
    await ac.close();
  }
}
function base64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(Error("读取录音失败"));
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.readAsDataURL(blob);
  });
}
export function useSpeech(onText: (text: string) => void) {
  const phase = ref<"idle" | "preparing" | "recording" | "transcribing">(
      "idle",
    ),
    seconds = ref(0),
    max = ref(120),
    error = ref("");
  let recorder: MediaRecorder | null = null,
    stream: MediaStream | null = null,
    timer: ReturnType<typeof setInterval> | undefined,
    stopper: ReturnType<typeof setTimeout> | undefined,
    cancelled = false;
  const release = () => {
    if (timer) clearInterval(timer);
    if (stopper) clearTimeout(stopper);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  };
  async function toggle() {
    if (phase.value === "recording") {
      recorder?.stop();
      return;
    }
    if (phase.value !== "idle") return;
    phase.value = "preparing";
    error.value = "";
    cancelled = false;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw Error("当前设备不支持录音，请更新 App 或使用浏览器");
      const config = await api<{ maxSeconds: number }>("/api/speech/config");
      max.value = Math.max(1, Math.min(180, Math.floor(config.maxSeconds)));
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (cancelled) {
        release();
        return;
      }
      const chunks: BlobPart[] = [];
      const rec = new MediaRecorder(stream);
      recorder = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onerror = () => {
        cancelled = true;
        release();
        phase.value = "idle";
        error.value = "录音设备启动失败，请检查 App 麦克风权限和系统麦克风开关";
      };
      rec.onstop = async () => {
        release();
        if (cancelled) return;
        phase.value = "transcribing";
        try {
          const blob = await wave(
            new Blob(chunks, { type: rec.mimeType }),
            max.value,
          );
          const result = await api<{ text: string }>("/api/speech/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audioBase64: await base64(blob) }),
            signal: AbortSignal.timeout(120000),
          });
          if (!cancelled) {
            if (result.text.trim()) onText(result.text.trim());
            else error.value = "没有识别到文字，请再试一次";
          }
        } catch (e) {
          if (!cancelled)
            error.value = e instanceof Error ? e.message : "语音识别失败";
        } finally {
          if (!cancelled) phase.value = "idle";
        }
      };
      rec.start(250);
      phase.value = "recording";
      seconds.value = 0;
      const start = Date.now();
      timer = setInterval(
        () => (seconds.value = Math.floor((Date.now() - start) / 1000)),
        500,
      );
      stopper = setTimeout(() => {
        if (rec.state === "recording") rec.stop();
      }, max.value * 1000);
    } catch (e) {
      release();
      phase.value = "idle";
      const err = e as Error;
      diagnostic("microphone", err.name);
      error.value = ["NotAllowedError", "SecurityError"].includes(err.name)
        ? "请在系统设置中允许 App 使用麦克风"
        : err.name === "NotReadableError"
          ? "手机未能启动麦克风，请检查系统麦克风开关和 App 权限"
          : err.message;
    }
  }
  function cancel() {
    cancelled = true;
    if (recorder?.state === "recording") recorder.stop();
    release();
    phase.value = "idle";
  }
  onBeforeUnmount(cancel);
  return { phase, seconds, max, error, toggle, cancel };
}
