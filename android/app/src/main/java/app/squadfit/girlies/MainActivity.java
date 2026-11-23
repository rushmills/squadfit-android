package app.squadfit.girlies;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(StepChipPlugin.class);   // the phone's built-in step chip
        super.onCreate(savedInstanceState);
    }
}
