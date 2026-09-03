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
        Vibrator vibrator =
            (Vibrator) getContext()
                .getSystemService(
                    Context.VIBRATOR_SERVICE
                );

        if (
            vibrator == null ||
            !vibrator.hasVibrator()
        ) {
            return;
        }

        long[] timings;
        int[] amplitudes;

        switch (type) {
            case "heySent":
                timings =
                    new long[] {
                        0,
                        38
                    };

                amplitudes =
                    new int[] {
                        0,
                        105
                    };

                break;

            case "heyReceived":
                timings =
                    new long[] {
                        0,
                        68,
                        58,
                        150
                    };

                amplitudes =
                    new int[] {
                        0,
                        190,
                        0,
                        235
                    };

                break;

            case "connection":
                timings =
                    new long[] {
                        0,
                        82,
                        42,
                        105,
                        48,
                        220
                    };

                amplitudes =
                    new int[] {
                        0,
                        205,
                        0,
                        235,
                        0,
                        255
                    };

                break;

            default:
                timings =
                    new long[] {
                        0,
                        105
                    };

                amplitudes =
                    new int[] {
                        0,
                        175
                    };

                break;
        }

        if (
            Build.VERSION.SDK_INT >=
            Build.VERSION_CODES.O
        ) {
            vibrator.vibrate(
                VibrationEffect.createWaveform(
                    timings,
                    amplitudes,
                    -1
                )
            );
        } else {
            //noinspection deprecation
            vibrator.vibrate(
                timings,
                -1
            );
        }
    }
}