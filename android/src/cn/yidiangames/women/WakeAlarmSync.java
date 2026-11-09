package cn.yidiangames.women;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.webkit.CookieManager;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public final class WakeAlarmSync extends JobService {
    static final String ORIGIN = "https://tn.yidiangames.cn";
    private static final String ENDPOINT = "/api/v2/wake-alarms/device";
    private static final int JOB_ID = 7201;
    private static final ExecutorService WORK = Executors.newSingleThreadExecutor();
    private static final AtomicBoolean QUEUED = new AtomicBoolean();
    private JobParameters running;

    static void start(Context context) {
        Context c = context.getApplicationContext();
        JobScheduler jobs = c.getSystemService(JobScheduler.class);
        if (jobs.getPendingJob(JOB_ID) == null) {
            jobs.schedule(new JobInfo.Builder(JOB_ID, new ComponentName(c, WakeAlarmSync.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(15 * 60 * 1000L).setPersisted(true).build());
        }
        if (QUEUED.compareAndSet(false, true)) WORK.execute(() -> {
            try { sync(c); } finally { QUEUED.set(false); }
        });
    }

    static void clear(Context c) {
        synchronized (WakeAlarms.class) {
            c.getSystemService(JobScheduler.class).cancel(JOB_ID);
            WakeAlarms.clear(c);
        }
    }

    @Override public boolean onStartJob(JobParameters p) {
        running = p;
        WORK.execute(() -> {
            sync(getApplicationContext());
            android.os.Handler main = new android.os.Handler(getMainLooper());
            main.post(() -> {
                if (running != p) return;
                running = null;
                jobFinished(p, false);
            });
        });
        return true;
    }

    @Override public boolean onStopJob(JobParameters p) {
        if (running == p) running = null;
        return true;
    }

    private static void sync(Context c) {
        try {
            String cookie = CookieManager.getInstance().getCookie(ORIGIN + "/");
            if (cookie == null || cookie.isEmpty()) return;
            JSONObject result = request(cookie, null);
            if (result == null) return;
            JSONObject receipt;
            synchronized (WakeAlarms.class) {
                if (!cookie.equals(CookieManager.getInstance().getCookie(ORIGIN + "/"))) return;
                receipt = WakeAlarms.apply(c, result);
            }
            request(cookie, receipt);
        } catch (Exception ignored) {
            // The next sync retries. Never report success without a local schedule.
        }
    }

    private static JSONObject request(String cookie, JSONObject body) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(ORIGIN + ENDPOINT).openConnection();
        try {
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setRequestProperty("Cookie", cookie);
            if (body != null) {
                conn.setRequestMethod("POST");
                conn.setDoOutput(true);
                conn.setRequestProperty("Origin", ORIGIN);
                conn.setRequestProperty("Content-Type", "application/json");
                try (java.io.OutputStream out = conn.getOutputStream()) {
                    out.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }
            }
            if (conn.getResponseCode() != 200) return null;
            try (InputStream in = conn.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] bytes = new byte[4096];
                int n;
                while ((n = in.read(bytes)) != -1) {
                    if (out.size() + n > 65536) throw new java.io.IOException("Alarm response too large");
                    out.write(bytes, 0, n);
                }
                return new JSONObject(new String(out.toByteArray(), StandardCharsets.UTF_8));
            }
        } finally {
            conn.disconnect();
        }
    }
}
