package com.margot.app;

import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "MargotShare")
public final class MargotSharePlugin extends Plugin {
    @PluginMethod
    public void share(PluginCall call) {
        String url = call.getString("url", "");

        if (!url.matches("https://go\\.margot-app\\.com/invite/[a-f0-9]{16}")) {
            call.reject("Convite inválido.");
            return;
        }

        if (getActivity() == null) {
            call.reject("Não foi possível abrir a partilha agora.");
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                Intent share = new Intent(Intent.ACTION_SEND);

                share.setType("text/plain");
                share.putExtra(Intent.EXTRA_TEXT, url);

                share.putExtra(
                    Intent.EXTRA_TITLE,
                    "Um olá leva a outro · Margot"
                );

                getActivity().startActivity(
                    Intent.createChooser(
                        share,
                        "Partilhar convite"
                    )
                );

                // O Android confirma a abertura do menu,
                // não a entrega ao destinatário.
                JSObject result = new JSObject();

                result.put("opened", true);

                call.resolve(result);
            } catch (Exception error) {
                call.reject(
                    "Não foi possível abrir a partilha agora.",
                    error
                );
            }
        });
    }
}