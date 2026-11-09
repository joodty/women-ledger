package cn.yidiangames.women;

import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Iterator;

public final class WakeAlarms extends BroadcastReceiver {
    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    static final String FIRE = "cn.yidiangames.women.WAKE_ALARM";
    private static final int FLAGS = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("wake_alarms", Context.MODE_PRIVATE);
    }

    private static JSONObject saved(Context c) {
        try { return new JSONObject(prefs(c).getString("items", "{}")); }
        catch (Exception e) { return new JSONObject(); }
    }

    static long next(JSONObject alarm, long now) {
        LocalTime time = LocalTime.parse(alarm.optString("time"));
        ZonedDateTime clock = Instant.ofEpochMilli(now).atZone(ZONE);
        JSONArray days = alarm.optJSONArray("days");
        if (days == null || days.length() == 0) {
            long at = LocalDate.parse(alarm.optString("date")).atTime(time).atZone(ZONE).toInstant().toEpochMilli();
            return at > now ? at : 0;
        }
        for (int offset = 0; offset <= 7; offset++) {
            LocalDate day = clock.toLocalDate().plusDays(offset);
            long at = day.atTime(time).atZone(ZONE).toInstant().toEpochMilli();
            if (at <= now) continue;
            for (int i = 0; i < days.length(); i++)
                if (days.optInt(i) == day.getDayOfWeek().getValue()) return at;
        }
        return 0;
    }

    private static PendingIntent fire(Context c, String id, long at, int flags) {
        return PendingIntent.getBroadcast(c, 0, new Intent(c, WakeAlarms.class)
            .setAction(FIRE).setData(Uri.parse("women-alarm://wake/" + id))
            .putExtra("at", at), flags);
    }

    private static void cancel(Context c, String id) {
        PendingIntent pi = fire(c, id, 0, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_NO_CREATE);
        if (pi != null) {
            c.getSystemService(AlarmManager.class).cancel(pi);
            pi.cancel();
        }
    }

    static PendingIntent open(Context c, String route) {
        return PendingIntent.getActivity(c, 7203, new Intent(c, MainActivity.class)
            .setData(Uri.parse(WakeAlarmSync.ORIGIN + "/#/" + route)), FLAGS);
    }

    private static JSONObject schedule(Context c, JSONObject alarm) throws Exception {
        String id = alarm.getString("id");
        long at = 0;
        String status = "paused";
        AlarmManager manager = c.getSystemService(AlarmManager.class);
        if (alarm.optBoolean("enabled")) {
            at = next(alarm, System.currentTimeMillis());
            if (at == 0) status = "expired";
            else if ((Build.VERSION.SDK_INT >= 31 && !manager.canScheduleExactAlarms())
                || !c.getSystemService(NotificationManager.class).areNotificationsEnabled()) {
                at = 0;
                status = "permission";
            } else {
                try {
                    manager.setAlarmClock(new AlarmManager.AlarmClockInfo(at, open(c, "alarms")), fire(c, id, at, FLAGS));
                    status = "scheduled";
                } catch (RuntimeException e) {
                    at = 0;
                    status = "error";
                }
            }
        }
        if (at == 0) cancel(c, id);
        alarm.put("nextAt", at);
        return new JSONObject().put("id", id).put("version", alarm.getInt("version"))
            .put("status", status).put("nextAt", at);
    }

    static synchronized JSONObject apply(Context c, JSONObject response) throws Exception {
        String account = response.getString("account");
        String space = response.getString("spaceId");
        if (!account.equals(prefs(c).getString("account", "")) ||
            !space.equals(prefs(c).getString("space", ""))) clear(c);
        JSONObject before = saved(c), after = new JSONObject();
        JSONArray items = new JSONArray();
        JSONArray alarms = response.getJSONArray("alarms");
        for (int i = 0; i < alarms.length(); i++) {
            JSONObject alarm = alarms.getJSONObject(i);
            String id = alarm.getString("id");
            if (!id.matches("[a-zA-Z0-9_-]{1,100}")) continue;
            JSONObject previous = before.optJSONObject(id);
            long at = previous == null ? 0 : previous.optLong("nextAt");
            long now = System.currentTimeMillis();
            if (alarm.optBoolean("enabled") && previous != null &&
                previous.optInt("version") == alarm.getInt("version") &&
                at <= now && at > now - 180000) {
                // A delivery already due can be waiting for the receiver lock.
                alarm.put("nextAt", at);
                items.put(new JSONObject().put("id", id).put("version", alarm.getInt("version"))
                    .put("status", "scheduled").put("nextAt", at));
            } else {
                items.put(schedule(c, alarm));
            }
            after.put(id, alarm);
        }
        for (Iterator<String> it = before.keys(); it.hasNext();) {
            String id = it.next();
            if (!after.has(id)) cancel(c, id);
        }
        if (!prefs(c).edit().putString("account", account).putString("space", space)
            .putString("items", after.toString()).commit()) {
            for (Iterator<String> it = after.keys(); it.hasNext();) cancel(c, it.next());
            throw new java.io.IOException("Could not save wake alarms");
        }
        return new JSONObject().put("account", account).put("spaceId", space).put("items", items);
    }

    static synchronized void clear(Context c) {
        for (Iterator<String> it = saved(c).keys(); it.hasNext();) cancel(c, it.next());
        prefs(c).edit().clear().commit();
        c.stopService(new Intent(c, WakeAlarmRing.class));
    }

    static synchronized void restore(Context c) {
        JSONObject alarms = saved(c);
        try {
            for (Iterator<String> it = alarms.keys(); it.hasNext();) schedule(c, alarms.getJSONObject(it.next()));
            prefs(c).edit().putString("items", alarms.toString()).commit();
        } catch (Exception ignored) { }
    }

    @Override public void onReceive(Context c, Intent intent) {
        synchronized (WakeAlarms.class) {
            if (!FIRE.equals(intent.getAction()) || intent.getData() == null) return;
            String id = intent.getData().getLastPathSegment();
            JSONObject alarms = saved(c), alarm = alarms.optJSONObject(id);
            long at = intent.getLongExtra("at", 0), now = System.currentTimeMillis();
            if (alarm == null || !alarm.optBoolean("enabled") || at != alarm.optLong("nextAt") || now < at) return;
            try {
                schedule(c, alarm);
                prefs(c).edit().putString("items", alarms.toString()).commit();
                if (now - at < 180000) c.startForegroundService(new Intent(c, WakeAlarmRing.class)
                    .putExtra("note", alarm.optString("note")).putExtra("tone", alarm.optString("tone")));
            } catch (Exception ignored) { }
        }
    }
}
