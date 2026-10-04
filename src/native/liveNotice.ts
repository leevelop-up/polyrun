// 이동 안내 실시간 표시: 목적지까지 온 비율을 게이지로 보여 준다.
// - 안드로이드: 포그라운드 서비스 상단 알림에 진행 막대 (앱 안 플러그인 NavNotice, android/app/src/main/java/com/polyrun/app/NavNoticePlugin.java)
// - 아이폰: 잠금화면·다이내믹 아일랜드의 실시간 현황(Live Activity) (앱 안 플러그인 LiveActivity, ios/App/App/LiveActivityPlugin.swift)
import { Capacitor, PluginListenerHandle, registerPlugin } from '@capacitor/core';

export type LiveContent = {
  title: string;
  body: string;
  // 0~1. 모르면(길 찾는 중) null
  progress: number | null;
  // 다이내믹 아일랜드처럼 좁은 곳에 넣을 짧은 글 ("12분", "도착")
  short: string;
};

interface NavNoticePlugin {
  update(o: { id: number; title: string; body: string; progress: number; smallIcon: string; stopButtonId: number; stopButtonTitle: string }): Promise<void>;
}

interface LiveActivityPlugin {
  start(o: LiveContent): Promise<void>;
  update(o: LiveContent): Promise<void>;
  end(o: { title: string; body: string }): Promise<void>;
  // 백그라운드에서도 위치를 받는다 (아이폰은 앱이 뒤로 가면 웹의 위치 받기가 멈춘다)
  startLocation(): Promise<void>;
  stopLocation(): Promise<void>;
  addListener(event: 'fix', cb: (f: { lat: number; lng: number; accuracy: number; at: number }) => void): Promise<PluginListenerHandle>;
}

export const NavNotice = registerPlugin<NavNoticePlugin>('NavNotice');
export const LiveActivity = registerPlugin<LiveActivityPlugin>('LiveActivity');

export const isIOSNative = Capacitor.getPlatform() === 'ios';
// 아이폰 플러그인은 Xcode 에서 위젯 확장을 붙여야 동작한다 (ios/LIVE_ACTIVITY.md). 없으면 조용히 넘어간다.
export const hasLiveActivity = () => isIOSNative && Capacitor.isPluginAvailable('LiveActivity');
