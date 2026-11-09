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
            long oldAt = install(apply, c, first, 1);
            long newAt = install(apply, c, replacement, 2);
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
                    result.putString("result", "PASS: replaced old time, timed native alarm audio, stop action");
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

    private static long install(Method apply, Context c, ZonedDateTime at, int version) throws Exception {
        JSONObject alarm = new JSONObject().put("id", "isolated_instrumentation")
            .put("date", at.toLocalDate().toString()).put("time", at.toLocalTime().toString())
            .put("days", new JSONArray()).put("enabled", true).put("tone", "gentle")
            .put("version", version).put("note", "叫醒闹钟测试");
        JSONObject response = new JSONObject().put("account", "instrumentation_test")
            .put("spaceId", "instrumentation_test").put("alarms", new JSONArray().put(alarm));
        JSONObject result = (JSONObject) apply.invoke(null, c, response);
        JSONObject item = result.getJSONArray("items").getJSONObject(0);
        if (!"scheduled".equals(item.getString("status"))) throw new Exception(item.toString());
        return item.getLong("nextAt");
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
