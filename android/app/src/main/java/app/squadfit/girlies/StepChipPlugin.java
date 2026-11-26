package app.squadfit.girlies;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorManager;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.List;

/** Gives the web app the phone's step chip: all-day steps and a live total for walks. */
@CapacitorPlugin(
    name = "StepChip",
    permissions = {
        @Permission(strings = { Manifest.permission.ACTIVITY_RECOGNITION }, alias = "activity"),
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
    }
)
public class StepChipPlugin extends Plugin {

    static boolean hasPermission(Context c) {
        return Build.VERSION.SDK_INT < 29
            || ContextCompat.checkSelfPermission(c, Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasChip() {
        SensorManager sm = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        return sm != null && sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null;
    }

    private JSObject state() {
        Context c = getContext();
        JSObject r = new JSObject();
        r.put("available", hasChip());
        r.put("permission", hasPermission(c));
        r.put("running", StepService.running);
        r.put("enabled", StepStore.enabled(c));
        r.put("lifetime", StepStore.lifetime(c));
        r.put("today", StepStore.todaySteps(c));
        r.put("lastAt", StepStore.prefs(c).getLong("lastAt", 0));
        r.put("error", StepStore.prefs(c).getString("err", ""));
        android.os.PowerManager pm = (android.os.PowerManager) c.getSystemService(Context.POWER_SERVICE);
        r.put("batteryOk", pm == null || pm.isIgnoringBatteryOptimizations(c.getPackageName()));
        r.put("svcStart", StepStore.prefs(c).getLong("svcStart", 0));
        try { r.put("days", new JSObject(StepStore.daysJson(c))); } catch (Exception e) { r.put("days", new JSObject()); }
        try {
            JSObject m = new JSObject();
            m.put(StepStore.today(), new JSObject(StepStore.minutesJson(c, StepStore.today())));
            m.put(StepStore.yesterday(), new JSObject(StepStore.minutesJson(c, StepStore.yesterday())));
            r.put("minutes", m);
        } catch (Exception e) { r.put("minutes", new JSObject()); }
        return r;
    }

    private void startCounting() {
        Context c = getContext();
        StepStore.setEnabled(c, true);
        if (!StepService.running) {
            try { ContextCompat.startForegroundService(c, new Intent(c, StepService.class)); }
            catch (Exception e) { StepStore.prefs(c).edit().putString("err", String.valueOf(e)).apply(); }
        }
    }

    @PluginMethod
    public void status(PluginCall call) { ActivityWidget.updateAll(getContext(), false); call.resolve(state()); }

    /** The step goal the widget's pink ring fills up to. */
    @PluginMethod
    public void setGoal(PluginCall call) {
        int g = call.getInt("goal", 10000);
        StepStore.prefs(getContext()).edit().putInt("goal", g > 0 ? g : 10000).apply();
        ActivityWidget.updateAll(getContext(), true);
        call.resolve(state());
    }

    /** Switch on all-day counting (asks for the Physical activity permission the first time). */
    @PluginMethod
    public void start(PluginCall call) {
        if (!hasChip()) { call.resolve(state()); return; }
        List<String> ask = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 29 && !hasPermission(getContext())) ask.add("activity");
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) ask.add("notifications");
        if (!ask.isEmpty()) { requestPermissionForAliases(ask.toArray(new String[0]), call, "afterPermission"); return; }
        startCounting();
        call.resolve(state());
    }

    @PermissionCallback
    private void afterPermission(PluginCall call) {
        if (hasPermission(getContext())) startCounting();
        call.resolve(state());
    }

    /** Ask the phone not to put SquadFit to sleep (Samsung does this to apps), so counting never stops. */
    @PluginMethod
    public void askBattery(PluginCall call) {
        try {
            Intent i = new Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            i.setData(android.net.Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception e) {
            try { Intent i = new Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS); i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); getContext().startActivity(i); } catch (Exception ignored) { }
        }
        call.resolve(state());
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context c = getContext();
        StepStore.setEnabled(c, false);
        c.stopService(new Intent(c, StepService.class));
        call.resolve(state());
    }
}
