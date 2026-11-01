package com.ahmed.visits;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Hosts the planner web UI (assets/www) and gives it a few native helpers. */
public class MainActivity extends Activity {
    private static final int FILE_CHOOSER = 1;
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private volatile boolean cancelResolve = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setTextZoom(100);

        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("file".equals(uri.getScheme())) return false;
                openExternal(uri.toString());
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try {
                    startActivityForResult(Intent.createChooser(i, "اختار ملف"), FILE_CHOOSER);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl("file:///android_asset/www/index.html");
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER || fileCallback == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                int n = data.getClipData().getItemCount();
                result = new Uri[n];
                for (int k = 0; k < n; k++) result[k] = data.getClipData().getItemAt(k).getUri();
            } else if (data.getData() != null) {
                result = new Uri[]{data.getData()};
            }
        }
        fileCallback.onReceiveValue(result);
        fileCallback = null;
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        cancelResolve = true;
        super.onDestroy();
    }

    private void openExternal(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (ActivityNotFoundException ignored) {
        }
    }

    private void js(final String code) {
        runOnUiThread(() -> web.evaluateJavascript(code, null));
    }

    // ---- Google Maps link -> coordinates ----

    private static final Pattern[] COORD_PATTERNS = {
            Pattern.compile("!3d(-?\\d+\\.\\d+)!4d(-?\\d+\\.\\d+)"),
            Pattern.compile("\\[null,null,(-?\\d+\\.\\d+),(-?\\d+\\.\\d+)\\]"),
            Pattern.compile("center=(-?\\d+\\.\\d+)(?:%2C|,)(-?\\d+\\.\\d+)"),
            Pattern.compile("@(-?\\d+\\.\\d+),(-?\\d+\\.\\d+)"),
            Pattern.compile("ll=(-?\\d+\\.\\d+),(-?\\d+\\.\\d+)"),
    };

    private static double[] findCoords(String text) {
        if (text == null) return null;
        for (Pattern p : COORD_PATTERNS) {
            Matcher m = p.matcher(text);
            while (m.find()) {
                try {
                    double lat = Double.parseDouble(m.group(1));
                    double lng = Double.parseDouble(m.group(2));
                    if (lat > 22 && lat < 27 && lng > 51 && lng < 57) return new double[]{lat, lng};
                } catch (NumberFormatException ignored) {
                }
            }
        }
        return null;
    }

    private static double[] fetchCoords(String url) {
        HttpURLConnection c = null;
        try {
            String u = url.trim();
            if (u.startsWith("http://")) u = "https://" + u.substring(7);
            u += (u.contains("?") ? "&" : "?") + "hl=en";
            double[] direct = findCoords(u);
            if (direct != null) return direct;
            c = (HttpURLConnection) new URL(u).openConnection();
            c.setInstanceFollowRedirects(true);
            c.setConnectTimeout(15000);
            c.setReadTimeout(20000);
            c.setRequestProperty("User-Agent",
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36");
            c.setRequestProperty("Accept-Language", "en-US,en;q=0.9");
            c.setRequestProperty("Cookie", "CONSENT=YES+");
            int code = c.getResponseCode();
            double[] fromFinal = findCoords(c.getURL().toString());
            if (code >= 400) return fromFinal;
            InputStream in = c.getInputStream();
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] b = new byte[16384];
            int n;
            while ((n = in.read(b)) > 0 && buf.size() < 3_000_000) buf.write(b, 0, n);
            in.close();
            double[] fromBody = findCoords(buf.toString("UTF-8"));
            return fromBody != null ? fromBody : fromFinal;
        } catch (Exception e) {
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    /** Methods callable from JavaScript as window.AndroidBridge.* */
    private class Bridge {
        @JavascriptInterface
        public void openUrl(String url) {
            runOnUiThread(() -> openExternal(url));
        }

        @JavascriptInterface
        public void shareText(String subject, String text) {
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType("text/plain");
            i.putExtra(Intent.EXTRA_SUBJECT, subject);
            i.putExtra(Intent.EXTRA_TEXT, text);
            runOnUiThread(() -> startActivity(Intent.createChooser(i, subject)));
        }

        @JavascriptInterface
        public String saveBase64(String name, String mime, String base64) {
            return saveBytes(name, mime, android.util.Base64.decode(base64, android.util.Base64.DEFAULT));
        }

        @JavascriptInterface
        public String saveFile(String name, String mime, String content) {
            return saveBytes(name, mime, content.getBytes(StandardCharsets.UTF_8));
        }

        private String saveBytes(String name, String mime, byte[] bytes) {
            try {
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                    v.put(MediaStore.Downloads.MIME_TYPE, mime);
                    v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (uri == null) throw new IllegalStateException("no uri");
                    try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                        os.write(bytes);
                    }
                    return "اتحفظ في التنزيلات (Downloads): " + name;
                }
                File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                File f = new File(dir, name);
                try (FileOutputStream os = new FileOutputStream(f)) {
                    os.write(bytes);
                }
                return "اتحفظ في: " + f.getAbsolutePath();
            } catch (Exception e) {
                return "مقدرتش أحفظ الملف: " + e.getMessage();
            }
        }

        @JavascriptInterface
        public void cancelResolve() {
            cancelResolve = true;
        }

        @JavascriptInterface
        public void resolveLocations(String json) {
            cancelResolve = false;
            new Thread(() -> {
                int ok = 0, fail = 0;
                try {
                    JSONArray arr = new JSONArray(json);
                    int total = arr.length();
                    for (int k = 0; k < total && !cancelResolve; k++) {
                        JSONObject o = arr.getJSONObject(k);
                        String id = o.getString("id");
                        double[] c = fetchCoords(o.getString("url"));
                        if (c != null) {
                            ok++;
                            js(String.format(Locale.US, "window.onLocationResolved(%s,%.7f,%.7f,true)",
                                    JSONObject.quote(id), c[0], c[1]));
                        } else {
                            fail++;
                        }
                        js(String.format(Locale.US, "window.onResolveProgress(%d,%d)", k + 1, total));
                        Thread.sleep(250);
                    }
                } catch (Exception ignored) {
                }
                js(String.format(Locale.US, "window.onResolveDone(%d,%d)", ok, fail));
            }).start();
        }
    }
}
