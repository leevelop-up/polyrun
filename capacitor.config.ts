import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.polyrun.app',
  appName: '런트립',
  webDir: 'dist',
  android: {
    // Android 15+ 는 앱을 상태바·내비게이션 바 밑까지 그린다(edge-to-edge).
    // 화면이 시스템 바와 겹치지 않게(시계와 제목, 내비게이션 바·광고와 하단 버튼) 그 안쪽에만 그린다
    adjustMarginsForEdgeToEdge: 'force'
  },
  plugins: {
    AdMob: {
      appId: 'ca-app-pub-8432922669855664~4570632564' // 런트립 AdMob 앱 ID
    }
  }
};

export default config;
