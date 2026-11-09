package cn.yidiangames.women;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.Handler;
import android.os.IBinder;
import android.os.PowerManager;

public final class WakeAlarmRing extends Service {
    private static final String CHANNEL = "wake_alarm_ring";
    private static final String STOP = "stop";
    private final Handler handler = new Handler();
    private MediaPlayer player;

    @Override public int onStartCommand(Intent intent, int flags, int id) {
        if (intent == null || STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        NotificationManager nm = getSystemService(NotificationManager.class);
        NotificationChannel channel = new NotificationChannel(CHANNEL, "叫醒闹钟", NotificationManager.IMPORTANCE_HIGH);
        channel.setSound(null, null);
        nm.createNotificationChannel(channel);
        PendingIntent stop = PendingIntent.getService(this, 0, new Intent(this, WakeAlarmRing.class)
            .setAction(STOP), PendingIntent.FLAG_IMMUTABLE);
        String note = intent.getStringExtra("note");
        Notification n = new Notification.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setCategory(Notification.CATEGORY_ALARM)
            .setContentTitle("起床啦")
            .setContentText(note == null || note.isEmpty() ? "你的叫醒闹钟响了" : note)
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .setContentIntent(WakeAlarms.open(this, "alarms"))
            .setOngoing(true)
            .addAction(new Notification.Action.Builder(null, "停止响铃", stop).build())
            .build();
        startForeground(7202, n);
        if (player != null) player.release();
        player = null;
        try {
            String tone = intent.getStringExtra("tone");
            AudioAttributes attributes = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
            String clip = intent.getStringExtra("clipId");
            if ("custom".equals(tone) && WakeAlarmAudio.cached(this, clip)) {
                player = new MediaPlayer();
                player.setAudioAttributes(attributes);
                try (java.io.FileInputStream audio = new java.io.FileInputStream(WakeAlarmAudio.file(this, clip))) {
                    player.setDataSource(audio.getFD());
                    player.prepare();
                }
            } else {
                int res = getResources().getIdentifier("wake_" + tone, "raw", getPackageName());
                player = MediaPlayer.create(this, res == 0 ? getResources().getIdentifier(
                    "wake_gentle", "raw", getPackageName()) : res, attributes, 0);
            }
            if (player != null) {
                player.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK);
                player.setLooping(true);
                player.start();
            }
        } catch (java.io.IOException | RuntimeException ignored) { }
        handler.removeCallbacksAndMessages(null);
        handler.postDelayed(this::stopSelf, 120000);
        return START_NOT_STICKY;
    }

    @Override public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (player != null) player.release();
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
