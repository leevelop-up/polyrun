// 여행 알림: 출발 전날 저녁, 여행 중 아침에 그날 일정을 알려 준다 (기기 안에서 예약, 서버 없음).
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { Trip } from '../context/TripContext';
import { reminderPlan } from '../utils/today';

const isNative = Capacitor.isNativePlatform();
// 이동 안내(2001, 3001)와 겹치지 않는 번호대
const FIRST_ID = 5000;
const MAX = 200;
const KIND = 'trip-reminder';
// 상태줄 비행기 아이콘(앱 색으로 칠함), 알림 오른쪽에 앱 아이콘 (android/app/src/main/res/drawable*/)
const SMALL_ICON = 'ic_stat_trip';
const LARGE_ICON = 'ic_notif_app';
const ICON_COLOR = '#2F3CF0';
// 알림 권한은 한 번만 묻는다 (거절하면 다시 묻지 않음)
const ASKED_KEY = 'runtrip_reminder_asked';
// 여행 알림 채널: 기본 채널(중요도 보통)은 위에 뜨지 않고 알림창에만 쌓인다. 높음으로 만들어 화면 위에 띄운다
const CHANNEL = 'trip';
let channelReady: Promise<void> | null = null;
const ensureChannel = () =>
  (channelReady ??= Capacitor.getPlatform() === 'android'
    ? LocalNotifications.createChannel({ id: CHANNEL, name: '여행 일정 알림', description: '출발 전날과 여행 중 아침에 그날 일정을 알려 줘요', importance: 4, visibility: 1 }).catch(() => undefined)
    : Promise.resolve());

const askOnce = async (): Promise<boolean> => {
  const perm = await LocalNotifications.checkPermissions();
  if (perm.display === 'granted') return true;
  if (perm.display === 'denied') return false;
  try {
    if (window.localStorage.getItem(ASKED_KEY)) return false;
    window.localStorage.setItem(ASKED_KEY, '1');
  } catch {
    // localStorage 를 못 쓰면 매번 묻지 않도록 그냥 묻는다
  }
  return (await LocalNotifications.requestPermissions()).display === 'granted';
};

// 일정이 바뀔 때마다 예약한 여행 알림을 모두 지우고 다시 예약한다
export const syncReminders = async (trips: Trip[]): Promise<void> => {
  if (!isNative) return;
  try {
    const plan = reminderPlan(trips).slice(0, MAX);
    const pending = (await LocalNotifications.getPending()).notifications.filter((n) => n.extra?.kind === KIND || (n.id >= FIRST_ID && n.id < FIRST_ID + MAX));
    if (pending.length) await LocalNotifications.cancel({ notifications: pending.map((n) => ({ id: n.id })) });
    if (!plan.length || !(await askOnce())) return;
    await ensureChannel();
    await LocalNotifications.schedule({
      notifications: plan.map((r, i) => ({
        id: FIRST_ID + i,
        title: r.title,
        body: r.body,
        largeBody: r.body,
        smallIcon: SMALL_ICON,
        largeIcon: LARGE_ICON,
        iconColor: ICON_COLOR,
        channelId: CHANNEL,
        schedule: { at: new Date(r.at), allowWhileIdle: true },
        extra: { kind: KIND, tripId: r.tripId, day: r.day }
      }))
    });
  } catch (e) {
    console.warn('reminder sync failed', e);
  }
};

// 여행 알림을 눌렀을 때 (앱이 꺼져 있다가 알림으로 켜진 경우도)
export const onReminderTap = (cb: (tripId: string) => void): (() => void) => {
  if (!isNative) return () => undefined;
  const handle = LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
    const x = a.notification.extra;
    if (x?.kind === KIND && typeof x.tripId === 'string') cb(x.tripId);
  });
  return () => {
    handle.then((h) => h.remove()).catch(() => undefined);
  };
};
