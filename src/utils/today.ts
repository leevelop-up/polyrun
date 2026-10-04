// 여행 당일·전날: "오늘 일정" 화면에 띄울 여행과, 미리 예약해 둘 알림 목록
import type { Place, Trip } from '../context/TripContext';
import { tripStatus } from './trip';

const DAY_MS = 86400000;
// 전날 저녁 알림, 여행 중 아침 알림 시각
export const EVE_HOUR = 20;
export const MORNING_HOUR = 8;
// 이 기간 안의 알림만 예약한다 (안드로이드는 앱당 예약 알람 수에 한도가 있다)
const PLAN_DAYS = 45;

export type TodayTrip = { trip: Trip; day: number; kind: 'during' | 'tomorrow' };

// 지금 보여 줄 여행: 여행 중인 일정(지금 고른 일정 먼저) → 내일 출발하는 일정
export const findTodayTrip = (trips: Trip[], preferId?: string | null, now = Date.now()): TodayTrip | null => {
  const ordered = [...trips].sort((a, b) => (a.id === preferId ? -1 : b.id === preferId ? 1 : 0));
  for (const t of ordered) {
    const s = tripStatus(t, now);
    if (s.kind === 'during') return { trip: t, day: Math.min(s.day - 1, t.days.length - 1), kind: 'during' };
  }
  for (const t of ordered) {
    const s = tripStatus(t, now);
    if (s.kind === 'before' && s.dDay === 1) return { trip: t, day: 0, kind: 'tomorrow' };
  }
  return null;
};

// "성산일출봉 → 섭지코지 → 우도 외 2곳"
export const placesLine = (list: Place[]): string => {
  if (!list.length) return '아직 일정이 비어 있어요. 추천 일정으로 채워 보세요';
  const head = list.slice(0, 3).map((p) => p.name).join(' → ');
  return list.length > 3 ? head + ' 외 ' + (list.length - 3) + '곳' : head;
};

export type Reminder = { at: number; title: string; body: string; tripId: string; day: number };

// 예약할 알림: 출발 전날 저녁 8시, 여행 중 매일 아침 8시. 이미 지난 시각은 뺀다.
export const reminderPlan = (trips: Trip[], now = Date.now()): Reminder[] => {
  const out: Reminder[] = [];
  const until = now + PLAN_DAYS * DAY_MS;
  for (const t of trips) {
    if (!t.startDate) continue;
    // 알림에는 짧게: 제목, 없으면 "제주, 한국" → "제주"
    const name = t.title?.trim() || t.destination.split(',')[0].trim();
    const start = new Date(t.startDate);
    const eve = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1, EVE_HOUR).getTime();
    out.push({ at: eve, title: '내일 ' + name + ' 여행을 떠나요 ✈️', body: '1일차 · ' + placesLine(t.days[0] || []), tripId: t.id, day: 0 });
    t.days.forEach((list, i) => {
      const at = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, MORNING_HOUR).getTime();
      out.push({ at, title: name + ' ' + (i + 1) + '일차 · 오늘 일정', body: placesLine(list), tripId: t.id, day: i });
    });
  }
  return out.filter((r) => r.at > now && r.at < until).sort((a, b) => a.at - b.at);
};
