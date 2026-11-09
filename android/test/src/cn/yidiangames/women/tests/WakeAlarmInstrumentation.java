package cn.yidiangames.women.tests;

import android.app.Instrumentation;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.os.Bundle;
import android.service.notification.StatusBarNotification;
import cn.yidiangames.women.WakeAlarms;
import java.lang.reflect.Method;
import java.io.File;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import org.json.JSONArray;
import org.json.JSONObject;

public final class WakeAlarmInstrumentation extends Instrumentation {
    @Override public void onCreate(Bundle arguments) {
        super.onCreate(arguments);
        start();
    }

    @Override public void onStart() {
        Context c = getTargetContext();
        Bundle result = new Bundle();
        Method clear = null;
        boolean installedTestAlarm = false;
        int status = 0;
        try {
            if (c.getSharedPreferences("wake_alarms", Context.MODE_PRIVATE).contains("account"))
                throw new IllegalStateException("Use an app install without any enrolled wake alarms");
            Method apply = WakeAlarms.class.getDeclaredMethod("apply", Context.class, JSONObject.class);
            clear = WakeAlarms.class.getDeclaredMethod("clear", Context.class);
            apply.setAccessible(true);
            clear.setAccessible(true);
            ZonedDateTime first = ZonedDateTime.now(ZoneId.of("Asia/Shanghai"))
                .plusMinutes(1).withSecond(0).withNano(0);
            ZonedDateTime replacement = first.plusMinutes(1);
            installedTestAlarm = true;
            long oldAt = scheduled(apply, c, first, 1, "");
            byte[] wav = testWav();
            StringBuilder hash = new StringBuilder();
            for (byte value : MessageDigest.getInstance("SHA-256").digest(wav))
                hash.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
            String clip = hash.toString();
            if (install(apply, c, replacement, 2, clip).length() != 0)
                throw new Exception("Missing song was reported as scheduled");
            JSONObject pending = new JSONObject(c.getSharedPreferences("wake_alarms", Context.MODE_PRIVATE)
                .getString("items", "{}")).getJSONObject("isolated_instrumentation");
            if (pending.getLong("nextAt") != oldAt || pending.getInt("version") != 1)
                throw new Exception("Previous alarm was lost while waiting for the song");
            File storage = new File(c.getFilesDir(), "wake_audio");
            if (!storage.isDirectory() && !storage.mkdirs()) throw new Exception("No audio storage");
            Files.write(new File(storage, clip + ".wav").toPath(), wav);
            long newAt = scheduled(apply, c, replacement, 2, clip);
            if (newAt - oldAt != 60000) throw new Exception("New alarm time was not applied");
            NotificationManager notifications = c.getSystemService(NotificationManager.class);
            while (System.currentTimeMillis() < newAt + 15000) {
                StatusBarNotification ring = activeRing(notifications);
                if (ring != null) {
                    if (System.currentTimeMillis() < newAt - 500) throw new Exception("Old alarm rang after edit");
                    Thread.sleep(600);
                    AudioManager audio = c.getSystemService(AudioManager.class);
                    if (audio.getActivePlaybackConfigurations().stream().noneMatch(
                        p -> p.getAudioAttributes().getUsage() == AudioAttributes.USAGE_ALARM))
                        throw new Exception("Alarm audio playback was not observed");
                    ring.getNotification().actions[0].actionIntent.send();
                    Thread.sleep(800);
                    if (activeRing(notifications) != null) throw new Exception("Stop action did not remove alarm");
                    result.putString("result", "PASS: missing clip keeps old alarm, cached custom WAV rings on time, stop action");
                    break;
                }
                Thread.sleep(200);
            }
            if (!result.containsKey("result")) throw new Exception("Replacement alarm did not ring");
        } catch (Exception e) {
            status = 1;
            result.putString("error", e.toString());
        } finally {
            if (installedTestAlarm && clear != null) {
                try { clear.invoke(null, c); } catch (Exception ignored) { }
            }
        }
        finish(status == 0 ? ActivityCode.OK : ActivityCode.FAILED, result);
    }

    private static byte[] testWav() {
        ByteBuffer buffer = ByteBuffer.allocate(16044).order(ByteOrder.LITTLE_ENDIAN);
        buffer.put("RIFF".getBytes(java.nio.charset.StandardCharsets.US_ASCII)).putInt(16036)
            .put("WAVEfmt ".getBytes(java.nio.charset.StandardCharsets.US_ASCII)).putInt(16)
            .putShort((short) 1).putShort((short) 1).putInt(16000).putInt(16000)
            .putShort((short) 1).putShort((short) 8)
            .put("data".getBytes(java.nio.charset.StandardCharsets.US_ASCII)).putInt(16000);
        for (int i = 0; i < 16000; i++) buffer.put((byte) (128 + 40 * Math.sin(i * Math.PI / 20)));
        return buffer.array();
    }

    private static long scheduled(Method apply, Context c, ZonedDateTime at, int version, String clip) throws Exception {
        JSONObject item = install(apply, c, at, version, clip).getJSONObject(0);
        if (!"scheduled".equals(item.getString("status"))) throw new Exception(item.toString());
        return item.getLong("nextAt");
    }

    private static JSONArray install(Method apply, Context c, ZonedDateTime at, int version, String clip) throws Exception {
        JSONObject alarm = new JSONObject().put("id", "isolated_instrumentation")
            .put("date", at.toLocalDate().toString()).put("time", at.toLocalTime().toString())
            .put("days", new JSONArray()).put("enabled", true).put("tone", clip.isEmpty() ? "gentle" : "custom")
            .put("version", version).put("note", "叫醒闹钟测试");
        if (!clip.isEmpty()) alarm.put("clipId", clip);
        JSONObject response = new JSONObject().put("account", "instrumentation_test")
            .put("spaceId", "instrumentation_test").put("alarms", new JSONArray().put(alarm));
        JSONObject result = (JSONObject) apply.invoke(null, c, response);
        return result.getJSONArray("items");
    }

    private static StatusBarNotification activeRing(NotificationManager notifications) {
        for (StatusBarNotification n : notifications.getActiveNotifications())
            if (n.getId() == 7202) return n;
        return null;
    }

    private static final class ActivityCode {
        static final int OK = -1;
        static final int FAILED = 0;
    }
}
