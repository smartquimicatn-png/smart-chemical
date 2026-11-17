package tn.smartchemical.app;

import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.media.*;
import android.net.Uri;
import android.os.*;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.*;

public class AlarmActivity extends Activity {
    Ringtone ring;
    Vibrator vib;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL); l.setGravity(Gravity.CENTER); l.setBackgroundColor(Color.parseColor("#0b6e4f"));
        TextView t = new TextView(this);
        t.setText("📞\n" + getIntent().getStringExtra("from") + "\nt'appelle !");
        t.setTextSize(34); t.setTextColor(Color.WHITE); t.setGravity(Gravity.CENTER);
        Button ok = new Button(this); ok.setText("OK, j'arrive"); ok.setTextSize(22);
        ok.setOnClickListener(v -> finish());
        l.addView(t); l.addView(ok);
        setContentView(l);

        Uri u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        ring = RingtoneManager.getRingtone(this, u);
        ring.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build()); // sonne même en mode silencieux
        ring.setLooping(true);
        ring.play();
        vib = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        vib.vibrate(VibrationEffect.createWaveform(new long[]{0, 1000, 400}, 0));
        new Handler(Looper.getMainLooper()).postDelayed(this::finish, 60000); // s'arrête seul après 1 min
    }

    @Override protected void onDestroy() {
        super.onDestroy();
        if (ring != null) ring.stop();
        if (vib != null) vib.cancel();
        getSystemService(android.app.NotificationManager.class).cancel(2);
    }
}
