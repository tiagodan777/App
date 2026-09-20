package com.margot.app;

import android.content.Context;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "MargotHaptics")
public final class MargotHapticsPlugin extends Plugin {
    @PluginMethod
    public void play(PluginCall call) {
        String type = call.getString("type");
        vibrate(type == null ? "messageReceived" : type);
        call.resolve();
    }

    private void vibrate(String type) {
        Vibrator vibrator = (Vibrator) getContext().getSystemService(
            Context.VIBRATOR_SERVICE
        );

        if (vibrator == null || !vibrator.hasVibrator()) {
            return;
        }

        if (!type.equals("interaction")
            && !type.equals("shutter")
            && !type.equals("heySent")
            && !type.equals("heyReceived")) {
            return;
        }

        long[] timings = {0, type.equals("shutter") ? 10 : 15};
        boolean isHey = type.equals("heySent") || type.equals("heyReceived");
        int[] amplitudes = {0, isHey ? 220 : 90};

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(
                VibrationEffect.createWaveform(timings, amplitudes, -1)
            );
        } else {
            // noinspection deprecation
            vibrator.vibrate(timings, -1);
        }
    }
}