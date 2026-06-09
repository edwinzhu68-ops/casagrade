package com.casagrade.lottery.merchant;

import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

@CapacitorPlugin(name = "WhatsAppShare")
public class WhatsAppSharePlugin extends Plugin {

    @PluginMethod
    public void share(PluginCall call) {
        String filePath = call.getString("filePath");
        if (filePath == null || filePath.isEmpty()) {
            call.reject("filePath is required");
            return;
        }

        try {
            // 把 file:// 或 content:// 路径转成 File
            File file;
            if (filePath.startsWith("content://") || filePath.startsWith("file://")) {
                Uri uri = Uri.parse(filePath);
                file = new File(uri.getPath());
            } else {
                file = new File(filePath);
            }

            if (!file.exists()) {
                call.reject("File not found: " + filePath);
                return;
            }

            Uri contentUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                file
            );

            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType("image/png");
            intent.setPackage("com.whatsapp");
            intent.putExtra(Intent.EXTRA_STREAM, contentUri);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            // WhatsApp 没安装或其他错误，fallback
            call.reject("WhatsApp not available: " + e.getMessage());
        }
    }
}
