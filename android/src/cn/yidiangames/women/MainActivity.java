package cn.yidiangames.women;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.PermissionRequest;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebMessage;
import android.webkit.WebMessagePort;
import android.widget.EditText;
import android.widget.Toast;
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private static final String SITE = "https://tn.yidiangames.cn/";
    private static final int PICK_FILE = 17;
    private static final int NOTIFICATION_PERMISSION = 18;
    private static final int MICROPHONE_PERMISSION = 19;
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private WebMessagePort reminderPort;
    private PermissionRequest microphoneRequest;

    private boolean allowed(Uri uri) {
        return uri != null && "https".equalsIgnoreCase(uri.getScheme())
            && "tn.yidiangames.cn".equalsIgnoreCase(uri.getHost())
            && (uri.getPort() == -1 || uri.getPort() == 443);
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xfffaf8f5);
        getWindow().setNavigationBarColor(0xfffaf8f5);
        getWindow().getDecorView().setSystemUiVisibility(android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        web = new WebView(this); setContentView(web);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(false); settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap icon){if(reminderPort!=null){reminderPort.close();reminderPort=null;}if(microphoneRequest!=null){microphoneRequest.deny();microphoneRequest=null;}}
            @Override public void onPageFinished(WebView view,String url){if(allowed(Uri.parse(url)))connectReminders(view);}
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (allowed(uri)) return false;
                if ("https".equalsIgnoreCase(uri.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { }
                }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request){runOnUiThread(()->{
                String[] resources=request.getResources();
                if(!allowed(request.getOrigin())||!allowed(Uri.parse(web.getUrl()==null?"":web.getUrl()))||resources.length!=1||!PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resources[0])||microphoneRequest!=null){request.deny();return;}
                if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED){request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});return;}
                microphoneRequest=request;requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},MICROPHONE_PERMISSION);
            });}
            @Override public void onPermissionRequestCanceled(PermissionRequest request){if(microphoneRequest==request)microphoneRequest=null;}
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try { startActivityForResult(params.createIntent(), PICK_FILE); }
                catch (Exception e) { fileCallback = null; callback.onReceiveValue(null); }
                return true;
            }
            @Override public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("确定", (d,w)->result.confirm()).setOnCancelListener(d->result.cancel()).show(); return true;
            }
            @Override public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("确定", (d,w)->result.confirm()).setNegativeButton("取消", (d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show(); return true;
            }
            @Override public boolean onJsPrompt(WebView view, String url, String message, String value, JsPromptResult result) {
                EditText input = new EditText(MainActivity.this); input.setText(value);
                new AlertDialog.Builder(MainActivity.this).setMessage(message).setView(input).setPositiveButton("确定", (d,w)->result.confirm(input.getText().toString())).setNegativeButton("取消", (d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show(); return true;
            }
        });
        web.setDownloadListener((url, agent, disposition, mime, length) -> Toast.makeText(this,"导出备份请暂时使用手机浏览器打开网站",Toast.LENGTH_LONG).show());
        Uri start = getIntent().getData(); web.loadUrl(allowed(start) ? start.toString() : SITE);
    }
    private void connectReminders(WebView view){
        WebMessagePort[] ports=view.createWebMessageChannel();reminderPort=ports[0];
        reminderPort.setWebMessageCallback(new WebMessagePort.WebMessageCallback(){@Override public void onMessage(WebMessagePort port,WebMessage message){
            if(!allowed(Uri.parse(web.getUrl()==null?"":web.getUrl())))return;
            try{String raw=message.getData();if(raw==null||raw.length()>8192)return;JSONObject payload=new JSONObject(raw);String type=payload.optString("type");
                if("sync".equals(type)){org.json.JSONArray items=payload.optJSONArray("reminders");if(!ReminderStore.replace(MainActivity.this,payload.optString("account"),items))Toast.makeText(MainActivity.this,"提醒设置无效，请重新保存",Toast.LENGTH_LONG).show();else if(items!=null&&items.length()>0&&Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED&&!getSharedPreferences("reminder_permissions",MODE_PRIVATE).getBoolean("asked",false)){getSharedPreferences("reminder_permissions",MODE_PRIVATE).edit().putBoolean("asked",true).apply();requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},NOTIFICATION_PERMISSION);}}
                else if("clear".equals(type)){ReminderStore.clear(MainActivity.this,payload.optString("account"));String id=payload.optString("requestId");if(!id.isEmpty())port.postMessage(new WebMessage(new JSONObject().put("requestId",id).toString()));}
                else if("request-permission".equals(type))requestReminderPermissions();
            }catch(Exception ignored){Toast.makeText(MainActivity.this,"提醒设置未能同步",Toast.LENGTH_LONG).show();}
        }});
        view.postWebMessage(new WebMessage("women-reminders-v1",new WebMessagePort[]{ports[1]}),Uri.parse("https://tn.yidiangames.cn"));
    }
    private void requestReminderPermissions(){
        if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED){getSharedPreferences("reminder_permissions",MODE_PRIVATE).edit().putBoolean("asked",true).apply();requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},NOTIFICATION_PERMISSION);return;}
        NotificationManager manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
        if(!manager.areNotificationsEnabled()){try{Intent i=new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,getPackageName());startActivity(i);}catch(Exception e){Toast.makeText(this,"请在系统设置中允许通知",Toast.LENGTH_LONG).show();}return;}
        requestExactAlarm();
    }
    private void requestExactAlarm(){
        if(Build.VERSION.SDK_INT>=31){AlarmManager alarm=(AlarmManager)getSystemService(ALARM_SERVICE);if(!alarm.canScheduleExactAlarms()){try{Toast.makeText(this,"请允许闹钟和提醒，让提醒更准时",Toast.LENGTH_LONG).show();startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,Uri.parse("package:"+getPackageName())));}catch(Exception e){Toast.makeText(this,"系统可能延迟提醒",Toast.LENGTH_LONG).show();}}}
    }
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results){super.onRequestPermissionsResult(request,permissions,results);if(request==MICROPHONE_PERMISSION){PermissionRequest pending=microphoneRequest;microphoneRequest=null;if(pending!=null){if(results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED&&allowed(Uri.parse(web.getUrl()==null?"":web.getUrl())))pending.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});else pending.deny();}return;}if(request==NOTIFICATION_PERMISSION){if(results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED)requestExactAlarm();else Toast.makeText(this,"请在系统设置中允许通知，否则无法收到提醒",Toast.LENGTH_LONG).show();}}
    @Override protected void onResume(){super.onResume();ReminderStore.scheduleAll(this);}
    @Override protected void onDestroy(){if(reminderPort!=null){reminderPort.close();reminderPort=null;}super.onDestroy();}
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request,result,data);
        if (request == PICK_FILE && fileCallback != null) { fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data)); fileCallback=null; }
    }
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
}
