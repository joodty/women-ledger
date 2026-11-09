package cn.yidiangames.women;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
public final class ReminderRestoreReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c,Intent i){
        ReminderStore.scheduleAll(c);
        WakeAlarms.restore(c);
    }
}
