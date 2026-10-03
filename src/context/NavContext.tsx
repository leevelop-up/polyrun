import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Place, Trip, useTrip } from './TripContext';
import { fetchPath } from '../api/geo';
import { cumulative, distM, fmtKm, LatLng, project } from '../utils/nav';
import { clearMoveNotice, Fix, hasLocationPermission, notifyMoveDetected, startTracking, updateNotice, watchQuietly } from '../native/tracking';
import { dayDate, WALK_MAX_MIN } from '../utils/trip';

// 이동 안내: 실제 위치를 따라 지금 구간(현재 위치 → 다음 장소)을 얼마나 왔는지 계산한다.
// 화면을 옮기거나 앱이 백그라운드로 가도(안드로이드 포그라운드 서비스) 계속 돈다.

// 시작할 때 이 거리 안에 있는 장소는 "지금 여기 있다"고 보고 그 다음 장소로 안내한다
const NEAR_M = 150;
// 목적지까지 이 거리 + GPS 오차(최대 60m) 안이면 도착
const ARRIVE_M = 40;
// 도착한 뒤 이만큼 멀어지면 다음 장소로 출발한 것으로 본다
const LEAVE_M = 200;
// 길에서 이만큼 벗어나면 현재 위치에서 길을 다시 찾는다 (너무 자주 묻지 않게 20초 간격)
const OFF_ROUTE_M = 60;
const REROUTE_MS = 20000;
const NOTICE_MS = 8000;
// 안내를 켜기 전 이동 감지: 처음 위치에서 이만큼 움직이면 "이동을 기록할까요?"
const MOVE_M = 150;
// "아니요"나 안내 종료 후 이 시간 동안은 다시 묻지 않는다
const SNOOZE_MS = 30 * 60 * 1000;

export type NavStatus = 'locating' | 'routing' | 'moving' | 'arrived' | 'done';

export interface NavLeg {
  path: [number, number][];
  cum: number[];
  total: number; // m
  duration: number; // 초
  mode: 'walk' | 'car';
  // 길을 못 받아 직선으로 그린 구간
  straight: boolean;
}

export interface NavState {
  tripId: string;
  day: number;
  targetId: string | null;
  status: NavStatus;
  fix: Fix | null;
  leg: NavLeg | null;
  along: number; // 구간 시작점부터 온 거리(m)
  error: string | null;
}

interface NavValue {
  nav: NavState | null;
  startNav: (tripId: string, day: number) => Promise<void>;
  stopNav: () => void;
  // 목적지 바꾸기 (목록에서 장소를 눌렀을 때)
  goTo: (placeId: string) => void;
  // 도착한 장소에서 다음 장소로 출발
  next: () => void;
  // 이동을 감지해서 안내를 시작할지 묻는 중인 일정/일차
  movePrompt: { tripId: string; day: number } | null;
  acceptMove: () => Promise<{ tripId: string; day: number } | null>;
  declineMove: () => void;
}

const NavContext = createContext<NavValue | undefined>(undefined);

type Located = Place & LatLng;
const hasCoord = (p: Place): p is Located => typeof p.lat === 'number' && typeof p.lng === 'number';

export const placesOf = (trips: Trip[], nav: Pick<NavState, 'tripId' | 'day'>): Located[] =>
  (trips.find((t) => t.id === nav.tripId)?.days[nav.day] || []).filter(hasCoord);

// 남은 거리(m)와 시간(분)
// 오늘이 여행의 몇 일차인지 (여행 날이 아니면 -1)
const todayIndex = (trip: Trip): number => {
  const now = new Date();
  return trip.days.findIndex((_, i) => {
    const d = dayDate(trip, i);
    return !!d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  });
};

export const remainingOf = (nav: NavState): { m: number; min: number } | null => {
  const leg = nav.leg;
  if (!leg) return null;
  const m = Math.max(0, leg.total - nav.along);
  return { m, min: leg.total > 0 ? Math.ceil((leg.duration / 60) * (m / leg.total)) : 0 };
};

export const NavProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { trips, activeTrip } = useTrip();
  const [nav, setNav] = useState<NavState | null>(null);
  const [movePrompt, setMovePrompt] = useState<{ tripId: string; day: number } | null>(null);
  const [snoozeUntil, setSnoozeUntil] = useState(0);
  // 위치 콜백은 렌더와 상관없이 불리므로 최신 값을 ref 로도 들고 있는다
  const navRef = useRef<NavState | null>(null);
  const tripsRef = useRef(trips);
  tripsRef.current = trips;
  const stopperRef = useRef<(() => Promise<void>) | null>(null);
  const routeSeq = useRef(0);
  const lastRouteAt = useRef(0);
  const lastNotice = useRef({ text: '', at: 0, status: '' });

  const patch = useCallback((p: Partial<NavState> | null) => {
    navRef.current = p === null || !navRef.current ? null : { ...navRef.current, ...p };
    setNav(navRef.current);
  }, []);

  const endSession = useCallback(() => {
    routeSeq.current++;
    const stop = stopperRef.current;
    stopperRef.current = null;
    navRef.current = null;
    setNav(null);
    if (stop) stop();
  }, []);

  // 사용자가 안내를 끝냄: 바로 다시 "이동을 기록할까요?"를 묻지 않도록 잠시 쉰다
  const stopNav = useCallback(() => {
    endSession();
    setSnoozeUntil(Date.now() + SNOOZE_MS);
  }, [endSession]);

  // 상단 알림 갱신: 상태가 바뀌면 바로, 남은 시간만 바뀌면 8초에 한 번
  const notify = useCallback((n: NavState) => {
    const places = placesOf(tripsRef.current, n);
    const k = places.findIndex((p) => p.id === n.targetId);
    const target = places[k];
    let title = '🚶 이동 안내 중';
    let body = '현재 위치를 찾고 있어요';
    if (n.status === 'done') {
      title = '🎉 오늘 일정 끝';
      body = '마지막 장소에 도착했어요';
    } else if (target && n.status === 'arrived') {
      const nextPlace = places[k + 1];
      title = '📍 ' + target.name + ' 도착!';
      body = nextPlace ? '다음: ' + nextPlace.name + ' · 출발하면 자동으로 안내해요' : '오늘의 마지막 장소예요';
    } else if (target && n.status === 'routing') {
      title = '🚶 ' + target.name + '(으)로 가는 길 찾는 중';
      body = '';
    } else if (target) {
      const r = remainingOf(n);
      if (r) {
        title = '🚶 ' + target.name + '까지 ' + r.min + '분';
        body = fmtKm(r.m) + ' 남음 · ' + (n.leg?.mode === 'car' ? '차량' : '도보') + ' 기준';
      }
    }
    const text = title + '|' + body;
    const now = Date.now();
    const last = lastNotice.current;
    if (text === last.text || (last.status === n.status && now - last.at < NOTICE_MS)) return;
    lastNotice.current = { text, at: now, status: n.status };
    updateNotice(title, body);
  }, []);

  // 현재 위치에서 목적지까지 길을 받아 새 구간을 시작한다
  const planLeg = useCallback(
    async (from: LatLng, target: Located) => {
      const seq = ++routeSeq.current;
      lastRouteAt.current = Date.now();
      if (!navRef.current?.leg) patch({ status: 'routing' });
      let leg: NavLeg;
      try {
        // 걸어서 20분 넘게 걸리면 차량 길로 (시간표의 도보/차량 기준과 같게)
        let path = await fetchPath(from, target, 'foot');
        let mode: NavLeg['mode'] = 'walk';
        if (path.duration / 60 > WALK_MAX_MIN) {
          path = await fetchPath(from, target, 'car');
          mode = 'car';
        }
        const coords = path.coords.length >= 2 ? path.coords : ([[from.lat, from.lng], [target.lat, target.lng]] as [number, number][]);
        const cum = cumulative(coords);
        leg = { path: coords, cum, total: cum[cum.length - 1], duration: path.duration, mode, straight: false };
      } catch {
        // 길찾기 서버가 안 되면 직선으로 그리고 걷는 속도(시속 4.5km)로 어림
        const coords: [number, number][] = [[from.lat, from.lng], [target.lat, target.lng]];
        const cum = cumulative(coords);
        leg = { path: coords, cum, total: cum[1], duration: cum[1] / 1.25, mode: 'walk', straight: true };
      }
      if (seq !== routeSeq.current || !navRef.current || navRef.current.targetId !== target.id) return;
      patch({ leg, along: 0, status: 'moving' });
      notify(navRef.current);
    },
    [patch, notify]
  );

  const setTarget = useCallback(
    (target: Located | undefined) => {
      const n = navRef.current;
      if (!n) return;
      if (!target) {
        routeSeq.current++;
        patch({ targetId: null, leg: null, along: 0, status: 'done' });
        notify(navRef.current!);
        return;
      }
      patch({ targetId: target.id, leg: null, along: 0, status: 'routing' });
      notify(navRef.current!);
      if (n.fix) planLeg(n.fix, target);
    },
    [patch, notify, planLeg]
  );

  const next = useCallback(() => {
    const n = navRef.current;
    if (!n) return;
    const places = placesOf(tripsRef.current, n);
    const k = places.findIndex((p) => p.id === n.targetId);
    setTarget(places[k + 1]);
  }, [setTarget]);

  const goTo = useCallback(
    (placeId: string) => {
      const n = navRef.current;
      if (!n) return;
      setTarget(placesOf(tripsRef.current, n).find((p) => p.id === placeId));
    },
    [setTarget]
  );

  const onFix = useCallback(
    (f: Fix) => {
      const n = navRef.current;
      if (!n) return;
      patch({ fix: f, error: null });
      const places = placesOf(tripsRef.current, n);
      const target = places.find((p) => p.id === n.targetId);

      // 처음 위치를 받았거나 목적지가 일정에서 지워졌으면: 가까운 장소에 있으면 그 다음 장소, 아니면 가장 가까운 장소로
      if (!target && n.status !== 'done') {
        if (!places.length) {
          setTarget(undefined);
          return;
        }
        let ni = 0;
        places.forEach((p, i) => {
          if (distM(f, p) < distM(f, places[ni])) ni = i;
        });
        setTarget(distM(f, places[ni]) < NEAR_M ? places[ni + 1] : places[ni]);
        return;
      }
      if (!target) return;

      const toTarget = distM(f, target);
      if (n.status === 'arrived') {
        if (toTarget > LEAVE_M) next();
        return;
      }
      if (n.status !== 'moving' || !n.leg) return;

      if (toTarget < ARRIVE_M + Math.min(f.accuracy || 0, 60)) {
        patch({ status: 'arrived', along: n.leg.total });
        notify(navRef.current!);
        return;
      }
      const { along, off } = project(n.leg.path, n.leg.cum, f);
      // GPS 가 잠깐 튀어 뒤로 가는 것처럼 보이지 않게 조금만 뒤로 허용
      patch({ along: Math.max(along, n.along - 30) });
      if (off > OFF_ROUTE_M && (f.accuracy || 0) < 50 && Date.now() - lastRouteAt.current > REROUTE_MS) planLeg(f, target);
      notify(navRef.current!);
    },
    [patch, notify, planLeg, setTarget, next]
  );

  const startNav = useCallback(
    async (tripId: string, day: number) => {
      endSession();
      navRef.current = { tripId, day, targetId: null, status: 'locating', fix: null, leg: null, along: 0, error: null };
      setNav(navRef.current);
      lastNotice.current = { text: '', at: 0, status: '' };
      try {
        const stop = await startTracking({
          title: '🚶 이동 안내 중',
          body: '현재 위치를 찾고 있어요',
          onFix,
          onError: (message) => patch({ error: message }),
          onStop: stopNav
        });
        // 권한을 묻는 사이 사용자가 안내를 끝냈으면 바로 멈춘다
        if (!navRef.current || navRef.current.tripId !== tripId) stop();
        else stopperRef.current = stop;
      } catch (e) {
        endSession();
        throw e;
      }
    },
    [endSession, stopNav, onFix, patch]
  );

  // ---------- 이동 감지 ----------
  // 오늘이 여행 날이고 위치 권한이 이미 있으면 조용히 위치를 보다가, 처음 위치에서 150m 넘게 움직이면 묻는다.
  // 앱이 백그라운드에 있으면 알림으로 묻는다 (안드로이드는 백그라운드 위치를 드물게만 주므로 늦을 수 있음)
  const watchDay = !nav && !movePrompt && activeTrip ? todayIndex(activeTrip) : -1;
  const watchTripId = activeTrip && watchDay >= 0 && activeTrip.days[watchDay].some(hasCoord) ? activeTrip.id : null;
  useEffect(() => {
    if (!watchTripId) return;
    let cancelled = false;
    let stop: (() => void) | null = null;
    let anchor: Fix | null = null;
    const timer = setTimeout(async () => {
      if (cancelled || !(await hasLocationPermission())) return;
      const s = await watchQuietly((f) => {
        if (f.accuracy > 100) return;
        if (!anchor) {
          anchor = f;
          return;
        }
        if (distM(anchor, f) < MOVE_M) return;
        setMovePrompt({ tripId: watchTripId, day: watchDay });
        if (document.hidden) notifyMoveDetected();
      });
      if (cancelled) s();
      else stop = s;
    }, Math.max(0, snoozeUntil - Date.now()));
    return () => {
      cancelled = true;
      clearTimeout(timer);
      stop?.();
    };
  }, [watchTripId, watchDay, snoozeUntil]);

  const acceptMove = useCallback(async () => {
    const p = movePrompt;
    setMovePrompt(null);
    clearMoveNotice();
    if (p) await startNav(p.tripId, p.day);
    return p;
  }, [movePrompt, startNav]);

  const declineMove = useCallback(() => {
    setMovePrompt(null);
    clearMoveNotice();
    setSnoozeUntil(Date.now() + SNOOZE_MS);
  }, []);

  // 일정이 지워졌으면 안내를 끝낸다
  useEffect(() => {
    if (nav && !trips.some((t) => t.id === nav.tripId)) stopNav();
  }, [trips, nav, stopNav]);

  useEffect(
    () => () => {
      stopperRef.current?.();
    },
    []
  );

  return <NavContext.Provider value={{ nav, startNav, stopNav, goTo, next, movePrompt, acceptMove, declineMove }}>{children}</NavContext.Provider>;
};

export const useNav = (): NavValue => {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used inside NavProvider');
  return ctx;
};
