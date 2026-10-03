import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Place, Trip, useTrip } from './TripContext';
import { fetchPath } from '../api/geo';
import { cumulative, distM, fmtKm, LatLng, project } from '../utils/nav';
import { clearMoveNotice, Fix, hasLocationPermission, notifyMoveDetected, startTracking, updateNotice, watchQuietly } from '../native/tracking';
import { CAR_TRAFFIC_FACTOR, dayDate, WALK_MAX_MIN } from '../utils/trip';

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
// 이보다 멀면(아직 여행지에 가기 전) 길을 찾지 않고 "여행지에 도착하면 안내"로 보여 준다
const FAR_M = 300000;
// 안내를 켜기 전 이동 감지: 처음 위치에서 이만큼 움직이면 "이동을 기록할까요?"
const MOVE_M = 150;
// "아니요"나 안내 종료 후 이 시간 동안은 다시 묻지 않는다
const SNOOZE_MS = 30 * 60 * 1000;
// 실제 이동 속도: 최근 이 시간 동안 길 위에서 나아간 거리로 잰다 (최소 SPEED_MIN_MS 이상 쌓여야 씀)
const SPEED_WINDOW_MS = 120000;
const SPEED_MIN_MS = 30000;
// 이 속도(시속 약 8km)를 넘으면 걷는 게 아니라 탈것으로 이동 중이라고 본다
const WALK_MAX_SPEED = 2.2;

export type NavStatus = 'locating' | 'routing' | 'moving' | 'arrived' | 'done';

export interface NavLeg {
  path: [number, number][];
  cum: number[];
  total: number; // m
  duration: number; // 초
  mode: 'walk' | 'car';
  // 길을 못 받아 직선으로 그린 구간
  straight: boolean;
  // 목적지가 너무 멀어(다른 도시·나라) 길을 찾지 않은 구간: 여행지에 도착하면 안내한다
  far?: boolean;
}

export interface NavState {
  tripId: string;
  day: number;
  targetId: string | null;
  status: NavStatus;
  fix: Fix | null;
  leg: NavLeg | null;
  along: number; // 구간 시작점부터 온 거리(m)
  // 최근 실제 이동 속도(m/s). 아직 모르면 null
  speed: number | null;
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

// 오늘이 여행의 몇 일차인지 (여행 날이 아니면 -1)
const todayIndex = (trip: Trip): number => {
  const now = new Date();
  return trip.days.findIndex((_, i) => {
    const d = dayDate(trip, i);
    return !!d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  });
};

// 남은 거리(m)와 시간(분). 실제 이동 속도를 알면 그 속도로 계산한다
// (신호 대기 같은 잠깐 멈춤에 크게 흔들리지 않게 예상 속도의 0.3~3배로 묶는다)
export const remainingOf = (nav: NavState): { m: number; min: number } | null => {
  const leg = nav.leg;
  if (!leg) return null;
  const m = Math.max(0, leg.total - nav.along);
  if (leg.total <= 0 || leg.duration <= 0) return { m, min: 0 };
  const planned = leg.total / leg.duration;
  const speed = nav.speed === null ? planned : Math.min(planned * 3, Math.max(planned * 0.3, nav.speed));
  return { m, min: Math.ceil(m / speed / 60) };
};

// 지금 이동 수단: 실제 속도를 알면 그걸로, 아니면 경로를 받을 때 정한 수단
export const movingModeOf = (nav: NavState): 'walk' | 'car' | null => {
  if (!nav.leg) return null;
  if (nav.speed === null) return nav.leg.mode;
  return nav.speed > WALK_MAX_SPEED ? 'car' : 'walk';
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
  // 길을 찾는 중인지 (위치를 받기 전에 목적지가 정해졌으면 위치가 들어올 때 찾는다)
  const planning = useRef(false);
  const lastRouteAt = useRef(0);
  const lastNotice = useRef({ text: '', at: 0, status: '' });
  // 실제 속도 계산용: 최근 위치마다 길 위에서 온 거리
  const samples = useRef<{ t: number; along: number; lat: number; lng: number }[]>([]);
  const lastLegTarget = useRef<string | null>(null);

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
      if (r && n.leg?.far) {
        title = '📍 ' + target.name + '까지 ' + fmtKm(r.m);
        body = '여행지에 도착하면 길 안내를 시작해요';
      } else if (r) {
        title = '🚶 ' + target.name + '까지 ' + r.min + '분';
        body = fmtKm(r.m) + ' 남음 · ' + (movingModeOf(n) === 'car' ? '차량' : '도보') + (n.speed === null ? ' 예상' : ' · 실제 속도 기준');
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
      planning.current = true;
      let leg: NavLeg;
      if (distM(from, target) > FAR_M) {
        const coords: [number, number][] = [[from.lat, from.lng], [target.lat, target.lng]];
        const cum = cumulative(coords);
        leg = { path: coords, cum, total: cum[1], duration: 0, mode: 'car', straight: true, far: true };
      } else
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
        const duration = mode === 'car' ? path.duration * CAR_TRAFFIC_FACTOR : path.duration;
        leg = { path: coords, cum, total: cum[cum.length - 1], duration, mode, straight: false };
      } catch {
        // 길찾기 서버가 안 되면 직선으로 그리고 걷는 속도(시속 4.5km)로 어림
        const coords: [number, number][] = [[from.lat, from.lng], [target.lat, target.lng]];
        const cum = cumulative(coords);
        leg = { path: coords, cum, total: cum[1], duration: cum[1] / 1.25, mode: 'walk', straight: true };
      }
      if (seq === routeSeq.current) planning.current = false;
      if (seq !== routeSeq.current || !navRef.current || navRef.current.targetId !== target.id) return;
      // 같은 목적지로 길만 다시 찾은 경우엔 속도 기록을 이어 간다 (길 위 거리는 새 길 기준이 아니라 버리고 직선 거리만 씀)
      const sameTarget = lastLegTarget.current === target.id;
      lastLegTarget.current = target.id;
      samples.current = sameTarget ? samples.current.map((x) => ({ ...x, along: NaN })) : [];
      patch({ leg, along: 0, speed: sameTarget ? navRef.current.speed : null, status: 'moving' });
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
      // 목적지는 정해졌는데 아직 길을 안 찾았으면(위치를 받기 전에 목적지가 정해진 경우) 지금 찾는다
      if (n.status === 'routing' && !planning.current) {
        planLeg(f, target);
        return;
      }
      if (n.status !== 'moving' || !n.leg) return;
      // 멀리 있다가(여행 전) 여행지 가까이 오면 그때 길을 찾는다
      if (n.leg.far) {
        if (toTarget <= FAR_M && Date.now() - lastRouteAt.current > REROUTE_MS) planLeg(f, target);
        return;
      }

      if (toTarget < ARRIVE_M + Math.min(f.accuracy || 0, 60)) {
        patch({ status: 'arrived', along: n.leg.total });
        notify(navRef.current!);
        return;
      }
      const { along, off } = project(n.leg.path, n.leg.cum, f);
      // GPS 가 잠깐 튀어 뒤로 가는 것처럼 보이지 않게 조금만 뒤로 허용
      const nextAlong = Math.max(along, n.along - 30);
      // 최근 2분 동안의 실제 속도: 길 위에서 나아간 거리와 실제로 움직인 직선 거리 중 큰 쪽
      // (길을 정확히 따라가지 않아도 느리게 잡히지 않게. 처음·끝 위치 거리라 제자리 GPS 흔들림은 거의 안 잡힘)
      const now = f.at || Date.now();
      samples.current = samples.current.filter((s) => now - s.t <= SPEED_WINDOW_MS).concat([{ t: now, along: nextAlong, lat: f.lat, lng: f.lng }]);
      const first = samples.current[0];
      const secs = (now - first.t) / 1000;
      const speed = secs * 1000 >= SPEED_MIN_MS ? Math.max(0, Number.isNaN(first.along) ? 0 : nextAlong - first.along, distM(first, f)) / secs : n.speed;
      patch({ along: nextAlong, speed });
      if (off > OFF_ROUTE_M && (f.accuracy || 0) < 50 && Date.now() - lastRouteAt.current > REROUTE_MS) planLeg(f, target);
      notify(navRef.current!);
    },
    [patch, notify, planLeg, setTarget, next]
  );

  const startNav = useCallback(
    async (tripId: string, day: number) => {
      endSession();
      navRef.current = { tripId, day, targetId: null, status: 'locating', fix: null, leg: null, along: 0, speed: null, error: null };
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
