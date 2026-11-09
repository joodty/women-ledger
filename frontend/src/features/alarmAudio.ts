import { api } from "../lib/api";

export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const RATE = 16000;
export function audioUrl(id: string) {
  return "/api/v2/wake-alarms/audio/" + encodeURIComponent(id);
}

export async function decodeSong(file: File) {
  if (!file.size || file.size > MAX_SOURCE_BYTES)
    throw Error("请选择 20 MB 以内的音频文件");
  const context = new AudioContext({ sampleRate: RATE });
  try {
    return await context.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw Error("这段音频无法读取，请试试 MP3、M4A 或 WAV");
  } finally {
    await context.close();
  }
}

export async function makeClip(song: AudioBuffer, start: number, length: number) {
  const count = Math.floor(Math.min(length, song.duration - start) * RATE);
  if (!Number.isFinite(start) || start < 0 || !Number.isFinite(count) ||
      count < RATE || count > 60 * RATE)
    throw Error("请选择歌曲中 1 到 60 秒的片段");
  const render = new OfflineAudioContext(1, count, RATE);
  const source = render.createBufferSource();
  source.buffer = song;
  source.connect(render.destination);
  source.start(0, start);
  const pcm = (await render.startRendering()).getChannelData(0);
  const wav = new ArrayBuffer(44 + pcm.length);
  const header = new DataView(wav);
  for (const [offset, label] of [[0, "RIFF"], [8, "WAVEfmt "], [36, "data"]] as const)
    for (let i = 0; i < label.length; i++) header.setUint8(offset + i, label.charCodeAt(i));
  header.setUint32(4, wav.byteLength - 8, true);
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true);
  header.setUint16(22, 1, true);
  header.setUint32(24, RATE, true);
  header.setUint32(28, RATE, true);
  header.setUint16(32, 1, true);
  header.setUint16(34, 8, true);
  header.setUint32(40, pcm.length, true);
  const samples = new Uint8Array(wav, 44);
  for (let i = 0; i < pcm.length; i++) {
    const fade = Math.min(1, i / 160, (pcm.length - 1 - i) / 320);
    samples[i] = 128 + Math.round(127 * Math.max(-1, Math.min(1, pcm[i])) * fade);
  }
  return new Blob([wav], { type: "audio/wav" });
}

export function uploadClip(clip: Blob) {
  return api<{ clipId: string }>("/api/v2/wake-alarms/audio", {
    method: "POST", body: clip, headers: { "Content-Type": "audio/wav" },
  });
}
