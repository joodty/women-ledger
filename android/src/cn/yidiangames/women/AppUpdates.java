package cn.yidiangames.women;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.widget.Toast;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONObject;

/** Checks the trusted website for a newer native APK; Android confirms installation. */
final class AppUpdates {
    private static final String BASE="https://tn.yidiangames.cn";
    private final Activity activity;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final DownloadManager downloads;
    private AlertDialog dialog;
    private long downloadId=-1;
    private Uri downloaded;
    private boolean waitingForSettings=false,closed=false,downloadRunning=false;
    private String downloadUrl;
    AppUpdates(Activity activity){this.activity=activity;downloads=(DownloadManager)activity.getSystemService(Context.DOWNLOAD_SERVICE);}

    void check(){new Thread(()->{
        HttpsURLConnection connection=null;
        try{
            connection=(HttpsURLConnection)new URL(BASE+"/app-version.json").openConnection();
            connection.setConnectTimeout(8000);connection.setReadTimeout(8000);connection.setInstanceFollowRedirects(false);connection.setUseCaches(false);
            if(connection.getResponseCode()!=200)return;
            ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(InputStream in=connection.getInputStream()){byte[] b=new byte[1024];int n;while((n=in.read(b))!=-1){bytes.write(b,0,n);if(bytes.size()>8192)return;}}
            JSONObject data=new JSONObject(bytes.toString("UTF-8"));int version=data.getInt("versionCode");String name=data.getString("versionName"),path=data.getString("downloadPath");
            if(version<=activity.getPackageManager().getPackageInfo(activity.getPackageName(),0).versionCode||!name.matches("[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}")||!path.equals("/download/women-ledger-"+name+".apk"))return;
            activity.runOnUiThread(()->{if(!closed&&!activity.isFinishing())show(name,BASE+path);});
        }catch(Exception ignored){}finally{if(connection!=null)connection.disconnect();}
    },"women-update-check").start();}
    private void show(String name,String url){
        downloadUrl=url;
        dialog=new AlertDialog.Builder(activity).setTitle("发现新版本 "+name).setMessage("请更新 App 后继续使用。下载完成后，按照安卓系统提示安装。")
            .setPositiveButton("下载并安装",(d,w)->startDownload()).create();
        dialog.setCancelable(false);dialog.setCanceledOnTouchOutside(false);dialog.setOnShowListener(x->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->startDownload()));dialog.show();
    }
    private void startDownload(){
        if(downloadRunning)return;
        try{
            Uri uri=Uri.parse(downloadUrl);String filename=uri.getLastPathSegment();
            java.io.File dir=activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);if(dir==null)throw new IllegalStateException("下载目录不可用");
            java.io.File target=new java.io.File(dir,filename);if(target.exists()&&!target.delete())throw new IllegalStateException("无法清理上一次下载");
            DownloadManager.Request request=new DownloadManager.Request(uri).setTitle("我们 App 更新").setDescription("正在下载更新")
                .setMimeType("application/vnd.android.package-archive").setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalFilesDir(activity,Environment.DIRECTORY_DOWNLOADS,filename);
            downloadId=downloads.enqueue(request);downloadRunning=true;dialog.setMessage("正在下载，请稍候…");dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);poll();
        }catch(Exception e){downloadRunning=false;dialog.setMessage("下载未能开始，请检查网络后重试。");}
    }
    private void poll(){if(closed||!downloadRunning)return;try(Cursor c=downloads.query(new DownloadManager.Query().setFilterById(downloadId))){
        if(c!=null&&c.moveToFirst()){
            int status=c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            if(status==DownloadManager.STATUS_SUCCESSFUL){downloadRunning=false;downloaded=downloads.getUriForDownloadedFile(downloadId);dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true);dialog.getButton(AlertDialog.BUTTON_POSITIVE).setText("安装更新");dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->install());dialog.setMessage("下载完成，请按系统提示安装。安装后会保留 App 数据。");install();return;}
            if(status==DownloadManager.STATUS_FAILED){downloadRunning=false;dialog.setMessage("下载失败，请检查网络后重试。");dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true);return;}
        }
    }catch(Exception e){downloadRunning=false;dialog.setMessage("无法读取下载状态，请重试。");dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true);return;}handler.postDelayed(this::poll,1000);}
    private void install(){
        if(downloaded==null){Toast.makeText(activity,"下载文件不可用，请重新下载",Toast.LENGTH_LONG).show();return;}
        try{
            if(Build.VERSION.SDK_INT>=26&&!activity.getPackageManager().canRequestPackageInstalls()){waitingForSettings=true;activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+activity.getPackageName())));return;}
            waitingForSettings=false;Intent intent=new Intent(Intent.ACTION_VIEW).setDataAndType(downloaded,"application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);activity.startActivity(intent);
        }catch(Exception e){waitingForSettings=false;dialog.setMessage("无法打开安装程序，请检查手机安装权限后重试。");}
    }
    void onResume(){if(waitingForSettings){waitingForSettings=false;if(Build.VERSION.SDK_INT<26||activity.getPackageManager().canRequestPackageInstalls())install();}}
    void close(){closed=true;handler.removeCallbacksAndMessages(null);}
}
