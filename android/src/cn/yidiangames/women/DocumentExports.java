package cn.yidiangames.women;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.webkit.WebMessage;
import android.webkit.WebMessagePort;
import org.json.JSONObject;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** User-selected file saving; acknowledges only after bytes were actually written. */
final class DocumentExports {
    static final int SAVE_DOCUMENT=21;
    private final Activity activity;
    private WebMessagePort port;
    private String requestId,filename,mime;
    private StringBuilder content;
    private boolean choosing=false;
    DocumentExports(Activity activity){this.activity=activity;}
    void message(WebMessagePort source,JSONObject data){
        String type=data.optString("type"),id=data.optString("requestId");
        if(!id.matches("[a-zA-Z0-9_-]{1,100}"))return;
        if("export-start".equals(type)){
            if(content!=null){reply(source,id,false,"已有一个文件正在保存，请先完成");return;}
            String name=data.optString("filename"),kind=data.optString("mime");
            if(name.isEmpty()||name.length()>100||name.contains("/")||name.contains("\\")||!("application/json".equals(kind)||"text/plain".equals(kind))){reply(source,id,false,"文件信息无效");return;}
            requestId=id;filename=name;mime=kind;port=source;content=new StringBuilder();return;
        }
        if(content==null||!id.equals(requestId)||port!=source||choosing)return;
        if("export-chunk".equals(type)){String text=data.optString("text");if(text.length()>2000||content.length()+text.length()>4*1024*1024){reply(port,requestId,false,"文件过大，请分批导出");clear();return;}content.append(text);}
        if("export-end".equals(type)){try{choosing=true;Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime).putExtra(Intent.EXTRA_TITLE,filename);activity.startActivityForResult(intent,SAVE_DOCUMENT);}catch(Exception e){reply(port,requestId,false,"无法打开文件保存界面");clear();}}
    }
    void result(int result,Intent data){if(content==null)return;boolean ok=false;try{if(result==Activity.RESULT_OK&&data!=null&&data.getData()!=null){Uri uri=data.getData();try(OutputStream out=activity.getContentResolver().openOutputStream(uri,"wt")){if(out==null)throw new IllegalStateException();out.write(content.toString().getBytes(StandardCharsets.UTF_8));out.flush();ok=true;}}}catch(Exception ignored){}reply(port,requestId,ok,ok?"":"文件未保存，原始内容仍保留");clear();}
    private void reply(WebMessagePort to,String id,boolean ok,String error){try{to.postMessage(new WebMessage(new JSONObject().put("requestId",id).put("ok",ok).put("error",error).toString()));}catch(Exception ignored){}}
    void clear(){port=null;requestId=null;content=null;choosing=false;}
}
