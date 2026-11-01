package cn.yidiangames.women;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import org.json.JSONObject;

public final class ReminderReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c,Intent intent){
        if(!"cn.yidiangames.women.REMINDER".equals(intent.getAction()))return;
        String account=intent.getStringExtra("account"),id=intent.getStringExtra("id");if(id==null)return;
        JSONObject item=ReminderStore.find(c,account,id);if(item==null)return;
        ReminderStore.schedule(c,account,item);
        NotificationManager manager=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);
        if(!manager.areNotificationsEnabled()||(Build.VERSION.SDK_INT>=33&&c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED))return;
        manager.createNotificationChannel(new NotificationChannel("goal_reminders","目标提醒",NotificationManager.IMPORTANCE_DEFAULT));
        PendingIntent open=PendingIntent.getActivity(c,0,new Intent(c,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification notification=new Notification.Builder(c,"goal_reminders").setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("目标提醒").setContentText(item.optString("name")).setVisibility(Notification.VISIBILITY_PRIVATE).setAutoCancel(true).setContentIntent(open).build();
        manager.notify("goal-"+account+"-"+id,0,notification);
    }
}
