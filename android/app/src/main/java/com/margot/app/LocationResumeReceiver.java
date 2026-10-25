package com.margot.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/** Resume only the location sharing the member previously enabled. */
public final class LocationResumeReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !(Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())
            || Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction()))) return;
        BackgroundLocationService.setAppInBackground(context, true);
        if (!BackgroundLocationService.shouldResume(context)
            || !BackgroundLocationService.hasBackgroundLocationPermission(context)) return;
        try {
            BackgroundLocationService.start(context);
        } catch (RuntimeException error) {
            // Keep the member's choice. Opening the app can resume when Android allows it.
            Log.w("MargotLocation", "Resume unavailable: " + error.getClass().getSimpleName());
        }
    }
}
