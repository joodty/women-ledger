package cn.yidiangames.women;

import android.content.Context;
import android.util.AtomicFile;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Set;

final class WakeAlarmAudio {
    static File file(Context c, String id) {
        if (id == null || !id.matches("[a-f0-9]{64}")) return null;
        return new File(new File(c.getFilesDir(), "wake_audio"), id + ".wav");
    }

    static boolean cached(Context c, String id) {
        File file = file(c, id);
        return file != null && file.isFile() && file.length() > 44 && file.length() <= 960044;
    }

    static void fetch(Context c, String id, String cookie) throws Exception {
        File file = file(c, id);
        if (file == null || cached(c, id)) return;
        HttpURLConnection conn = (HttpURLConnection) new URL(
            WakeAlarmSync.ORIGIN + "/api/v2/wake-alarms/audio/" + id).openConnection();
        try {
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setRequestProperty("Cookie", cookie);
            int size = conn.getContentLength();
            if (conn.getResponseCode() != 200 || !"audio/wav".equals(conn.getContentType()) ||
                size <= 44 || size > 960044) throw new java.io.IOException("Invalid audio response");
            if (!file.getParentFile().isDirectory() && !file.getParentFile().mkdirs())
                throw new java.io.IOException("Could not open alarm audio storage");
            AtomicFile output = new AtomicFile(file);
            FileOutputStream writer = output.startWrite();
            try (InputStream reader = conn.getInputStream()) {
                MessageDigest hash = MessageDigest.getInstance("SHA-256");
                byte[] buffer = new byte[8192];
                int total = 0, count;
                while ((count = reader.read(buffer)) != -1) {
                    total += count;
                    if (total > size) throw new java.io.IOException("Alarm audio exceeds expected size");
                    writer.write(buffer, 0, count);
                    hash.update(buffer, 0, count);
                }
                StringBuilder hex = new StringBuilder(64);
                for (byte value : hash.digest()) {
                    hex.append(Character.forDigit((value >> 4) & 15, 16));
                    hex.append(Character.forDigit(value & 15, 16));
                }
                if (total != size || !id.contentEquals(hex))
                    throw new java.io.IOException("Alarm audio checksum mismatch");
                output.finishWrite(writer);
            } catch (Exception e) {
                output.failWrite(writer);
                throw e;
            }
        } finally {
            conn.disconnect();
        }
    }

    static void prune(Context c, Set<String> keep) {
        File[] files = new File(c.getFilesDir(), "wake_audio").listFiles();
        if (files == null) return;
        for (File file : files)
            if (file.getName().matches("[a-f0-9]{64}\\.wav") &&
                !keep.contains(file.getName().substring(0, 64))) new AtomicFile(file).delete();
    }
}
