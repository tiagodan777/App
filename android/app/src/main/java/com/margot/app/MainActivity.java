package com.margot.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    public static final String CHANNEL_ACTIVITY = "margot_activity";
    public static final String CHANNEL_HEY = "margot_hey";
    public static final String CHANNEL_MESSAGE = "margot_message";
    public static final String CHANNEL_NEARBY = "margot_nearby";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackgroundLocationPlugin.class);
        registerPlugin(MargotHapticsPlugin.class);
        super.onCreate(savedInstanceState);
        createNotificationChannels();
    }

    @Override
    protected void onStart() {
        super.onStart();

        BackgroundLocationService.setAppInBackground(
            this,
            false
        );

        BackgroundLocationService.sendAppState(
            this,
            false
        );
    }

    @Override
    protected void onStop() {
        BackgroundLocationService.setAppInBackground(
            this,
            true
        );

        BackgroundLocationService.sendAppState(
            this,
            true
        );

        super.onStop();
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager manager =
            (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);

        if (manager == null) {
            return;
        }

        NotificationChannel activity = new NotificationChannel(
            CHANNEL_ACTIVITY,
            "Atividade da Margot",
            NotificationManager.IMPORTANCE_HIGH
        );
        activity.setDescription("Notificações gerais da Margot");
        activity.enableVibration(true);
        activity.setVibrationPattern(new long[] {0, 110});

        NotificationChannel hey = new NotificationChannel(
            CHANNEL_HEY,
            "Heys",
            NotificationManager.IMPORTANCE_HIGH
        );
        hey.setDescription("Heys recebidos na Margot");
        hey.enableVibration(true);
        hey.setVibrationPattern(new long[] {0, 75, 60, 180});

        NotificationChannel message = new NotificationChannel(
            CHANNEL_MESSAGE,
            "Mensagens",
            NotificationManager.IMPORTANCE_HIGH
        );
        message.setDescription("Mensagens recebidas na Margot");
        message.enableVibration(true);
        message.setVibrationPattern(new long[] {0, 135});

        NotificationChannel nearby = new NotificationChannel(
            CHANNEL_NEARBY,
            "Pessoas por perto",
            NotificationManager.IMPORTANCE_HIGH
        );
        nearby.setDescription(
            "Avisos quando há várias pessoas com a Margot por perto"
        );
        nearby.enableVibration(true);
        nearby.setVibrationPattern(new long[] {0, 85, 55, 85});

        manager.createNotificationChannel(activity);
        manager.createNotificationChannel(hey);
        manager.createNotificationChannel(message);
        manager.createNotificationChannel(nearby);
    }
}