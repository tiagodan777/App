package com.margot.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/** Resume only the location sharing the member previously enabled. */
public final class LocationResumeReceiver extends BroadcastReceiver {
    static final int IGNORE = 0, START = 1, NOTIFY = 2;

    static int bootAction(boolean pendingResume, boolean backgroundPermission, boolean locationEnabled) {
        if (!pendingResume || !backgroundPermission) return IGNORE;
        return locationEnabled ? START : NOTIFY;
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !(Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())
            || Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction()))) return;
        BackgroundLocationService.setAppInBackground(context, true);
        int action = bootAction(BackgroundLocationService.hasPendingResume(context),
            BackgroundLocationService.hasBackgroundLocationPermission(context),
            BackgroundLocationService.isLocationEnabled(context));
        if (action == IGNORE) return;
        if (action == NOTIFY) {
            // Location FGS requires location enabled. A later provider broadcast does not
            // grant Android 12+ permission to start one from a stopped background process.
            BackgroundLocationService.notifyResumeRequired(context);
            return;
        }
        try {
            BackgroundLocationService.start(context);
        } catch (RuntimeException error) {
            // Keep the member's choice. Opening the app can resume when Android allows it.
            Log.w("MargotLocation", "Resume unavailable: " + error.getClass().getSimpleName());
        }
    }
}
