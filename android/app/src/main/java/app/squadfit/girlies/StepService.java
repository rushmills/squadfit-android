package app.squadfit.girlies;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import java.text.NumberFormat;

/** Counts steps all day from the phone's step chip (low power, works with the screen locked). */
public class StepService extends Service implements SensorEventListener {
    static final String CHANNEL = "squadfit_steps";
    static final int NOTIF_ID = 4711;
    static volatile boolean running = false;

    private SensorManager sensors;
    private long lastNotif = 0;
    private long shownSteps = -1;

    @Override
    public void onCreate() {
        super.onCreate();
        running = true;
        makeChannel();
        try {
            ServiceCompat.startForeground(this, NOTIF_ID, buildNotification(StepStore.todaySteps(this)),
                Build.VERSION.SDK_INT >= 34 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH : 0);
        } catch (Exception e) {
            StepStore.prefs(this).edit().putString("err", String.valueOf(e)).apply();   // shown in the app's Me tab
            running = false;
            stopSelf();
            return;
        }
        sensors = (SensorManager) getSystemService(SENSOR_SERVICE);
        Sensor chip = sensors == null ? null : sensors.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
        if (chip != null) {
            sensors.registerListener(this, chip, SensorManager.SENSOR_DELAY_NORMAL, 1_000_000);
            StepStore.prefs(this).edit().remove("err").putLong("svcStart", System.currentTimeMillis()).apply();
        } else { StepStore.prefs(this).edit().putString("err", "No step chip on this phone").apply(); stopSelf(); }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) { return START_STICKY; }

    @Override
    public void onSensorChanged(SensorEvent event) {
        StepStore.onCounter(this, (long) event.values[0]);
        ActivityWidget.updateAll(this, false);   // keep the home-screen widget live
        long now = System.currentTimeMillis();
        long today = StepStore.todaySteps(this);
        if (today != shownSteps && now - lastNotif > 30000) {   // refresh the notification at most every 30s
            lastNotif = now; shownSteps = today;
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIF_ID, buildNotification(today));
        }
    }

    @Override public void onAccuracyChanged(Sensor sensor, int accuracy) { }

    @Override
    public void onDestroy() {
        running = false;
        if (sensors != null) sensors.unregisterListener(this);
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    private void makeChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Step counting", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Shows today's steps while SquadFit counts them");
            ch.setShowBadge(false);
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    private Notification buildNotification(long steps) {
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle("SquadFit")
            .setContentText(NumberFormat.getIntegerInstance().format(steps) + " steps today")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(pi)
            .build();
    }
}
