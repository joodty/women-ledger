"use strict";
const { db } = require("./database.cjs");
const { createHash } = require("node:crypto");
const { fail } = require("./errors.cjs");

const MAX_BYTES = 960044;
const clipId = /^[a-f0-9]{64}$/;
db.exec(`CREATE TABLE IF NOT EXISTS wake_alarm_audio (
  space_id TEXT NOT NULL, owner TEXT NOT NULL, id TEXT NOT NULL,
  wav BLOB NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY(space_id, owner, id)
)`);

function validWav(wav) {
  return wav.length > 44 && wav.length <= MAX_BYTES &&
    wav.toString("ascii", 0, 4) === "RIFF" &&
    wav.readUInt32LE(4) === wav.length - 8 &&
    wav.toString("ascii", 8, 16) === "WAVEfmt " &&
    wav.readUInt32LE(16) === 16 && wav.readUInt16LE(20) === 1 &&
    wav.readUInt16LE(22) === 1 && wav.readUInt32LE(24) === 16000 &&
    wav.readUInt32LE(28) === 16000 && wav.readUInt16LE(32) === 1 &&
    wav.readUInt16LE(34) === 8 && wav.toString("ascii", 36, 40) === "data" &&
    wav.readUInt32LE(40) === wav.length - 44;
}

function owns(s, id) {
  return typeof id === "string" && clipId.test(id) && !!db.prepare(
    "SELECT 1 FROM wake_alarm_audio WHERE space_id=? AND owner=? AND id=?"
  ).get(s.space_id, s.slot, id);
}

function save(s, wav) {
  fail(validWav(wav), "validation", "铃声格式无效或超过 60 秒");
  const id = createHash("sha256").update(wav).digest("hex");
  const now = Date.now();
  db.prepare(`DELETE FROM wake_alarm_audio AS a WHERE space_id=? AND owner=?
    AND created_at<? AND NOT EXISTS (
      SELECT 1 FROM entity_rows e WHERE e.space_id=a.space_id AND e.collection='wake_alarms'
      AND json_extract(e.json,'$.memberId')=a.owner AND json_extract(e.json,'$.clipId')=a.id
    )`).run(s.space_id, s.slot, now - 7 * 86400000);
  if (!owns(s, id)) {
    const { size } = db.prepare("SELECT COALESCE(SUM(length(wav)),0) size FROM wake_alarm_audio WHERE space_id=? AND owner=?")
      .get(s.space_id, s.slot);
    fail(size + wav.length <= 48 * 1024 * 1024, "validation", "自定义铃声存储已满");
  }
  db.prepare(`INSERT INTO wake_alarm_audio VALUES(?,?,?,?,?)
    ON CONFLICT(space_id,owner,id) DO UPDATE SET created_at=excluded.created_at`)
    .run(s.space_id, s.slot, id, wav, now);
  return id;
}

function read(s, id) {
  return db.prepare(`SELECT a.wav FROM wake_alarm_audio a
    WHERE a.space_id=? AND a.id=? AND (a.owner=? OR EXISTS (
      SELECT 1 FROM entity_rows e WHERE e.space_id=a.space_id AND e.collection='wake_alarms'
      AND json_extract(e.json,'$.clipId')=a.id AND json_extract(e.json,'$.memberId')=a.owner
      AND json_extract(e.json,'$.target')=?
    )) LIMIT 1`).get(s.space_id, id, s.slot, s.slot)?.wav;
}

module.exports = { MAX_BYTES, clipId, owns, save, read };
