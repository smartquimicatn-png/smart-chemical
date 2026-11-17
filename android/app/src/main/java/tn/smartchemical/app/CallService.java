package tn.smartchemical.app;

import android.app.*;
import android.content.Intent;
import android.os.IBinder;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;

/** Garde une connexion ouverte avec le serveur ; un appel déclenche l'écran de sonnerie. */
public class CallService extends Service {
    volatile boolean run;
    Thread t;

    @Override public int onStartCommand(Intent i, int f, int id) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel("bg", "Écoute des appels", NotificationManager.IMPORTANCE_MIN));
        nm.createNotificationChannel(new NotificationChannel("call", "Appels", NotificationManager.IMPORTANCE_HIGH));
        startForeground(1, new Notification.Builder(this, "bg").setSmallIcon(android.R.drawable.sym_action_call).setContentTitle("Smart Chemical").setContentText("En attente d'appels").build());
        if (t == null || !t.isAlive()) { run = true; t = new Thread(this::loop); t.start(); }
        return START_STICKY;
    }

    void loop() {
        while (run) {
            String token = getSharedPreferences("sc", MODE_PRIVATE).getString("token", null);
            if (token == null) return;
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(MainActivity.URL + "/api/events").openConnection();
                c.setRequestProperty("Authorization", "Bearer " + token);
                c.setReadTimeout(70000); // le serveur envoie un signal toutes les 25 s
                if (c.getResponseCode() == 401) return;
                BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream()));
                for (String l; (l = r.readLine()) != null; )
                    if (l.startsWith("data:") && l.contains("cancel")) AlarmActivity.stopRinging();
                    else if (l.startsWith("data:")) ring(l.replaceAll(".*\"from\":\"([^\"]*)\".*", "$1"));
            } catch (Exception e) { /* coupure réseau : on se reconnecte */ }
            try { Thread.sleep(3000); } catch (InterruptedException e) { return; }
        }
    }

    void ring(String from) {
        Intent a = new Intent(this, AlarmActivity.class).putExtra("from", from).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pi = PendingIntent.getActivity(this, 0, a, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        // plein écran sur téléphone verrouillé ; sinon la notification prioritaire ouvre l'écran
        getSystemService(NotificationManager.class).notify(2, new Notification.Builder(this, "call")
            .setSmallIcon(android.R.drawable.sym_action_call).setContentTitle("📞 " + from + " t'appelle !")
            .setCategory(Notification.CATEGORY_CALL).setFullScreenIntent(pi, true).setContentIntent(pi).setAutoCancel(true).build());
        try { startActivity(a); } catch (Exception e) { /* bloqué en arrière-plan : la notification plein écran prend le relais */ }
    }

    @Override public void onDestroy() { run = false; if (t != null) t.interrupt(); }
    @Override public IBinder onBind(Intent i) { return null; }
}
