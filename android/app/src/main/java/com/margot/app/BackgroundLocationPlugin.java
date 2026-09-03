package com.margot.app;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "BackgroundLocation",
    permissions = {
        @Permission(
            alias = "location",
            strings = {
                Manifest.permission.ACCESS_COARSE_LOCATION,
                Manifest.permission.ACCESS_FINE_LOCATION
            }
        )
    }
)
public final class BackgroundLocationPlugin extends Plugin {

    private static final String LOCATION_PERMISSION = "location";
    private boolean receiverRegistered;

    private final BroadcastReceiver authorizationEvents =
        new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (
                    intent != null &&
                    BackgroundLocationService.ACTION_AUTHORIZATION_EXPIRED
                        .equals(intent.getAction())
                ) {
                    JSObject data = new JSObject();
                    data.put("expired", true);

                    notifyListeners(
                        "backgroundLocationAuthorizationExpired",
                        data,
                        true
                    );
                }
            }
        };

    @Override
    public void load() {
        IntentFilter filter = new IntentFilter(
            BackgroundLocationService.ACTION_AUTHORIZATION_EXPIRED
        );

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(
                authorizationEvents,
                filter,
                Context.RECEIVER_NOT_EXPORTED
            );
        } else {
            //noinspection UnspecifiedRegisterReceiverFlag
            getContext().registerReceiver(
                authorizationEvents,
                filter
            );
        }

        receiverRegistered = true;
    }

    @Override
    protected void handleOnDestroy() {
        if (!receiverRegistered) {
            return;
        }

        try {
            getContext().unregisterReceiver(
                authorizationEvents
            );
        } catch (IllegalArgumentException ignored) {
            /*
             * O recetor já tinha sido removido pelo sistema.
             */
        }

        receiverRegistered = false;
    }

    @PluginMethod
    public void start(PluginCall call) {
        String suppliedToken =
            call.getString("token");

        String token =
            suppliedToken == null
                ? ""
                : suppliedToken.trim();

        if (
            !BackgroundLocationService.isValidToken(
                token
            )
        ) {
            call.reject(
                "O token da localização é inválido."
            );

            return;
        }

        Boolean option =
            call.getBoolean("visible");

        boolean visible =
            option != null
                ? option
                : BackgroundLocationService.isVisible(
                    getContext()
                );

        BackgroundLocationService.saveToken(
            getContext(),
            token
        );

        BackgroundLocationService.setVisible(
            getContext(),
            visible
        );

        if (!visible) {
            BackgroundLocationService.stop(
                getContext()
            );

            BackgroundLocationService.sendPresence(
                getContext(),
                token,
                true,
                false
            );

            call.resolve(
                statusData()
            );

            return;
        }

        ensureStarted(
            call
        );
    }

    @PluginMethod
    public void stop(PluginCall call) {
        String token =
            BackgroundLocationService.readToken(
                getContext()
            );

        BackgroundLocationService.setVisible(
            getContext(),
            false
        );

        BackgroundLocationService.stop(
            getContext()
        );

        if (
            BackgroundLocationService.isValidToken(
                token
            )
        ) {
            BackgroundLocationService.sendPresence(
                getContext(),
                token,
                false,
                false
            );
        }

        BackgroundLocationService.clearToken(
            getContext()
        );

        JSObject result =
            statusData();

        result.put(
            "active",
            false
        );

        result.put(
            "background_enabled",
            false
        );

        result.put(
            "token_stored",
            false
        );

        call.resolve(
            result
        );
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(
            statusData()
        );
    }

    @PluginMethod
    public void setVisibility(
        PluginCall call
    ) {
        Boolean option =
            call.getBoolean("visible");

        if (option == null) {
            call.reject(
                "Não foi indicado o estado de visibilidade."
            );

            return;
        }

        boolean visible =
            option;

        String token =
            BackgroundLocationService.readToken(
                getContext()
            );

        BackgroundLocationService.setVisible(
            getContext(),
            visible
        );

        if (!visible) {
            BackgroundLocationService.stop(
                getContext()
            );

            if (
                BackgroundLocationService.isValidToken(
                    token
                )
            ) {
                BackgroundLocationService.sendPresence(
                    getContext(),
                    token,
                    true,
                    false
                );
            }

            call.resolve(
                statusData()
            );

            return;
        }

        if (
            !BackgroundLocationService.isValidToken(
                token
            )
        ) {
            call.resolve(
                statusData()
            );

            return;
        }

        ensureStarted(
            call
        );
    }

    @PluginMethod
    public void openSettings(
        PluginCall call
    ) {
        Intent intent;

        if (
            !BackgroundLocationService.isLocationEnabled(
                getContext()
            )
        ) {
            intent =
                new Intent(
                    Settings.ACTION_LOCATION_SOURCE_SETTINGS
                );
        } else {
            intent =
                new Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.fromParts(
                        "package",
                        getContext().getPackageName(),
                        null
                    )
                );
        }

        try {
            if (
                getActivity() != null
            ) {
                getActivity().startActivity(
                    intent
                );
            } else {
                intent.addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK
                );

                getContext().startActivity(
                    intent
                );
            }

            JSObject result =
                new JSObject();

            result.put(
                "opened",
                true
            );

            call.resolve(
                result
            );
        } catch (
            RuntimeException exception
        ) {
            call.reject(
                "Não foi possível abrir as definições.",
                exception
            );
        }
    }

    @PermissionCallback
    private void locationPermissionResult(
        PluginCall call
    ) {
        if (call == null) {
            return;
        }

        if (canRun()) {
            resolveAfterStarting(
                call
            );
        } else {
            BackgroundLocationService.stop(
                getContext()
            );

            call.resolve(
                statusData()
            );
        }
    }

    private void ensureStarted(
        PluginCall call
    ) {
        if (
            !BackgroundLocationService.isLocationEnabled(
                getContext()
            )
        ) {
            BackgroundLocationService.stop(
                getContext()
            );

            call.resolve(
                statusData()
            );

            return;
        }

        if (
            !BackgroundLocationService.hasLocationPermission(
                getContext()
            )
        ) {
            BackgroundLocationService.stop(
                getContext()
            );

            if (
                BackgroundLocationService.wasPermissionRequested(
                    getContext()
                )
            ) {
                call.resolve(
                    statusData()
                );

                return;
            }

            BackgroundLocationService.setPermissionRequested(
                getContext(),
                true
            );

            requestPermissionForAlias(
                LOCATION_PERMISSION,
                call,
                "locationPermissionResult"
            );

            return;
        }

        resolveAfterStarting(
            call
        );
    }

    private void resolveAfterStarting(
        PluginCall call
    ) {
        try {
            BackgroundLocationService.start(
                getContext()
            );

            call.resolve(
                statusData()
            );
        } catch (
            RuntimeException exception
        ) {
            JSObject result =
                statusData();

            result.put(
                "success",
                false
            );

            result.put(
                "error",
                exception.getLocalizedMessage() == null
                    ? "Não foi possível iniciar a localização em segundo plano."
                    : exception.getLocalizedMessage()
            );

            call.resolve(
                result
            );
        }
    }

    private boolean canRun() {
        return
            BackgroundLocationService.isVisible(
                getContext()
            ) &&
            BackgroundLocationService.isLocationEnabled(
                getContext()
            ) &&
            BackgroundLocationService.hasLocationPermission(
                getContext()
            ) &&
            BackgroundLocationService.isValidToken(
                BackgroundLocationService.readToken(
                    getContext()
                )
            );
    }

    private JSObject statusData() {
        boolean locationEnabled =
            BackgroundLocationService.isLocationEnabled(
                getContext()
            );

        boolean locationGranted =
            BackgroundLocationService.hasLocationPermission(
                getContext()
            );

        boolean fineGranted =
            BackgroundLocationService.hasFineLocationPermission(
                getContext()
            );

        boolean permissionRequested =
            BackgroundLocationService.wasPermissionRequested(
                getContext()
            );

        boolean visible =
            BackgroundLocationService.isVisible(
                getContext()
            );

        boolean active =
            visible &&
            locationEnabled &&
            locationGranted &&
            BackgroundLocationService.isRunningOrRequested(
                getContext()
            );

        String permission;

        if (!locationEnabled) {
            permission =
                "disabled";
        } else if (fineGranted) {
            permission =
                "precise";
        } else if (locationGranted) {
            permission =
                "approximate";
        } else if (permissionRequested) {
            permission =
                "denied";
        } else {
            permission =
                "not_determined";
        }

        JSObject result =
            new JSObject();

        result.put(
            "success",
            true
        );

        result.put(
            "active",
            active
        );

        result.put(
            "permission",
            permission
        );

        result.put(
            "authorization",
            locationGranted
                ? "granted"
                : permissionRequested
                    ? "denied"
                    : "not_determined"
        );

        result.put(
            "background_enabled",
            active
        );

        result.put(
            "token_stored",
            BackgroundLocationService.isValidToken(
                BackgroundLocationService.readToken(
                    getContext()
                )
            )
        );

        result.put(
            "visible",
            visible
        );

        result.put(
            "requires_settings",
            visible &&
            (
                !locationEnabled ||
                (
                    !locationGranted &&
                    permissionRequested
                )
            )
        );

        result.put(
            "notification_required",
            true
        );

        return result;
    }
}