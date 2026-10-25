package com.margot.app;

import android.Manifest;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.Priority;
import com.getcapacitor.JSObject;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.BroadcastReceiver;
import android.content.IntentFilter;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.hardware.Sensor;
import android.hardware.SensorManager;
import android.hardware.TriggerEvent;
import android.hardware.TriggerEventListener;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import java.io.IOException;
import java.io.ByteArrayOutputStream;
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
import org.json.JSONException;
import org.json.JSONObject;

public final class BackgroundLocationService extends Service implements LocationListener {
    public static final String ACTION_AUTHORIZATION_EXPIRED = "com.margot.app.backgroundlocation.AUTHORIZATION_EXPIRED";

    private static final String PREFS = "margot_background_location";
    private static final String TOKEN = "token";
    private static final String MEMBER_ID = "member_id";
    private static final String COLLECTION_SUSPENDED = "collection_suspended";
    private static final String VISIBLE = "visible";
    private static final String PERMISSION_REQUESTED = "permission_requested";
    private static final String START_REQUESTED = "start_requested";
    private static final String APP_IN_BACKGROUND = "app_in_background";

    private static final String ENDPOINT = "https://margot-app.com/background-location-update/";
    private static final String CHANNEL_ID = "margot_background_location";
    private static final int NOTIFICATION_ID = 41027;

    private static final String POLICY = "location_policy_v1";
    private static volatile BackgroundLocationService instance;
    private LocationPolicy policy = new LocationPolicy();
    private FusedLocationProviderClient fused;
    private boolean fusedRegistered;
    private volatile boolean destroyed;
    private LocationAcquisitionPolicy acquisition = new LocationAcquisitionPolicy(SystemClock.elapsedRealtime());
    private SensorManager sensorManager;
    private Sensor motionSensor;
    private boolean motionArmed;
    private boolean providerReceiverRegistered;
    private final BroadcastReceiver providerEvents = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (destroyed || !running) return;
            if (!hasTrackingConsent(context)) { stopUnavailable(); return; }
            if (isLocationEnabled(context)) refreshAcquisition(true);
            else { removeLocationUpdates(); disarmMotion(); }
        }
    };
    private final TriggerEventListener motionListener = new TriggerEventListener() {
        @Override public void onTrigger(TriggerEvent event) {
            mainHandler.post(() -> {
                motionArmed = false;
                if (destroyed || !canRun(BackgroundLocationService.this)) return;
                acquisition.motion(SystemClock.elapsedRealtime());
                policy.motionDetected();
                refreshAcquisition(true);
            });
        }
    };
    private final LocationCallback burstCallback = new LocationCallback() {
        @Override public void onLocationResult(LocationResult result) {
            for (Location location : result.getLocations()) onLocationChanged(location);
        }
    };
    private final Runnable stopFallbackBurst = () -> {
        if (!destroyed && acquisition.quiet && !fusedRegistered) {
            removeLocationUpdates();
            try { registerFallback(); } catch (RuntimeException error) { stopUnavailable(); }
        }
    };
    private final Runnable acquisitionTick = new Runnable() {
        @Override public void run() {
            if (destroyed || !running) return;
            refreshAcquisition(false);
            if (acquisition.beginBurst(SystemClock.elapsedRealtime())) requestPrecisionBurst();
            mainHandler.postDelayed(this, 30_000);
        }
    };
    private String ownerToken = "";
    private String ownerMemberId = "";
    private volatile int generation;
    private int registrationGeneration;
    private final LocationCallback fusedCallback = new LocationCallback() {
        @Override public void onLocationResult(LocationResult result) {
            for (Location location : result.getLocations()) onLocationChanged(location);
        }
    };

    private static final Pattern TOKEN_PATTERN = Pattern.compile("^[A-Fa-f0-9]{64}$");

    private static final ExecutorService NETWORK = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "MargotBackgroundLocation");
        thread.setDaemon(true);
        return thread;
    });

    private static volatile boolean running;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private LocationManager locationManager;
    private boolean updatesRegistered;
    private boolean sending;
    private Location lastUsableLocation;
    private final Runnable retry = () -> {
        if (!destroyed && canRun(this) && lastUsableLocation != null && !sending) {
            sendLocation(new Location(lastUsableLocation));
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        restorePolicy();
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        sensorManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        if (sensorManager != null) motionSensor = sensorManager.getDefaultSensor(Sensor.TYPE_SIGNIFICANT_MOTION);
        IntentFilter providerFilter = new IntentFilter(LocationManager.MODE_CHANGED_ACTION);
        providerFilter.addAction(LocationManager.PROVIDERS_CHANGED_ACTION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(providerEvents, providerFilter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(providerEvents, providerFilter);
        }
        providerReceiverRegistered = true;
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
            String token = readToken(this);
            String memberId = readMemberId(this);
            if (!token.equals(ownerToken) || !memberId.equals(ownerMemberId)) {
                generation++; ownerToken = token; ownerMemberId = memberId; sending = false; lastUsableLocation = null;
                policy = new LocationPolicy(); restorePolicy(); mainHandler.removeCallbacks(retry);
                acquisition = new LocationAcquisitionPolicy(SystemClock.elapsedRealtime());
                removeLocationUpdates(); disarmMotion();
            }
            registerLocationUpdates();
            running = true;
            mainHandler.removeCallbacks(acquisitionTick);
            mainHandler.post(acquisitionTick);
            return START_STICKY;
        } catch (SecurityException | IllegalStateException exception) {
            stopUnavailable();
            return START_NOT_STICKY;
        }
    }

    @Override
    public void onDestroy() {
        destroyed = true;
        generation++;
        mainHandler.removeCallbacks(retry);
        mainHandler.removeCallbacks(acquisitionTick);
        mainHandler.removeCallbacks(stopFallbackBurst);
        disarmMotion();
        if (providerReceiverRegistered) {
            unregisterReceiver(providerEvents);
            providerReceiverRegistered = false;
        }
        if (instance == this) instance = null;
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
        if (destroyed || !canRun(this) || !usable(location)) return;
        if (!policy.observe(fix(location),System.currentTimeMillis(),SystemClock.elapsedRealtime())) return;
        boolean wasQuiet = acquisition.quiet;
        acquisition.observe(fix(location), SystemClock.elapsedRealtime());
        lastUsableLocation = new Location(location);
        refreshAcquisition(wasQuiet != acquisition.quiet);
        if (!sending) sendLocation(new Location(location));
    }

    @Override
    public void onProviderDisabled(String provider) {
        if (!isLocationEnabled(this)) { removeLocationUpdates(); disarmMotion(); }
        else if (!fusedRegistered) {
            removeLocationUpdates();
            try { registerFallback(); } catch (RuntimeException unavailable) { stopUnavailable(); }
        }
    }

    @Override
    public void onProviderEnabled(String provider) {
        if (!fusedRegistered && !destroyed && canRun(this)) {
            removeLocationUpdates();
            try { registerFallback(); } catch (RuntimeException unavailable) { stopUnavailable(); }
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onStatusChanged(String provider, int status, Bundle extras) {
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
            throw exception;
        }
    }

    public static void stop(Context context) {
        Context app = context.getApplicationContext();
        setStartRequested(app, false);
        app.stopService(new Intent(app, BackgroundLocationService.class));
        cancelNotification(app);
    }

    public static boolean isStartRequested(Context context) {
        return preferences(context).getBoolean(START_REQUESTED, false);
    }

    public static boolean hasBackgroundLocationPermission(Context context) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
            || context.checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    public static boolean shouldResume(Context context) { return !running && preferences(context).getBoolean(START_REQUESTED, false) && canRun(context); }

    public static boolean isRunningOrRequested(Context context) {
        return running;
    }

    public static boolean isValidToken(String token) {
        return token != null && TOKEN_PATTERN.matcher(token).matches();
    }

    public static void saveOwner(Context context, String token, String memberId) {
        SharedPreferences.Editor editor = preferences(context).edit().putString(TOKEN, token)
            .putBoolean(COLLECTION_SUSPENDED, false);
        if (memberId == null || memberId.trim().isEmpty()) editor.remove(MEMBER_ID);
        else editor.putString(MEMBER_ID, memberId.trim());
        editor.apply();
    }

    public static boolean isCollectionSuspended(Context context) {
        return preferences(context).getBoolean(COLLECTION_SUSPENDED, false);
    }

    public static String readMemberId(Context context) {
        return preferences(context).getString(MEMBER_ID, "");
    }

    public static String readToken(Context context) {
        return preferences(context).getString(TOKEN, "");
    }

    public static void clearToken(Context context) {
        preferences(context).edit().remove(TOKEN).remove(MEMBER_ID).remove(COLLECTION_SUSPENDED).apply();
    }

    public static void setVisible(Context context, boolean visible) {
        preferences(context).edit().putBoolean(VISIBLE, visible).apply();
    }

    public static boolean isVisible(Context context) {
        return preferences(context).getBoolean(VISIBLE, true);
    }

    public static void setAppInBackground(Context context, boolean background) {
        preferences(context).edit().putBoolean(APP_IN_BACKGROUND, background).apply();
        BackgroundLocationService service = instance;
        if (service != null) service.mainHandler.post(() -> service.refreshAcquisition(false));
    }

    public static boolean isAppInBackground(Context context) {
        return preferences(context).getBoolean(APP_IN_BACKGROUND, false);
    }

    public static void sendAppState(Context context, boolean background) {
        Context app = context.getApplicationContext();
        String token = readToken(app);

        if (!isValidToken(token)) {
            return;
        }

        JSONObject body = new JSONObject();

        try {
            body.put("state_only", true);
            body.put("app_state", background ? "background" : "foreground");
            body.put("timestamp", timestamp(new Date()));
        } catch (JSONException exception) {
            return;
        }

        NETWORK.execute(() -> {
            LocationUploadResult response = post(token, body);

            if (response.authorizationExpired) {
                expireAuthorization(app, token);
            }
        });
    }

    public static void setPermissionRequested(Context context, boolean requested) {
        preferences(context).edit().putBoolean(PERMISSION_REQUESTED, requested).apply();
    }

    public static boolean wasPermissionRequested(Context context) {
        return preferences(context).getBoolean(PERMISSION_REQUESTED, false);
    }

    public static boolean hasLocationPermission(Context context) {
        return hasFineLocationPermission(context)
            || context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
    }

    public static boolean hasFineLocationPermission(Context context) {
        return context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
    }

    public static boolean isLocationEnabled(Context context) {
        LocationManager manager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);

        if (manager == null) {
            return false;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return manager.isLocationEnabled();
        }

        try {
            return manager.isProviderEnabled(LocationManager.GPS_PROVIDER)
                || manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        } catch (RuntimeException exception) {
            return false;
        }
    }

    public static void sendPresence(Context context, String token, boolean active, boolean visible) {
        if (!isValidToken(token)) {
            return;
        }

        Context app = context.getApplicationContext();
        JSONObject body = new JSONObject();

        try {
            body.put("active", active);
            body.put("visible", visible);
            body.put("app_state", isAppInBackground(app) ? "background" : "foreground");
            body.put("timestamp", timestamp(new Date()));
        } catch (JSONException exception) {
            return;
        }

        NETWORK.execute(() -> {
            LocationUploadResult response = post(token, body);

            if (response.authorizationExpired) {
                expireAuthorization(app, token);
            }
        });
    }

    public static Map<String, Double> parsePolicy(JSONObject object) {
        Map<String, Double> values = new HashMap<>();
        if (object == null) return values;
        Iterator<String> keys = object.keys();
        while (keys.hasNext()) {
            String key = keys.next(); Object value = object.opt(key);
            if (!(value instanceof Number)) return new HashMap<>();
            values.put(key,((Number)value).doubleValue());
        }
        return values;
    }

    public static boolean configure(Context context, JSONObject object) {
        Map<String,Double> values = parsePolicy(object);
        LocationPolicy validation = new LocationPolicy();
        if (!validation.configure(values)) return false;
        preferences(context).edit().putString(POLICY,object.toString()).apply();
        BackgroundLocationService service = instance;
        if (service != null) {
            double previous = service.policy.androidRequestMs;
            service.policy.configure(values);
            if (previous != service.policy.androidRequestMs && running) {
                service.removeLocationUpdates();
                try { service.registerLocationUpdates(); } catch (RuntimeException error) { service.stopUnavailable(); }
            }
        }
        return true;
    }

    private void restorePolicy() {
        try { policy.configure(parsePolicy(new JSONObject(preferences(this).getString(POLICY,"{}")))); }
        catch (JSONException ignored) { }
    }

    public static JSObject cachedLocation() {
        JSObject result = new JSObject(); result.put("available",false);
        BackgroundLocationService service = instance;
        if (service == null || !running || !canRun(service)) return result;
        Location l = service.lastUsableLocation;
        if (!usable(l) || System.currentTimeMillis()-l.getTime()>10_000) return result;
        JSObject coords = new JSObject();
        coords.put("latitude",l.getLatitude()); coords.put("longitude",l.getLongitude());
        coords.put("accuracy",l.getAccuracy()); result.put("coords",coords);
        result.put("available",true); result.put("timestamp",l.getTime()); return result;
    }

    public static JSObject diagnostics() {
        JSObject result = new JSObject(); result.put("policy_version",LocationPolicy.VERSION);
        BackgroundLocationService service = instance;
        if (service == null) { result.put("mode","stopped"); return result; }
        LocationPolicy p = service.policy;
        result.put("mode",p.stationary?"stationary":"moving_or_unknown");
        result.put("locations_received",p.received); result.put("locations_rejected",p.rejected);
        result.put("upload_attempts",p.attempts); result.put("upload_successes",p.successes);
        result.put("upload_failures",p.failures); result.put("moving_send_seconds",p.movingSendMs/1000);
        result.put("stationary_send_seconds",p.stationarySendMs/1000);
        if (p.latest != null) result.put("last_capture_age_seconds",Math.max(0,(System.currentTimeMillis()-p.latest.capturedAt)/1000));
        if (p.lastSent != null) result.put("last_acknowledged_capture_ms",p.lastSent.capturedAt);
        result.put("provider",service.fusedRegistered?"fused":"platform");
        result.put("acquisition_mode",service.acquisition.quiet?"balanced_with_bursts":"high_accuracy");
        result.put("motion_sensor_available",service.motionSensor != null);
        return result;
    }

    private static boolean hasTrackingConsent(Context context) {
        return isVisible(context) && !isCollectionSuspended(context)
            && hasLocationPermission(context) && isValidToken(readToken(context));
    }

    private static boolean canRun(Context context) {
        return hasTrackingConsent(context) && isLocationEnabled(context);
    }

    private void startAsForeground() {
        Notification notification = buildNotification();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager manager = getSystemService(NotificationManager.class);

        if (manager == null) {
            return;
        }

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID, getString(R.string.background_location_channel_name), NotificationManager.IMPORTANCE_LOW);
        channel.setDescription(getString(R.string.background_location_channel_description));
        channel.enableVibration(false);
        channel.setSound(null, null);
        channel.setShowBadge(false);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        manager.createNotificationChannel(channel);
    }

    private Notification buildNotification() {
        Intent openApp = new Intent(this, MainActivity.class);
        openApp.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        PendingIntent contentIntent = PendingIntent.getActivity(
            this, 0, openApp, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder builder;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this).setPriority(Notification.PRIORITY_LOW);
        }

        return builder.setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle(getString(R.string.background_location_notification_title))
            .setContentText(getString(R.string.background_location_notification_text))
            .setContentIntent(contentIntent)
            .setCategory(Notification.CATEGORY_SERVICE)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .build();
    }

    private void registerLocationUpdates() {
        if (updatesRegistered || destroyed) return;
        if (GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(this) == ConnectionResult.SUCCESS) {
            fused = LocationServices.getFusedLocationProviderClient(this);
            LocationRequest request = new LocationRequest.Builder(acquisition.quiet ? Priority.PRIORITY_BALANCED_POWER_ACCURACY : Priority.PRIORITY_HIGH_ACCURACY,
                (long)policy.androidRequestMs)
                .setMinUpdateIntervalMillis((long)policy.androidRequestMs)
                .setMinUpdateDistanceMeters(0).setMaxUpdateDelayMillis(0)
                .setMaxUpdateAgeMillis(10_000).setWaitForAccurateLocation(true).build();
            updatesRegistered = true;
            fusedRegistered = true;
            int registration = ++registrationGeneration;
            try {
                fused.requestLocationUpdates(request,fusedCallback,Looper.getMainLooper())
                    .addOnFailureListener(error -> mainHandler.post(() -> {
                        if (destroyed || registration != registrationGeneration || !fusedRegistered) return;
                        removeLocationUpdates();
                        try { registerFallback(); } catch (RuntimeException unavailable) { stopUnavailable(); }
                    }));
            } catch (SecurityException denied) {
                // Permission may be revoked between canRun() and the provider request.
                removeLocationUpdates();
                throw denied;
            }
            return;
        }
        registerFallback();
    }

    private void registerFallback() {
        if (locationManager == null || destroyed) return;
        // Without Google Play Services preserve GPS + network coverage, including indoors.
        // The normal fused path uses one request and lets Android combine the sources.
        boolean registered = registerProvider(LocationManager.NETWORK_PROVIDER);
        if ((!acquisition.quiet || !registered) && hasFineLocationPermission(this)) {
            registered = registerProvider(LocationManager.GPS_PROVIDER) || registered;
        }
        if (!registered) throw new IllegalStateException("Não existe um fornecedor de localização disponível.");
        updatesRegistered = true;
        Location cached = newestLastKnownLocation();
        if (cached != null) onLocationChanged(cached);
    }

    private boolean registerProvider(String provider) {
        try {
            if (!locationManager.isProviderEnabled(provider)) return false;
            // No distance gate: a stationary member still needs genuinely fresh presence.
            locationManager.requestLocationUpdates(provider,(long)policy.androidRequestMs,0,
                this,Looper.getMainLooper());
            return true;
        } catch (IllegalArgumentException | SecurityException exception) { return false; }
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
        registrationGeneration++;
        mainHandler.removeCallbacks(stopFallbackBurst);
        if (fused != null) fused.removeLocationUpdates(burstCallback);
        if (fusedRegistered && fused != null) {
            fusedRegistered = false;
            fused.removeLocationUpdates(fusedCallback);
        }
        if (locationManager != null) {
            try { locationManager.removeUpdates(this); } catch (SecurityException ignored) { }
        }
        updatesRegistered = false;
    }

    private void refreshAcquisition(boolean force) {
        if (destroyed || !running || !canRun(this)) return;
        boolean background = isAppInBackground(this);
        if (background && (policy.stationary || acquisition.quiet) && !motionArmed
            && sensorManager != null && motionSensor != null) {
            motionArmed = sensorManager.requestTriggerSensor(motionListener, motionSensor);
        }
        // Without a working motion wake-up, keep precision instead of risking missed encounters.
        boolean changed = acquisition.update(background && motionArmed, policy.stationary,
            policy.latest, SystemClock.elapsedRealtime());
        if (changed || force) {
            removeLocationUpdates();
            try { registerLocationUpdates(); } catch (RuntimeException error) { stopUnavailable(); return; }
        }
        if (!acquisition.quiet) disarmMotion();
    }

    private void disarmMotion() {
        if (motionArmed && sensorManager != null) sensorManager.cancelTriggerSensor(motionListener, motionSensor);
        motionArmed = false;
    }

    private void requestPrecisionBurst() {
        if (!canRun(this) || !hasFineLocationPermission(this)) return;
        if (fusedRegistered && fused != null) {
            LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5_000)
                .setMinUpdateIntervalMillis(5_000).setMaxUpdateAgeMillis(0)
                .setDurationMillis(LocationAcquisitionPolicy.BURST_MS).setWaitForAccurateLocation(true).build();
            try {
                fused.requestLocationUpdates(request, burstCallback, Looper.getMainLooper())
                    .addOnFailureListener(error -> { /* The balanced request remains active. */ });
            } catch (SecurityException denied) {
                if (!hasLocationPermission(this)) stopUnavailable();
            }
        } else if (locationManager != null && registerProvider(LocationManager.GPS_PROVIDER)) {
            mainHandler.removeCallbacks(stopFallbackBurst);
            mainHandler.postDelayed(stopFallbackBurst, LocationAcquisitionPolicy.BURST_MS);
        }
    }

    private static LocationPolicy.Fix fix(Location location) {
        return new LocationPolicy.Fix(location.getLatitude(),location.getLongitude(),
            location.hasAccuracy()?location.getAccuracy():-1,location.getTime(),
            location.hasSpeed()?location.getSpeed():-1);
    }

    private static boolean usable(Location location) {
        if (location == null || !LocationPolicy.usable(fix(location),System.currentTimeMillis())) return false;
        long age = SystemClock.elapsedRealtimeNanos() - location.getElapsedRealtimeNanos();
        return location.getElapsedRealtimeNanos() > 0 && age >= 0 && age <= 90_000_000_000L;
    }

    private void sendLocation(Location location) {
        String token = readToken(this);

        if (destroyed || sending || !canRun(this) || !usable(location)
            || !policy.shouldSend(fix(location),System.currentTimeMillis(),SystemClock.elapsedRealtime(),false)) {
            return;
        }

        JSONObject body = new JSONObject();

        try {
            body.put("latitude", location.getLatitude());

            body.put("longitude", location.getLongitude());

            body.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : 0);

            body.put("active", true);

            body.put("visible", true);

            body.put("app_state", isAppInBackground(this) ? "background" : "foreground");

            body.put("timestamp", location.getTime());
            body.put("location_policy_version", 1);
        } catch (JSONException exception) {
            return;
        }

        sending = true;
        policy.attempted(SystemClock.elapsedRealtime());
        final int requestGeneration = generation;

        NETWORK.execute(() -> {
            if (destroyed || requestGeneration != generation || !token.equals(readToken(this))) return;
            if (!canRun(this) || !usable(location)) {
                mainHandler.post(() -> {
                    if (destroyed || requestGeneration != generation) return;
                    sending = false;
                    if (!hasTrackingConsent(this)) stopUnavailable();
                    else if (lastUsableLocation != null) sendLocation(new Location(lastUsableLocation));
                });
                return;
            }
            LocationUploadResult response = post(token, body);

            Location sentLocation = new Location(location);

            mainHandler.post(() -> {
                if (!destroyed && requestGeneration == generation && token.equals(readToken(this))) {
                    finishSend(token,response,sentLocation);
                }
            });
        });
    }

    private void finishSend(String token, LocationUploadResult response, Location sentLocation) {
        sending = false;

        if (response.authorizationExpired) {
            expireAuthorization(this, token);

            stopSelf();

            return;
        }

        if (response.collectionDisabled) {
            preferences(this).edit().putBoolean(COLLECTION_SUSPENDED, true).apply();
            stop(this);
            return;
        }

        boolean success = response.accepted;
        if (!success && !response.retryable) policy.declined(SystemClock.elapsedRealtime());
        else policy.completed(fix(sentLocation),SystemClock.elapsedRealtime(),success);
        mainHandler.removeCallbacks(retry);
        if (!success && response.retryable && canRun(this)) {
            mainHandler.postDelayed(retry,(long)policy.retryDelay(SystemClock.elapsedRealtime()));
        } else if (success && lastUsableLocation != null && usable(lastUsableLocation)) {
            sendLocation(new Location(lastUsableLocation));
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
        // A temporary provider/OS failure must not erase the member's choice.
        // Explicit stop, invisibility, logout and revoked tokens still clear it.
        running = false;
        mainHandler.removeCallbacks(acquisitionTick);
        mainHandler.removeCallbacks(stopFallbackBurst);
        disarmMotion();
        mainHandler.removeCallbacks(retry);
        removeLocationUpdates();

        stopSelf();
    }

    private static void expireAuthorization(Context context, String rejectedToken) {
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

    private static LocationUploadResult post(String token, JSONObject body) {
        HttpURLConnection connection = null;

        try {
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);

            connection = (HttpURLConnection) new URL(ENDPOINT).openConnection();

            connection.setRequestMethod("POST");

            connection.setConnectTimeout(15_000);

            connection.setReadTimeout(20_000);

            connection.setDoOutput(true);

            connection.setUseCaches(false);
            connection.setInstanceFollowRedirects(false);

            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");

            connection.setRequestProperty("Accept", "application/json");

            connection.setRequestProperty("Authorization", "Bearer " + token);

            connection.setFixedLengthStreamingMode(bytes.length);

            try (OutputStream output = connection.getOutputStream()) {
                output.write(bytes);
            }

            int status = connection.getResponseCode();

            String text = readResponse(connection, status);
            boolean acknowledged = false, accepted = false;
            String reason = "";
            try {
                JSONObject result = new JSONObject(text);
                acknowledged = Boolean.TRUE.equals(result.opt("success"));
                accepted = !Boolean.FALSE.equals(result.opt("accepted"));
                reason = result.optString("reason", "");
            } catch (JSONException ignored) { /* HTML and empty responses are not acknowledgements. */ }
            return new LocationUploadResult(status, acknowledged, accepted, reason);
        } catch (IOException exception) {
            return new LocationUploadResult(0, false, false);
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private static String readResponse(HttpURLConnection connection, int status) throws IOException {
        InputStream input = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
        if (input == null) return "";
        try (InputStream stream = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[1024];
            int count;
            while ((count = stream.read(buffer)) != -1) {
                if (output.size() + count > 65_536) throw new IOException("Resposta demasiado grande.");
                output.write(buffer, 0, count);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    private static String timestamp(Date date) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);

        format.setTimeZone(TimeZone.getTimeZone("UTC"));

        return format.format(date);
    }

    private static SharedPreferences preferences(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static void setStartRequested(Context context, boolean requested) {
        preferences(context).edit().putBoolean(START_REQUESTED, requested).apply();
    }

    private static void cancelNotification(Context context) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);

        if (manager != null) {
            manager.cancel(NOTIFICATION_ID);
        }
    }
}