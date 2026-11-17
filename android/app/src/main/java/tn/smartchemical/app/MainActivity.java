package tn.smartchemical.app;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

public class MainActivity extends Activity {
    static final String URL = "https://sc.149-56-212-122.sslip.io";

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        WebView w = new WebView(this);
        w.getSettings().setJavaScriptEnabled(true);
        w.getSettings().setDomStorageEnabled(true);
        w.addJavascriptInterface(new Object() {
            @JavascriptInterface public void setSession(String token) {
                getSharedPreferences("sc", MODE_PRIVATE).edit().putString("token", token).apply();
                startForegroundService(new Intent(MainActivity.this, CallService.class));
            }
            @JavascriptInterface public void clear() {
                getSharedPreferences("sc", MODE_PRIVATE).edit().remove("token").apply();
                stopService(new Intent(MainActivity.this, CallService.class));
            }
        }, "SCAndroid");
        setContentView(w);
        w.loadUrl(URL);
        if (Build.VERSION.SDK_INT >= 33) requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (!pm.isIgnoringBatteryOptimizations(getPackageName()))
            startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName())));
    }
}
