package cn.yidiangames.women.tests;

import android.app.Instrumentation;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.service.notification.StatusBarNotification;
import android.webkit.WebMessage;
import android.webkit.WebMessagePort;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.net.Uri;
import cn.yidiangames.women.ReminderStore;
import cn.yidiangames.women.ReminderRestoreReceiver;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Calendar;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

public final class ReminderInstrumentation extends Instrumentation {
    @Override public void onCreate(Bundle args){super.onCreate(args);start();}
    @Override public void onStart(){
        Context c=getTargetContext();Bundle result=new Bundle();String account="reminder_test",id="instrumentation_test",tag="goal-"+account+"-"+id;
        String previous=c.getSharedPreferences("goal_reminders",Context.MODE_PRIVATE).getString("account","");
        String previousItems=c.getSharedPreferences("goal_reminders",Context.MODE_PRIVATE).getString("items","[]");
        int status=0;try{
            CountDownLatch bridge=new CountDownLatch(1);
            runOnMainSync(()->{WebView w=new WebView(c);w.getSettings().setJavaScriptEnabled(true);w.setWebViewClient(new WebViewClient(){@Override public void onPageFinished(WebView v,String url){WebMessagePort[] ports=v.createWebMessageChannel();ports[0].setWebMessageCallback(new WebMessagePort.WebMessageCallback(){@Override public void onMessage(WebMessagePort p,WebMessage m){if("bridge-ok".equals(m.getData()))bridge.countDown();}});v.postWebMessage(new WebMessage("women-reminders-v1",new WebMessagePort[]{ports[1]}),Uri.parse("https://tn.yidiangames.cn"));}});w.loadDataWithBaseURL("https://tn.yidiangames.cn/","<script>addEventListener('message',e=>{if(e.data==='women-reminders-v1'&&(!e.origin||e.origin===location.origin))e.ports[0].postMessage('bridge-ok')})</script>","text/html","UTF-8",null);});
            if(!bridge.await(15,TimeUnit.SECONDS))throw new Exception("WebView message bridge failed");
            NotificationManager nm=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);if(!nm.areNotificationsEnabled())throw new Exception("Notification permission is not enabled for test");
            Calendar next=Calendar.getInstance();next.add(Calendar.MINUTE,1);String time=String.format(java.util.Locale.US,"%02d:%02d",next.get(Calendar.HOUR_OF_DAY),next.get(Calendar.MINUTE));
            JSONArray arr=new JSONArray().put(new JSONObject().put("id",id).put("name","测试目标提醒").put("time",time));
            if(!ReminderStore.replace(c,account,arr))throw new Exception("Schedule rejected");
            new ReminderRestoreReceiver().onReceive(c,new Intent(Intent.ACTION_BOOT_COMPLETED));
            long deadline=System.currentTimeMillis()+80000;boolean found=false;
            while(System.currentTimeMillis()<deadline&&!found){for(StatusBarNotification n:nm.getActiveNotifications())if(tag.equals(n.getTag()))found=true;if(!found)Thread.sleep(500);}
            if(!found)throw new Exception("Scheduled notification did not appear");
            result.putString("result","PASS: bridge, restore and timed notification");
        }catch(Exception e){result.putString("result","FAIL: "+e.getMessage());status=1;}
        finally{((NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(tag,0);ReminderStore.clear(c,account);try{if(!previous.isEmpty())ReminderStore.replace(c,previous,new JSONArray(previousItems));}catch(Exception ignored){}}
        finish(status,result);
    }
}
