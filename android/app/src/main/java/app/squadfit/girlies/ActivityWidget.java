package app.squadfit.girlies;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.widget.RemoteViews;
import org.json.JSONObject;
import java.text.NumberFormat;
import java.util.Iterator;

/** Home-screen widget: today's steps, active minutes and calories with rings, updated live as you walk. */
public class ActivityWidget extends AppWidgetProvider {
    static final int MIN_GOAL = 30, CAL_GOAL = 300;
    private static long lastUpdate = 0;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) { updateAll(context, true); }

    /** Called by the step service on every few steps (at most every 5 seconds). */
    static void updateAll(Context c, boolean force) {
        long now = System.currentTimeMillis();
        if (!force && now - lastUpdate < 5000) return;
        lastUpdate = now;
        try {
            AppWidgetManager m = AppWidgetManager.getInstance(c);
            int[] ids = m.getAppWidgetIds(new ComponentName(c, ActivityWidget.class));
            if (ids == null || ids.length == 0) return;
            long steps = StepStore.todaySteps(c);
            int mins = activeMinutes(c);
            long cal = Math.round(steps * 0.04);          // about 0.04 calories a step
            int goal = StepStore.prefs(c).getInt("goal", 10000);
            NumberFormat nf = NumberFormat.getIntegerInstance();

            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_activity);
            v.setTextViewText(R.id.w_steps, nf.format(steps));
            v.setTextViewText(R.id.w_mins, mins + " min");
            v.setTextViewText(R.id.w_cal, nf.format(cal) + " cal");
            v.setTextViewText(R.id.w_label, StepService.running ? "SquadFit · Today" : "SquadFit · open the app to start counting");
            v.setImageViewBitmap(R.id.w_rings, rings(steps / (float) goal, mins / (float) MIN_GOAL, cal / (float) CAL_GOAL));
            Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            v.setOnClickPendingIntent(R.id.w_root, PendingIntent.getActivity(c, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
            m.updateAppWidget(ids, v);
        } catch (Exception ignored) { }
    }

    /** Minutes today with a walking rhythm (60+ steps in the minute). */
    static int activeMinutes(Context c) {
        try {
            JSONObject mins = new JSONObject(StepStore.minutesJson(c, StepStore.today()));
            int n = 0; Iterator<String> it = mins.keys();
            while (it.hasNext()) { long s = mins.optLong(it.next(), 0); if (s >= 60 && s <= 220) n++; }
            return n;
        } catch (Exception e) { return 0; }
    }

    /** Three rings like a fitness watch: steps (pink), active minutes (purple), calories (green). */
    static Bitmap rings(float a, float b, float d) {
        int size = 192; float stroke = 18f, gap = 6f;
        Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        int[] colors = { Color.parseColor("#FF2FA6"), Color.parseColor("#A78BFA"), Color.parseColor("#4ADE80") };
        float[] vals = { a, b, d };
        for (int i = 0; i < 3; i++) {
            float inset = stroke / 2 + i * (stroke + gap);
            RectF r = new RectF(inset, inset, size - inset, size - inset);
            Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
            track.setStyle(Paint.Style.STROKE); track.setStrokeWidth(stroke);
            track.setColor(colors[i]); track.setAlpha(55);
            cv.drawArc(r, 0, 360, false, track);
            float sweep = Math.max(0f, Math.min(1f, vals[i])) * 360f;
            if (sweep > 0) {
                Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
                p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(stroke); p.setStrokeCap(Paint.Cap.ROUND);
                p.setColor(colors[i]);
                cv.drawArc(r, -90, Math.max(sweep, 4f), false, p);
            }
        }
        return bmp;
    }
}
