package com.polyrun.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import io.capawesome.capacitorjs.plugins.foregroundservice.NotificationActionBroadcastReceiver;

/**
 * 이동 안내 상단 알림에 진행 막대(목적지까지 온 비율)를 넣는다.
 * 포그라운드 서비스는 capawesome 플러그인이 띄우고(위치 추적이 계속 돌게), 같은 알림 번호로 내용만 바꿔 그린다.
 * 그 플러그인의 알림 모양(채널, 아이콘, 탭하면 앱 열기, "안내 종료" 버튼)을 그대로 따른다.
 */
@CapacitorPlugin(name = "NavNotice")
public class NavNoticePlugin extends Plugin {

    // capawesome 플러그인의 기본 채널 (ForegroundService.DEFAULT_NOTIFICATION_CHANNEL_ID)
    private static final String CHANNEL_ID = "default";

    @PluginMethod
    public void update(PluginCall call) {
        Context ctx = getContext();
        int id = call.getInt("id", 2001);
        String title = call.getString("title", "");
        String body = call.getString("body", "");
        // 0~100, 없으면(-1) 막대를 그리지 않는다
        int progress = call.getInt("progress", -1);
        String icon = call.getString("smallIcon", "ic_stat_walk");
        int stopId = call.getInt("stopButtonId", 1);
        String stopTitle = call.getString("stopButtonTitle", "안내 종료");

        int iconRes = ctx.getResources().getIdentifier(icon, "drawable", ctx.getPackageName());
        if (iconRes == 0) iconRes = ctx.getApplicationInfo().icon;

        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(ctx, CHANNEL_ID)
            : new Notification.Builder(ctx);
        b.setContentTitle(title)
            .setContentText(body)
            .setSmallIcon(iconRes)
            .setColor(0xFF2F3CF0)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(openAppIntent(ctx, id));
        if (progress >= 0) b.setProgress(100, Math.min(100, progress), false);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            Intent stop = new Intent(ctx, NotificationActionBroadcastReceiver.class);
            stop.putExtra("buttonId", stopId);
            PendingIntent pi = PendingIntent.getBroadcast(ctx, stopId, stop, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            b.addAction(new Notification.Action.Builder(null, stopTitle, pi).build());
        }

        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(id, b.build());
        call.resolve(new JSObject());
    }

    private PendingIntent openAppIntent(Context ctx, int id) {
        Intent intent = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE : PendingIntent.FLAG_UPDATE_CURRENT;
        return PendingIntent.getActivity(ctx, id, intent, flags);
    }
}
