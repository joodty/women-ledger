package cn.yidiangames.women;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Calendar;
import java.util.HashSet;

public final class ReminderStore {
    private static final String PREFS = "goal_reminders";
    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS,Context.MODE_PRIVATE); }
    private static JSONArray stored(Context c) { try { return new JSONArray(prefs(c).getString("items","[]")); } catch (Exception e) { return new JSONArray(); } }
    private static PendingIntent pending(Context c,String account,String id) {
        Intent intent=new Intent(c,ReminderReceiver.class).setAction("cn.yidiangames.women.REMINDER")
            .setData(new Uri.Builder().scheme("women-reminder").authority("goal").appendPath(account).appendPath(id).build())
            .putExtra("account",account).putExtra("id",id);
        return PendingIntent.getBroadcast(c,0,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    }
    private static void cancel(Context c,String account,JSONArray items) {
        AlarmManager alarm=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);
        for(int i=0;i<items.length();i++){JSONObject x=items.optJSONObject(i);if(x!=null)alarm.cancel(pending(c,account,x.optString("id")));}
    }
    public static synchronized boolean replace(Context c,String account,JSONArray items) {
        if(account==null||!account.matches("[a-z0-9_]{2,32}")||items==null||items.length()>3)return false;
        HashSet<String> ids=new HashSet<>();
        for(int i=0;i<items.length();i++){JSONObject x=items.optJSONObject(i);if(x==null)return false;String id=x.optString("id"),name=x.optString("name"),time=x.optString("time");
            if(!id.matches("[a-zA-Z0-9_-]{1,100}")||!ids.add(id)||name.length()<1||name.length()>200||!time.matches("([01][0-9]|2[0-3]):[0-5][0-9]"))return false;}
        String oldAccount=prefs(c).getString("account","");JSONArray old=stored(c);
        if(account.equals(oldAccount)&&items.toString().equals(old.toString()))return true;
        cancel(c,oldAccount,old);
        if(!prefs(c).edit().putString("account",account).putString("items",items.toString()).commit())return false;
        scheduleAll(c);return true;
    }
    public static synchronized void clear(Context c,String account) {
        String old=prefs(c).getString("account","");if(!old.equals(account))return;
        cancel(c,old,stored(c));prefs(c).edit().clear().commit();
    }
    public static synchronized void scheduleAll(Context c) {
        String account=prefs(c).getString("account","");JSONArray items=stored(c);
        cancel(c,account,items);for(int i=0;i<items.length();i++){JSONObject x=items.optJSONObject(i);if(x!=null)schedule(c,account,x);}
    }
    public static void schedule(Context c,String account,JSONObject item) {
        String time=item.optString("time");if(!time.matches("([01][0-9]|2[0-3]):[0-5][0-9]"))return;
        Calendar now=Calendar.getInstance(),next=Calendar.getInstance();next.set(Calendar.HOUR_OF_DAY,Integer.parseInt(time.substring(0,2)));next.set(Calendar.MINUTE,Integer.parseInt(time.substring(3,5)));next.set(Calendar.SECOND,0);next.set(Calendar.MILLISECOND,0);if(!next.after(now))next.add(Calendar.DAY_OF_YEAR,1);
        AlarmManager alarm=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);PendingIntent pi=pending(c,account,item.optString("id"));
        try { if(Build.VERSION.SDK_INT>=31&&!alarm.canScheduleExactAlarms())alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,next.getTimeInMillis(),pi);else alarm.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,next.getTimeInMillis(),pi); }
        catch(SecurityException e){alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,next.getTimeInMillis(),pi);}
    }
    public static synchronized JSONObject find(Context c,String account,String id){
        if(account==null||!account.equals(prefs(c).getString("account","")))return null;JSONArray items=stored(c);
        for(int i=0;i<items.length();i++){JSONObject x=items.optJSONObject(i);if(x!=null&&id.equals(x.optString("id")))return x;}return null;
    }
}
