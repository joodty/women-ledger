"use strict";
module.exports = (() => {
  const fs = require("fs"),
    crypto = require("crypto"),
    path = require("path");
  const base = process.env.WOMEN_DSH_BASE || "https://dsh.yidiangames.cn";
  const cookieFile =
    process.env.WOMEN_DSH_COOKIE_FILE ||
    path.join(
      process.env.WOMEN_DATA_DIR ||
        path.join(process.env.WOMEN_APP_ROOT, "data"),
      "dsh-speech-cookie.txt",
    );
  let busy = false;
  async function rpc(method, args, timeout = 20000) {
    const cookie = fs.readFileSync(cookieFile, "utf8").trim();
    if (!/^dsh_[a-z_]+=[A-Za-z0-9._~-]+$/.test(cookie))
      throw Error("语音服务尚未配置");
    const rpcId = crypto.randomUUID();
    const r = await fetch(base + "/remote/api/" + method, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        type: "client-request",
        rpcId,
        method,
        payload: { args },
      }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!r.ok) throw Error("语音服务暂不可用");
    const data = await r.json();
    if (data.rpcId !== rpcId || !data.result?.ok)
      throw Error("语音服务暂不可用");
    return data.result.value;
  }
  async function config() {
    const c = await rpc("speech/catalog", {});
    const seconds = Math.min(
      180,
      Math.floor(Number(c.maxDurationSeconds)),
      Math.floor((Number(c.maxAudioBytes) - 44) / 32000),
    );
    if (!Number.isFinite(seconds) || seconds < 1)
      throw Error("语音服务限制无效");
    return {
      maxSeconds: seconds,
      maxBytes: Math.min(Number(c.maxAudioBytes), 44 + seconds * 32000),
    };
  }
  async function transcribe(audio) {
    if (busy) {
      const e = Error("语音服务正忙，请稍后再试");
      e.status = 429;
      throw e;
    }
    busy = true;
    try {
      const limits = await config();
      if (
        typeof audio !== "string" ||
        audio.length > Math.ceil(limits.maxBytes / 3) * 4 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(audio)
      )
        throw Error("录音过长或格式无效");
      const b = Buffer.from(audio, "base64");
      if (
        b.length < 44 ||
        b.length > limits.maxBytes ||
        b.toString("ascii", 0, 4) !== "RIFF" ||
        b.toString("ascii", 8, 12) !== "WAVE" ||
        b.toString("ascii", 12, 16) !== "fmt " ||
        b.readUInt16LE(20) !== 1 ||
        b.readUInt16LE(22) !== 1 ||
        b.readUInt32LE(24) !== 16000 ||
        b.readUInt16LE(34) !== 16 ||
        b.toString("ascii", 36, 40) !== "data" ||
        b.readUInt32LE(40) !== b.length - 44
      )
        throw Error("录音格式无效");
      const value = await rpc(
        "speech/transcribe",
        { request: { audioBase64: audio, language: "zh" } },
        120000,
      );
      if (typeof value?.text !== "string") throw Error("识别结果无效");
      return { text: value.text };
    } finally {
      busy = false;
    }
  }
  return { config, transcribe };
})();
