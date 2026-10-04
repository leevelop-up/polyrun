// 이동 중 위치 추적. 안드로이드에서는 포그라운드 서비스(상단 알림)를 띄워 화면이 꺼지거나
// 다른 앱으로 넘어가도 위치를 계속 받는다. 아이폰은 실시간 현황(Live Activity)과 백그라운드 위치(앱 안 플러그인).
// 웹에서는 브라우저 위치 API를 쓴다(탭이 보일 때만).
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';
import { ForegroundService, ServiceType } from '@capawesome-team/capacitor-android-foreground-service';
import { hasLiveActivity, LiveActivity, LiveContent, NavNotice } from './liveNotice';

export type Fix = { lat: number; lng: number; accuracy: number; at: number };

const isNative = Capacitor.isNativePlatform();
const isAndroid = Capacitor.getPlatform() === 'android';
const NOTICE_ID = 2001;
const STOP_BUTTON = 1;
// 알림 상태줄 아이콘 (android/app/src/main/res/drawable/ic_stat_walk.xml)
const SMALL_ICON = 'ic_stat_walk';

export class LocationDeniedError extends Error {}

// 위치 권한을 확인하고 없으면 묻는다. 거절하면 LocationDeniedError.
const ensureLocationPermission = async () => {
  if (!isNative) return;
  let perm = await Geolocation.checkPermissions();
  if (perm.location !== 'granted') perm = await Geolocation.requestPermissions({ permissions: ['location'] });
  if (perm.location !== 'granted') throw new LocationDeniedError('위치 권한이 필요해요');
};

const startNotice = async (title: string, body: string) => {
  if (hasLiveActivity()) {
    await LiveActivity.start({ title, body, progress: null, short: '' }).catch((e) => console.warn('live activity start failed', e));
    return;
  }
  if (!isAndroid) return;
  try {
    // 안드로이드 13+ 알림 권한. 거절해도 서비스는 돌지만 알림이 보이지 않는다.
    const perm = await ForegroundService.checkPermissions();
    if (perm.display !== 'granted') await ForegroundService.requestPermissions();
    await ForegroundService.startForegroundService({
      id: NOTICE_ID,
      title,
      body,
      smallIcon: SMALL_ICON,
      serviceType: ServiceType.Location,
      silent: true,
      buttons: [{ id: STOP_BUTTON, title: '안내 종료' }]
    });
  } catch (e) {
    console.warn('foreground service start failed', e);
  }
};

// 상단 알림(아이폰은 실시간 현황) 내용 바꾸기. progress(0~1)가 있으면 게이지를 채운다
export const updateNotice = async (c: LiveContent) => {
  if (hasLiveActivity()) {
    await LiveActivity.update(c).catch(() => undefined);
    return;
  }
  if (!isAndroid) return;
  try {
    const progress = c.progress === null ? -1 : Math.round(c.progress * 100);
    await NavNotice.update({ id: NOTICE_ID, title: c.title, body: c.body, progress, smallIcon: SMALL_ICON, stopButtonId: STOP_BUTTON, stopButtonTitle: '안내 종료' });
  } catch {
    // 앱 안 플러그인이 없으면(예전 빌드) 막대 없이
    try {
      await ForegroundService.updateForegroundService({ id: NOTICE_ID, title: c.title, body: c.body, smallIcon: SMALL_ICON, serviceType: ServiceType.Location, silent: true, buttons: [{ id: STOP_BUTTON, title: '안내 종료' }] });
    } catch {
      // 서비스가 이미 멈췄으면 무시
    }
  }
};

// 위치 추적 시작. onStop: 알림의 "안내 종료" 버튼을 눌렀을 때. 돌려준 함수로 멈춘다.
export const startTracking = async (opts: {
  title: string;
  body: string;
  onFix: (f: Fix) => void;
  onError: (message: string) => void;
  onStop: () => void;
}): Promise<() => Promise<void>> => {
  await ensureLocationPermission();
  await startNotice(opts.title, opts.body);

  let listener: PluginListenerHandle | null = null;
  if (isAndroid) {
    listener = await ForegroundService.addListener('buttonClicked', (e) => {
      if (e.buttonId === STOP_BUTTON) opts.onStop();
    }).catch(() => null);
  }

  // 아이폰: 앱이 뒤로 가도 위치를 받도록 앱 안 플러그인이 위치를 보낸다
  if (hasLiveActivity()) {
    const fixListener = await LiveActivity.addListener('fix', opts.onFix);
    await LiveActivity.startLocation();
    return async () => {
      await LiveActivity.stopLocation().catch(() => undefined);
      await fixListener.remove().catch(() => undefined);
      await LiveActivity.end({ title: '이동 안내 종료', body: '' }).catch(() => undefined);
    };
  }

  const watchId = await Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 20000, maximumAge: 3000 }, (pos, err) => {
    if (err || !pos) {
      opts.onError('현재 위치를 받지 못하고 있어요');
      return;
    }
    opts.onFix({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, at: pos.timestamp });
  });

  return async () => {
    await Geolocation.clearWatch({ id: watchId }).catch(() => undefined);
    await listener?.remove().catch(() => undefined);
    if (isAndroid) await ForegroundService.stopForegroundService().catch(() => undefined);
  };
};

// 지금 위치 한 번 받기 (지도의 "현재 위치" 버튼). 권한이 없으면 묻고, 거절하면 LocationDeniedError.
export const getCurrentFix = async (): Promise<Fix> => {
  await ensureLocationPermission();
  const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, at: pos.timestamp };
};

// ---------- 이동 감지 (안내를 시작하기 전) ----------
// 위치 권한을 이미 받은 경우에만 조용히 지켜본다. 앱을 처음 켰을 때 권한을 갑자기 묻지 않기 위함.
export const hasLocationPermission = async (): Promise<boolean> => {
  try {
    return (await Geolocation.checkPermissions()).location === 'granted';
  } catch {
    return false;
  }
};

// 상단 알림 없이 위치만 받는다 (앱이 화면에 있을 때용). 돌려준 함수로 멈춘다.
export const watchQuietly = async (onFix: (f: Fix) => void): Promise<() => void> => {
  const id = await Geolocation.watchPosition({ enableHighAccuracy: false, timeout: 30000, maximumAge: 10000 }, (pos) => {
    if (pos) onFix({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, at: pos.timestamp });
  });
  return () => {
    Geolocation.clearWatch({ id }).catch(() => undefined);
  };
};

// 앱이 화면에 없을 때 "이동을 기록할까요?" 알림. 알림 권한이 이미 있을 때만 (이동 안내를 한 번 써 본 경우)
export const notifyMoveDetected = async () => {
  try {
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') return;
    await LocalNotifications.schedule({
      notifications: [{ id: 3001, title: '🚶 이동 중이신가요?', body: '탭해서 이동을 기록하고 다음 장소까지 안내받으세요', smallIcon: SMALL_ICON }]
    });
  } catch {
    // 알림을 못 띄우면 앱에 돌아왔을 때 화면 안내만 보여준다
  }
};

export const clearMoveNotice = () => LocalNotifications.cancel({ notifications: [{ id: 3001 }] }).catch(() => undefined);
