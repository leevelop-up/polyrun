import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.polyrun.app',
  appName: '런플리',
  webDir: 'dist',
  plugins: {
    AdMob: {
      appId: 'ca-app-pub-8432922669855664~4570632564' // PolyRun 앱 ID
    }
  }
};

export default config;
