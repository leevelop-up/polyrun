package com.polyrun.app;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup.MarginLayoutParams;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 앱 안에 둔 플러그인: 이동 안내 알림의 진행 막대
        registerPlugin(NavNoticePlugin.class);
        super.onCreate(savedInstanceState);

        // 하단 네비게이션 바 배경색을 흰색으로 설정
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            Window window = getWindow();
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setNavigationBarColor(0xFFFFFFFF); // 흰색
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                View decorView = window.getDecorView();
                int flags = decorView.getSystemUiVisibility();
                flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                decorView.setSystemUiVisibility(flags);
            }
        }

        // Android 15+ 는 앱을 상태바·내비게이션 바 밑까지 그린다(edge-to-edge).
        // 웹 화면을 시스템 바 안쪽에만 두고, 키패드가 올라오면 키패드 위까지만 쓰도록 여백을 준다.
        // (Capacitor 의 adjustMarginsForEdgeToEdge 는 키패드 높이를 빼지 않아 입력 칸이 키패드에 가려졌다)
        WebView webView = getBridge().getWebView();
        ViewCompat.setOnApplyWindowInsetsListener(webView, (v, windowInsets) -> {
            Insets bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
            MarginLayoutParams mlp = (MarginLayoutParams) v.getLayoutParams();
            mlp.leftMargin = bars.left;
            mlp.topMargin = bars.top;
            mlp.rightMargin = bars.right;
            mlp.bottomMargin = Math.max(bars.bottom, ime.bottom);
            v.setLayoutParams(mlp);
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(webView);
    }
}
