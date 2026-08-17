package com.margot.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

public final class BackgroundLocationService extends Service
    implements LocationListener {

    public static final String ACTION_AUTHORIZATION_EXPIRED =
        "com.margot.app.backgroundlocation.AUTHORIZATION_EXPIRED";

    private static final String PREFS = "margot_background_location";
    private static final String TOKEN = "token";
    private static final String VISIBLE = "visible";
    private static final String PERMISSION_REQUESTED = "permission_requested";
    private static final String START_REQUESTED = "start_requested";

    private static final String ENDPOINT =
        "https://margot-app.com/background-location-update/";
    private static final String CHANNEL_ID = "margot_background_location";
    private static final int NOTIFICATION_ID = 41027;

    private static final long SEND_INTERVAL_MS = 60_000L;
    private static final long MAX_LOCATION_AGE_MS = 120_000L;
    private static final float MAX_ACCURACY_METRES = 1_000f;

    private static final Pattern TOKEN_PATTERN = Pattern.compile(
        "^[A-Fa-f0-9]{64}$"
    );

    private static final ExecutorService NETWORK =
        Executors.newSingleThreadExecutor(runnable -> {
            Thread thread = new Thread(
                runnable,
                "MargotBackgroundLocation"
            );
            thread.setDaemon(true);
            return thread;
        });

    private static volatile boolean running;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private LocationManager locationManager;
    private boolean updatesRegistered;
    private boolean sending;
    private long lastSuccessfulSendAt;

    @Override
    public void onCreate() {
        super.onCreate();
        running = true;
        locationManager = (LocationManager) getSystemService(
            Context.LOCATION_SERVICE
        );
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!canRun(this)) {
            stopUnavailable();
            return START_NOT_STICKY;
        }

        try {
            startAsForeground();
            registerLocationUpdates();
            return START_STICKY;
        } catch (SecurityException | IllegalStateException exception) {
            stopUnavailable();
            return START_NOT_STICKY;
        }
    }

    @Override
    public void onDestroy() {
        removeLocationUpdates();
        running = false;
        stopForeground(STOP_FOREGROUND_REMOVE);
        cancelNotification(this);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onLocationChanged(Location location) {
        if (!canRun(this) || !usable(location) || sending) {
            return;
        }

        long now = SystemClock.elapsedRealtime();

        if (
            lastSuccessfulSendAt > 0 &&
            now - lastSuccessfulSendAt < SEND_INTERVAL_MS
        ) {
            return;
        }

        sendLocation(new Location(location));
    }

    @Override
    public void onProviderDisabled(String provider) {
        if (!isLocationEnabled(this)) {
            stopUnavailable();
        }
    }

    @Override
    public void onProviderEnabled(String provider) {
        // As subscrições existentes voltam a receber posições.
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onStatusChanged(
        String provider,
        int status,
        Bundle extras
    ) {
        // Necessário para compatibilidade com as versões Android mais antigas.
    }

    public static void start(Context context) {
        Context app = context.getApplicationContext();
        setStartRequested(app, true);
        Intent intent = new Intent(app, BackgroundLocationService.class);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                app.startForegroundService(intent);
            } else {
                app.startService(intent);
            }
        } catch (RuntimeException exception) {
            setStartRequested(app, false);
            throw exception;
        }
    }

    public static void stop(Context context) {
        Context app = context.getApplicationContext();
        setStartRequested(app, false);
        app.stopService(new Intent(app, BackgroundLocationService.class));
        cancelNotification(app);
    }

    public static boolean isRunningOrRequested(Context context) {
        return running || preferences(context).getBoolean(
            START_REQUESTED,
            false
        );
    }

    public static boolean isValidToken(String token) {
        return token != null && TOKEN_PATTERN.matcher(token).matches();
    }

    public static void saveToken(Context context, String token) {
        preferences(context).edit().putString(TOKEN, token).apply();
    }

    public static String readToken(Context context) {
        return preferences(context).getString(TOKEN, "");
    }

    public static void clearToken(Context context) {
        preferences(context).edit().remove(TOKEN).apply();
    }

    public static void setVisible(Context context, boolean visible) {
        preferences(context).edit().putBoolean(VISIBLE, visible).apply();
    }

    public static boolean isVisible(Context context) {
        return preferences(context).getBoolean(VISIBLE, true);
    }

    public static void setPermissionRequested(
        Context context,
        boolean requested
    ) {
        preferences(context).edit().putBoolean(
            PERMISSION_REQUESTED,
            requested
        ).apply();
    }

    public static boolean wasPermissionRequested(Context context) {
        return preferences(context).getBoolean(
            PERMISSION_REQUESTED,
            false
        );
    }

    public static boolean hasLocationPermission(Context context) {
        return hasFineLocationPermission(context) ||
            context.checkSelfPermission(
                Manifest.permission.ACCESS_COARSE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED;
    }

    public static boolean hasFineLocationPermission(Context context) {
        return context.checkSelfPermission(
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED;
    }

    public static boolean isLocationEnabled(Context context) {
        LocationManager manager = (LocationManager) context.getSystemService(
            Context.LOCATION_SERVICE
        );

        if (manager == null) {
            return false;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return manager.isLocationEnabled();
        }

        try {
            return manager.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        } catch (RuntimeException exception) {
            return false;
        }
    }

    public static void sendPresence(
        Context context,
        String token,
        boolean active,
        boolean visible
    ) {
        if (!isValidToken(token)) {
            return;
        }

        Context app = context.getApplicationContext();
        JSONObject body = new JSONObject();

        try {
            body.put("active", active);
            body.put("visible", visible);
            body.put("timestamp", timestamp(new Date()));
        } catch (JSONException exception) {
            return;
        }

        NETWORK.execute(() -> {
            int status = post(token, body);

            if (status == HttpURLConnection.HTTP_UNAUTHORIZED) {
                expireAuthorization(app, token);
            }
        });
    }

    private static boolean canRun(Context context) {
        return isVisible(context) &&
            isLocationEnabled(context) &&
            hasLocationPermission(context) &&
            isValidToken(readToken(context));
    }

    private void startAsForeground() {
        Notification notification = buildNotification();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager manager = getSystemService(
            NotificationManager.class
        );

        if (manager == null) {
            return;
        }

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            getString(R.string.background_location_channel_name),
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription(
            getString(R.string.background_location_channel_description)
        );
        channel.enableVibration(false);
        channel.setSound(null, null);
        channel.setShowBadge(false);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        manager.createNotificationChannel(channel);
    }

    private Notification buildNotification() {
        Intent openApp = new Intent(this, MainActivity.class);
        openApp.addFlags(
            Intent.FLAG_ACTIVITY_CLEAR_TOP |
                Intent.FLAG_ACTIVITY_SINGLE_TOP
        );

        PendingIntent contentIntent = PendingIntent.getActivity(
            this,
            0,
            openApp,
            PendingIntent.FLAG_UPDATE_CURRENT |
                PendingIntent.FLAG_IMMUTABLE
        );

        Notification.Builder builder;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this)
                .setPriority(Notification.PRIORITY_LOW);
        }

        return builder
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle(
                getString(R.string.background_location_notification_title)
            )
            .setContentText(
                getString(R.string.background_location_notification_text)
            )
            .setContentIntent(contentIntent)
            .setCategory(Notification.CATEGORY_SERVICE)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .build();
    }

    private void registerLocationUpdates() {
        if (updatesRegistered || locationManager == null) {
            return;
        }

        boolean registered = registerProvider(
            LocationManager.NETWORK_PROVIDER
        );
        registered = registerProvider(LocationManager.GPS_PROVIDER) ||
            registered;

        if (!registered) {
            throw new IllegalStateException(
                "Não existe um fornecedor de localização disponível."
            );
        }

        updatesRegistered = true;
        Location lastKnown = newestLastKnownLocation();

        if (lastKnown != null) {
            onLocationChanged(lastKnown);
        }
    }

    private boolean registerProvider(String provider) {
        try {
            if (!locationManager.isProviderEnabled(provider)) {
                return false;
            }

            locationManager.requestLocationUpdates(
                provider,
                SEND_INTERVAL_MS,
                0f,
                this,
                Looper.getMainLooper()
            );
            return true;
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private Location newestLastKnownLocation() {
        Location network = lastKnown(LocationManager.NETWORK_PROVIDER);
        Location gps = lastKnown(LocationManager.GPS_PROVIDER);

        if (network == null) {
            return gps;
        }

        if (gps == null) {
            return network;
        }

        return gps.getTime() >= network.getTime() ? gps : network;
    }

    private Location lastKnown(String provider) {
        try {
            if (!locationManager.isProviderEnabled(provider)) {
                return null;
            }

            return locationManager.getLastKnownLocation(provider);
        } catch (IllegalArgumentException | SecurityException exception) {
            return null;
        }
    }

    private void removeLocationUpdates() {
        if (!updatesRegistered || locationManager == null) {
            return;
        }

        try {
            locationManager.removeUpdates(this);
        } catch (SecurityException ignored) {
            // A permissão pode ter sido retirada com o serviço ativo.
        }

        updatesRegistered = false;
    }

    private static boolean usable(Location location) {
        if (location == null) {
            return false;
        }

        if (
            location.hasAccuracy() &&
            (
                location.getAccuracy() < 0 ||
                location.getAccuracy() > MAX_ACCURACY_METRES
            )
        ) {
            return false;
        }

        return Math.abs(
            System.currentTimeMillis() - location.getTime()
        ) <= MAX_LOCATION_AGE_MS;
    }

    private void sendLocation(Location location) {
        String token = readToken(this);

        if (!isValidToken(token) || !isVisible(this)) {
            return;
        }

        JSONObject body = new JSONObject();

        try {
            body.put("latitude", location.getLatitude());
            body.put("longitude", location.getLongitude());
            body.put(
                "accuracy",
                location.hasAccuracy() ? location.getAccuracy() : 0
            );
            body.put("active", true);
            body.put("visible", true);
            body.put("timestamp", timestamp(new Date(location.getTime())));
        } catch (JSONException exception) {
            return;
        }

        sending = true;

        NETWORK.execute(() -> {
            int status = post(token, body);
            mainHandler.post(() -> finishSend(token, status));
        });
    }

    private void finishSend(String token, int status) {
        sending = false;

        if (status == HttpURLConnection.HTTP_UNAUTHORIZED) {
            expireAuthorization(this, token);
            stopSelf();
            return;
        }

        if (status >= 200 && status <= 299) {
            lastSuccessfulSendAt = SystemClock.elapsedRealtime();
        }

        if (!isVisible(this)) {
            String currentToken = readToken(this);

            if (token.equals(currentToken)) {
                sendPresence(this, token, true, false);
            } else if (!isValidToken(currentToken)) {
                sendPresence(this, token, false, false);
            }
        }
    }

    private void stopUnavailable() {
        setStartRequested(this, false);
        removeLocationUpdates();
        stopSelf();
    }

    private static void expireAuthorization(
        Context context,
        String rejectedToken
    ) {
        Context app = context.getApplicationContext();

        if (!rejectedToken.equals(readToken(app))) {
            return;
        }

        clearToken(app);
        stop(app);

        Intent event = new Intent(ACTION_AUTHORIZATION_EXPIRED);
        event.setPackage(app.getPackageName());
        app.sendBroadcast(event);
    }

    private static int post(String token, JSONObject body) {
        HttpURLConnection connection = null;

        try {
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            connection = (HttpURLConnection) new URL(ENDPOINT)
                .openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(15_000);
            connection.setReadTimeout(20_000);
            connection.setDoOutput(true);
            connection.setUseCaches(false);
            connection.setRequestProperty(
                "Content-Type",
                "application/json; charset=utf-8"
            );
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty(
                "Authorization",
                "Bearer " + token
            );
            connection.setFixedLengthStreamingMode(bytes.length);

            try (OutputStream output = connection.getOutputStream()) {
                output.write(bytes);
            }

            int status = connection.getResponseCode();
            closeResponse(connection, status);
            return status;
        } catch (IOException exception) {
            return 0;
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private static void closeResponse(
        HttpURLConnection connection,
        int status
    ) {
        InputStream input = null;

        try {
            input = status >= 400
                ? connection.getErrorStream()
                : connection.getInputStream();

            if (input == null) {
                return;
            }

            byte[] buffer = new byte[512];

            while (input.read(buffer) != -1) {
                // O conteúdo não é necessário.
            }
        } catch (IOException ignored) {
            // O código HTTP já foi obtido.
        } finally {
            if (input != null) {
                try {
                    input.close();
                } catch (IOException ignored) {
                    // Nada a fazer.
                }
            }
        }
    }

    private static String timestamp(Date date) {
        SimpleDateFormat format = new SimpleDateFormat(
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            Locale.US
        );
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(date);
    }

    private static SharedPreferences preferences(Context context) {
        return context.getApplicationContext().getSharedPreferences(
            PREFS,
            Context.MODE_PRIVATE
        );
    }

    private static void setStartRequested(
        Context context,
        boolean requested
    ) {
        preferences(context).edit().putBoolean(
            START_REQUESTED,
            requested
        ).apply();
    }

    private static void cancelNotification(Context context) {
        NotificationManager manager = (NotificationManager)
            context.getSystemService(Context.NOTIFICATION_SERVICE);

        if (manager != null) {
            manager.cancel(NOTIFICATION_ID);
        }
    }
}