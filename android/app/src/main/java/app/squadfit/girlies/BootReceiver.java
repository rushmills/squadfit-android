package app.squadfit.girlies;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import androidx.core.content.ContextCompat;

/** Starts counting again after the phone restarts or the app updates (if it was switched on). */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!StepStore.enabled(context) || !StepChipPlugin.hasPermission(context)) return;
        try { ContextCompat.startForegroundService(context, new Intent(context, StepService.class)); } catch (Exception ignored) { }
    }
}
