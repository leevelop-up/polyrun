import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.polyrun.app',
  appName: '런트립',
  webDir: 'dist',
  android: {
    // Android 15+ edge-to-edge 여백은 MainActivity 에서 직접 준다 (시스템 바 + 키패드 높이).
    // Capacitor 기본 처리(force)는 키패드 높이를 빼지 않아 입력 칸이 키패드에 가려졌다
    adjustMarginsForEdgeToEdge: 'disable'
  },
  plugins: {
    AdMob: {
      appId: 'ca-app-pub-8432922669855664~4570632564' // 런트립 AdMob 앱 ID
    }
  }
};

export default config;
