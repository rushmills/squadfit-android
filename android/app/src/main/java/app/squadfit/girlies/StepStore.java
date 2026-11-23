package app.squadfit.girlies;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Iterator;
import java.util.Locale;

/**
 * Keeps the step chip's counts: a running lifetime total (used to measure walks) and steps per day.
 * The chip reports "steps since the phone was switched on", so we store the last reading and add the difference.
 */
final class StepStore {
    private static final String PREFS = "squadfit_steps";
    private StepStore() {}

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static String today() { return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date()); }

    static synchronized void onCounter(Context c, long value) {
        SharedPreferences p = prefs(c);
        long last = p.getLong("last", -1);
        long delta;
        if (last < 0) delta = 0;                    // first reading: just remember where the chip is
        else if (value >= last) delta = value - last;
        else delta = value;                         // phone restarted: the chip started again from 0
        if (delta > 30000) delta = 0;               // nonsense jump: ignore
        SharedPreferences.Editor e = p.edit().putLong("last", value).putLong("lastAt", System.currentTimeMillis());
        if (delta > 0) {
            e.putLong("lifetime", p.getLong("lifetime", 0) + delta);
            try {
                JSONObject days = new JSONObject(p.getString("days", "{}"));
                String d = today();
                days.put(d, days.optLong(d, 0) + delta);
                // keep about a month
                Calendar cut = Calendar.getInstance(); cut.add(Calendar.DAY_OF_YEAR, -35);
                String cutS = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(cut.getTime());
                Iterator<String> it = days.keys(); java.util.List<String> old = new java.util.ArrayList<>();
                while (it.hasNext()) { String k = it.next(); if (k.compareTo(cutS) < 0) old.add(k); }
                for (String k : old) days.remove(k);
                e.putString("days", days.toString());
            } catch (Exception ignored) { }
        }
        e.apply();
    }

    static long lifetime(Context c) { return prefs(c).getLong("lifetime", 0); }
    static long todaySteps(Context c) {
        try { return new JSONObject(prefs(c).getString("days", "{}")).optLong(today(), 0); } catch (Exception e) { return 0; }
    }
    static String daysJson(Context c) { return prefs(c).getString("days", "{}"); }
    static boolean enabled(Context c) { return prefs(c).getBoolean("enabled", false); }
    static void setEnabled(Context c, boolean on) { prefs(c).edit().putBoolean("enabled", on).apply(); }
}
