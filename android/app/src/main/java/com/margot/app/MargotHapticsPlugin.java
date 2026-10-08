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

    @PluginMethod
    public void playConnection(PluginCall call) {
        Vibrator vibrator = (Vibrator) getContext().getSystemService(
            Context.VIBRATOR_SERVICE
        );

        if (vibrator != null && vibrator.hasVibrator()) {
            long[] timings = { 0, 24, 65, 38, 75, 72 };

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                int[] amplitudes = { 0, 70, 0, 160, 0, 255 };
                vibrator.vibrate(
                    VibrationEffect.createWaveform(timings, amplitudes, -1)
                );
            } else {
                // noinspection deprecation
                vibrator.vibrate(timings, -1);
            }
        }

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
            && !type.equals("heyReceived")
            && !type.equals("messageReceived")) {
            return;
        }

        boolean received = type.equals("heyReceived")
            || type.equals("messageReceived");

        long[] timings = {
            0,
            received ? 54 : type.equals("shutter") ? 12 : 18
        };

        int[] amplitudes = {
            0,
            received || type.equals("heySent") ? 255 : 108
        };

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