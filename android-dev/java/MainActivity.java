package chat.ssom.risucustom.dev;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.*;
import android.widget.Toast;
import org.json.JSONObject;
import org.json.JSONArray;
import java.io.*;
import java.util.*;

public final class MainActivity extends Activity {
    private static final String DOMAIN = ".risu-custom.invalid";
    private SharedPreferences prefs;
    private String space, staging;
    private WebView web;
    private ValueCallback<Uri[]> pendingPicker;
    private final Map<String, Download> downloads = new HashMap<>();

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        prefs = getSharedPreferences("workspaces", MODE_PRIVATE);
        web = new WebView(this);
        web.setBackgroundColor(0xff191919);
        setContentView(web);
        web.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!local(uri)) return null;
                String path = uri.getPath();
                if (path == null || path.equals("/")) path = "/index.html";
                if (path.contains("..") || path.contains("\\")) return missing();
                try {
                    return new WebResourceResponse(mime(path), null, getAssets().open("web" + path));
                } catch (IOException error) { return missing(); }
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                Uri uri = request.getUrl();
                if (local(uri)) return !host().equals(uri.getHost());
                if (request.hasGesture() && "https".equals(uri.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (RuntimeException ignored) {}
                }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (pendingPicker != null) pendingPicker.onReceiveValue(null);
                pendingPicker = cb;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE);
                // Android providers disagree on MIME types for .js, .json and Risu binary files.
                intent.setType("*/*").putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try { startActivityForResult(intent, 17); }
                catch (RuntimeException error) { pendingPicker = null; cb.onReceiveValue(null); }
                return true;
            }
            @Override public boolean onJsPrompt(WebView view, String url, String msg, String payload, JsPromptResult result) {
                if (!"RISU_CUSTOM_DEV".equals(msg)) return super.onJsPrompt(view, url, msg, payload, result);
                Uri origin = Uri.parse(url);
                if (!local(origin) || !host().equals(origin.getHost())) { result.cancel(); return true; }
                try { result.confirm(command(new JSONObject(payload))); }
                catch (Exception error) { result.confirm("error:" + error.getMessage()); }
                return true;
            }
        });
        open(prefs.getString("active", "home"), false);
    }

    private String host() { return space + DOMAIN; }
    private boolean local(Uri uri) {
        return "https".equals(uri.getScheme()) && uri.getPort() == -1 && uri.getHost() != null
            && uri.getHost().matches("(home|p-[a-f0-9-]{36})\\.risu-custom\\.invalid");
    }
    private WebResourceResponse missing() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
            Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }
    private String mime(String path) {
        if (path.endsWith(".js") || path.endsWith(".mjs")) return "application/javascript";
        if (path.endsWith(".wasm")) return "application/wasm";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".svg")) return "image/svg+xml";
        String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(MimeTypeMap.getFileExtensionFromUrl(path));
        return mime == null ? "application/octet-stream" : mime;
    }
    private void open(String id, boolean restore) {
        space = id;
        staging = restore ? id : null;
        web.loadUrl("https://" + host() + (restore ? "/?restore" : "/"));
    }
    private String command(JSONObject args) throws Exception {
        switch (args.getString("action")) {
            case "stage": web.post(() -> open("p-" + UUID.randomUUID(), true)); break;
            case "cancelStage": web.post(() -> open(prefs.getString("active", "home"), false)); break;
            case "commitStage":
                if (staging == null || !staging.equals(space)) throw new IOException("복원 공간을 확인해 주세요.");
                JSONArray spaces = new JSONArray(prefs.getString("history", "[\"home\"]"));
                spaces.put(space);
                if (!prefs.edit().putString("active", space).putString("history", spaces.toString()).commit())
                    throw new IOException("저장 공간을 전환할 수 없습니다.");
                web.post(() -> open(prefs.getString("active", "home"), false)); break;
            case "spaces": web.post(this::chooseSpace); break;
            case "begin": {
                String id = UUID.randomUUID().toString();
                if (downloads.size() >= 8) throw new IOException("진행 중인 저장이 너무 많습니다.");
                downloads.put(id, new Download(args.getString("name"), args.optString("mime")));
                return id;
            }
            case "append": {
                Download file = downloads.get(args.getString("id"));
                if (file == null) throw new IOException("저장이 중단되었습니다.");
                file.out.write(Base64.decode(args.getString("bytes"), Base64.NO_WRAP)); break;
            }
            case "finish": {
                Download file = downloads.remove(args.getString("id"));
                if (file == null) throw new IOException("저장이 중단되었습니다.");
                try { file.finish(); } catch (Exception error) { file.abort(); throw error; }
                Toast.makeText(this, "다운로드/RISU CUSTOM에 저장했습니다.", Toast.LENGTH_SHORT).show(); break;
            }
            case "abort": {
                Download file = downloads.remove(args.getString("id"));
                if (file != null) file.abort(); break;
            }
            default: throw new IOException("지원하지 않는 요청입니다.");
        }
        return "ok";
    }
    private final class Download {
        final Uri uri;
        final OutputStream out;
        Download(String name, String mime) throws IOException {
            ContentValues values = new ContentValues();
            String safe = new File(name).getName().replaceAll("[\\p{Cntrl}/\\\\:]", "_");
            values.put(MediaStore.Downloads.DISPLAY_NAME, safe.isEmpty() ? "download.bin" : safe);
            values.put(MediaStore.Downloads.MIME_TYPE, mime.isEmpty() ? "application/octet-stream" : mime);
            values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/RISU CUSTOM");
            values.put(MediaStore.Downloads.IS_PENDING, 1);
            uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IOException("다운로드 파일을 만들 수 없습니다.");
            try {
                out = getContentResolver().openOutputStream(uri);
                if (out == null) throw new IOException("파일을 열 수 없습니다.");
            } catch (Exception error) { getContentResolver().delete(uri, null, null); throw error; }
        }
        void finish() throws IOException {
            out.close();
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.IS_PENDING, 0);
            if (getContentResolver().update(uri, values, null, null) != 1) throw new IOException("파일 저장 실패");
        }
        void abort() {
            try { out.close(); } catch (IOException ignored) {}
            getContentResolver().delete(uri, null, null);
        }
    }
    private void chooseSpace() {
        try {
            JSONArray spaces = new JSONArray(prefs.getString("history", "[\"home\"]"));
            String[] labels = new String[spaces.length()];
            for (int i = 0; i < labels.length; i++) {
                labels[i] = (i == 0 ? "처음 공간" : "복원 공간 " + i) + (space.equals(spaces.getString(i)) ? " · 현재" : "");
            }
            new AlertDialog.Builder(this).setTitle("저장 공간 전환").setItems(labels, (dialog, i) -> {
                String chosen = spaces.optString(i);
                prefs.edit().putString("active", chosen).apply();
                open(chosen, false);
            }).setNegativeButton("닫기", null).show();
        } catch (Exception error) { Toast.makeText(this, "공간 목록을 읽을 수 없습니다.", Toast.LENGTH_LONG).show(); }
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != 17 || pendingPicker == null) return;
        List<Uri> files = new ArrayList<>();
        if (result == RESULT_OK && data != null) {
            if (data.getClipData() != null) for (int i = 0; i < data.getClipData().getItemCount(); i++)
                addContent(files, data.getClipData().getItemAt(i).getUri());
            else addContent(files, data.getData());
        }
        pendingPicker.onReceiveValue(files.isEmpty() ? null : files.toArray(new Uri[0]));
        pendingPicker = null;
    }
    private void addContent(List<Uri> files, Uri uri) {
        if (uri != null && "content".equals(uri.getScheme())) files.add(uri);
    }
    @Override public void onBackPressed() {
        if (staging != null) open(prefs.getString("active", "home"), false);
        else if (web.canGoBack() && web.copyBackForwardList().getCurrentIndex() > 0) {
            WebBackForwardList history = web.copyBackForwardList();
            Uri previous = Uri.parse(history.getItemAtIndex(history.getCurrentIndex()-1).getUrl());
            if (host().equals(previous.getHost()) && !previous.getQueryParameterNames().contains("restore")) web.goBack();
            else super.onBackPressed();
        } else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        for (Download file : downloads.values()) file.abort();
        if (pendingPicker != null) pendingPicker.onReceiveValue(null);
        web.destroy();
        super.onDestroy();
    }
}
