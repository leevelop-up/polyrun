import React, { useEffect, useRef, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Place, useTrip } from '../context/TripContext';
import { CAT_COLORS, INK, PAPER } from '../theme/palette';
import { dayDate, fmtDay, readDayParam, tripCenter, tripRange, tripSearchArea, tripTitle } from '../utils/trip';
import DayGrid from '../components/DayGrid';
import NavCard from '../components/NavCard';
import { walkerClass, walkerSvg } from '../components/walkerSvg';
import { useNav } from '../context/NavContext';
import { getCurrentFix, LocationDeniedError } from '../native/tracking';
import { pointAt } from '../utils/nav';
import { searchPlaces } from '../api/geo';

// 마커끼리 이 픽셀 거리보다 가까우면 겹치지 않게 옆으로 펼친다
const MARKER_GAP = 30;
// 목록에서 고른 장소 강조색
const PICK_GREEN = '#7BD4A0';
// 장소를 고르거나 현재 위치로 갈 때 이보다 멀리 축소돼 있으면 이만큼 확대한다
const FOCUS_ZOOM = 16;

// 장소 번호 마커. 고른 장소는 초록색으로 크게
const placeIcon = (p: Place, num: number, picked: boolean): L.DivIcon => {
  const [bg, fg] = CAT_COLORS[p.cat];
  const size = picked ? 38 : 30;
  return L.divIcon({
    className: '',
    html: picked
      ? `<div style="width:${size}px;height:${size}px;box-sizing:border-box;border:3px solid #14162B;border-radius:8px;background:${PICK_GREEN};color:#14162B;box-shadow:3px 3px 0 #14162B;display:flex;align-items:center;justify-content:center;font-family:'DM Mono',monospace;font-size:16px;font-weight:700;">${num}</div>`
      : `<div style="width:${size}px;height:${size}px;box-sizing:border-box;border:2px solid #14162B;border-radius:6px;background:${bg};color:${fg};display:flex;align-items:center;justify-content:center;font-family:'DM Mono',monospace;font-size:14px;font-weight:500;">${num}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
};

const MapPage: React.FC = () => {
  const history = useHistory();
  const location = useLocation();
  const { activeTrip, updateDayItems } = useTrip();
  // 위치 없는 장소의 좌표를 검색으로 찾는 중 / 결과 안내
  const [locating, setLocating] = useState(false);
  const [locateMsg, setLocateMsg] = useState<string | null>(null);
  const [day, setDay] = useState(() => readDayParam(location.search, activeTrip ? activeTrip.days.length : 1));
  const [grid, setGrid] = useState(false);
  // 지도 크게 보기 (화면 전체)
  const [bigMap, setBigMap] = useState(false);
  const swipeStart = useRef({ x: 0, y: 0 });

  const mapElRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const coordsRef = useRef<L.LatLng[]>([]);
  const routeLineRef = useRef<L.Polyline | null>(null);
  // markersRef 와 같은 순서로, 각 마커의 장소와 목록 번호
  const markerPlacesRef = useRef<{ place: Place; num: number }[]>([]);
  // 목록에서 고른 장소 (초록색 강조 + 지도 가운데)
  const [pickedId, setPickedId] = useState<string | null>(null);
  const pickedRef = useRef<string | null>(null);
  pickedRef.current = pickedId;
  // 현재 위치 점과 GPS 오차 원
  const myLocRef = useRef<L.Layer[]>([]);
  const [findingMe, setFindingMe] = useState(false);
  const [mapMsg, setMapMsg] = useState<string | null>(null);
  const mapMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 지도를 새로 만들 때마다 바뀌는 값 (이동 안내 선/사람을 다시 그리기 위함)
  const [mapGen, setMapGen] = useState(0);

  // 이동 안내: 지금 구간의 길과 그 위를 걸어가는 사람
  const { nav, startNav, goTo } = useNav();
  const [navMsg, setNavMsg] = useState<string | null>(null);
  const navLinesRef = useRef<L.Polyline[]>([]);
  const walkerRef = useRef<L.Marker | null>(null);
  const shownAlong = useRef(0);

  const days = activeTrip ? activeTrip.days : [];
  const list = days[day] || [];
  const navHere = nav && activeTrip && nav.tripId === activeTrip.id && nav.day === day ? nav : null;
  const navLeg = navHere ? navHere.leg : null;
  const navAlong = navHere && navLeg ? (navHere.status === 'arrived' ? navLeg.total : navHere.along) : 0;
  const navMood = navHere?.status === 'arrived' || navHere?.status === 'done' ? 'cheer' : navHere?.status === 'moving' ? 'walking' : 'idle';
  const navTargetId = navHere ? navHere.targetId : null;

  useEffect(() => {
    if (location.pathname !== '/map') return;
    setDay(readDayParam(location.search, activeTrip ? activeTrip.days.length : 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search, activeTrip?.id]);

  // 현재 줌에서 가까운 마커를 원형으로 펼쳐 번호가 가려지지 않게 한다 (경로선도 펼친 위치를 따라감)
  const spreadMarkers = (map: L.Map) => {
    const z = map.getZoom();
    const placed: L.Point[] = [];
    const shown = coordsRef.current.map((c, k) => {
      const base = map.project(c, z);
      let pt = base;
      for (let n = 0; n < 18 && placed.some((p) => p.distanceTo(pt) < MARKER_GAP); n++) {
        const ang = (n % 6) * (Math.PI / 3);
        const r = MARKER_GAP * (1 + Math.floor(n / 6));
        pt = base.add(L.point(Math.cos(ang) * r, Math.sin(ang) * r));
      }
      placed.push(pt);
      const ll = map.unproject(pt, z);
      markersRef.current[k]?.setLatLng(ll);
      return ll;
    });
    routeLineRef.current?.setLatLngs(shown);
  };

  const renderMarkers = (map: L.Map, places: Place[]) => {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    markerPlacesRef.current = [];
    coordsRef.current = [];
    if (routeLineRef.current) {
      routeLineRef.current.remove();
      routeLineRef.current = null;
    }

    const withCoords = places.filter((p): p is Place & { lat: number; lng: number } => typeof p.lat === 'number' && typeof p.lng === 'number');
    if (withCoords.length === 0) {
      const { center, zoom } = tripCenter(activeTrip);
      map.setView(center, zoom);
      return;
    }
    coordsRef.current = withCoords.map((p) => L.latLng(p.lat, p.lng));

    withCoords.forEach((p) => {
      // 위치 없는 장소가 끼어 있어도 목록과 같은 번호를 쓴다
      const num = places.indexOf(p) + 1;
      const picked = pickedRef.current === p.id;
      markersRef.current.push(L.marker([p.lat, p.lng], { icon: placeIcon(p, num, picked), zIndexOffset: picked ? 500 : 0 }).addTo(map));
      markerPlacesRef.current.push({ place: p, num });
    });

    routeLineRef.current = L.polyline(
      withCoords.map((p) => [p.lat, p.lng]),
      { color: '#14162B', weight: 3, dashArray: '7 6' }
    ).addTo(map);

    map.fitBounds(L.latLngBounds(withCoords.map((p) => [p.lat, p.lng])), { padding: [40, 40], maxZoom: 16, animate: false });
    spreadMarkers(map);
  };

  // 지도 초기화 (일정이 있고 grid 뷰가 아닐 때)
  useEffect(() => {
    if (!activeTrip || grid || !mapElRef.current || mapInstanceRef.current) return;

    const { center, zoom } = tripCenter(activeTrip);
    const map = L.map(mapElRef.current, {
      center,
      zoom,
      zoomControl: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

    map.on('zoomend', () => spreadMarkers(map));
    mapInstanceRef.current = map;
    setMapGen((g) => g + 1);

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    map.whenReady(() => {
      if (cancelled) return;
      timeoutId = setTimeout(() => {
        if (cancelled) return;
        map.invalidateSize();
        renderMarkers(map, list);
      }, 100);
    });

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      map.remove();
      mapInstanceRef.current = null;
      markersRef.current = [];
      markerPlacesRef.current = [];
      coordsRef.current = [];
      routeLineRef.current = null;
      myLocRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTrip, grid]);

  // 고른 장소가 바뀌면 마커 색만 바꾼다 (지도 범위는 그대로)
  useEffect(() => {
    markersRef.current.forEach((m, i) => {
      const mp = markerPlacesRef.current[i];
      if (!mp) return;
      const picked = mp.place.id === pickedId;
      m.setIcon(placeIcon(mp.place, mp.num, picked));
      m.setZIndexOffset(picked ? 500 : 0);
    });
  }, [pickedId]);

  // 다른 일차로 넘어가면 고른 장소를 푼다
  useEffect(() => {
    setPickedId(null);
  }, [day]);

  // 일차가 바뀔 때 마커/경로 갱신
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    renderMarkers(map, list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  // 구간이 바뀌면 길을 다시 그리고 사람을 출발점에 세운다
  useEffect(() => {
    navLinesRef.current.forEach((l) => l.remove());
    navLinesRef.current = [];
    walkerRef.current?.remove();
    walkerRef.current = null;
    const map = mapInstanceRef.current;
    if (!map || !navLeg) return;
    navLinesRef.current = [
      L.polyline(navLeg.path, { color: INK, weight: 8, opacity: 0.9, interactive: false }).addTo(map),
      L.polyline(navLeg.path, { color: '#2F3CF0', weight: 4, interactive: false }).addTo(map)
    ];
    const start = pointAt(navLeg.path, navLeg.cum, 0);
    walkerRef.current = L.marker([start.lat, start.lng], {
      icon: L.divIcon({ className: '', html: '<div class="' + walkerClass('walking') + '">' + walkerSvg(30) + '</div>', iconSize: [30, 36], iconAnchor: [15, 34] }),
      // 장소 번호 마커보다 아래에 그린다: 장소에 서 있을 때 번호가 가려지지 않게 (머리만 위로 보임)
      zIndexOffset: -1000,
      interactive: false,
      keyboard: false
    }).addTo(map);
    shownAlong.current = 0;
    // 이 구간만이 아니라 그날 장소 전체가 보이게 맞춘다
    map.invalidateSize();
    const bounds = L.latLngBounds(navLeg.path);
    coordsRef.current.forEach((c) => bounds.extend(c));
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 16, animate: false });
    spreadMarkers(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navLeg, mapGen]);

  // 이동 안내를 시작/종료하면 지도 높이가 바뀌므로 Leaflet 에 크기를 다시 알려 주고, 끝나면 장소 전체로 되돌린다
  const navOn = !!navHere;
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.invalidateSize();
    if (!navOn) renderMarkers(map, list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navOn]);

  // 위치가 바뀌면 사람을 길을 따라 부드럽게 옮긴다 (GPS 는 몇 초에 한 번 오므로 그 사이를 이어 준다)
  useEffect(() => {
    const marker = walkerRef.current;
    if (!marker || !navLeg) return;
    const from = shownAlong.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 900);
      const a = from + (navAlong - from) * k;
      shownAlong.current = a;
      const pt = pointAt(navLeg.path, navLeg.cum, a);
      marker.setLatLng([pt.lat, pt.lng]);
      const el = marker.getElement()?.firstElementChild;
      const cls = walkerClass(navMood, !pt.east);
      if (el && el.className !== cls) el.className = cls;
      if (k < 1) {
        raf = requestAnimationFrame(step);
        return;
      }
      // 사람이 지도 가장자리로 가면 따라간다
      const map = mapInstanceRef.current;
      if (map && !map.getBounds().pad(-0.2).contains([pt.lat, pt.lng])) map.panTo([pt.lat, pt.lng]);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [navAlong, navLeg, navMood, mapGen]);

  // 크게 보기를 켜고 끄면 지도 크기가 바뀌므로 Leaflet 에 알려 주고 그날 장소(이동 안내 중이면 구간)에 다시 맞춘다
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const t = setTimeout(() => {
      map.invalidateSize();
      if (navLeg) {
        const bounds = L.latLngBounds(navLeg.path);
        coordsRef.current.forEach((c) => bounds.extend(c));
        map.fitBounds(bounds, { padding: [36, 36], maxZoom: 16, animate: false });
        spreadMarkers(map);
      } else renderMarkers(map, list);
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bigMap]);

  // 크게 보기 중에는 뒤로가기가 먼저 크게 보기를 닫는다 (위 페이지로 가는 처리보다 우선)
  useEffect(() => {
    if (!bigMap) return;
    const onBack = (ev: Event) => {
      (ev as CustomEvent<{ register: (priority: number, handler: () => void) => void }>).detail.register(20, () => setBigMap(false));
    };
    document.addEventListener('ionBackButton', onBack);
    return () => document.removeEventListener('ionBackButton', onBack);
  }, [bigMap]);

  // 다른 화면으로 나가면 크게 보기를 푼다
  useEffect(() => {
    if (location.pathname !== '/map') setBigMap(false);
  }, [location.pathname]);

  if (!activeTrip) {
    return (
      <div style={{ width: '100%', maxWidth: 390, height: 'calc(100vh - var(--ad-h, 0px))', maxHeight: 844, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: PAPER, padding: 20, boxSizing: 'border-box' }}>
        <div style={{ fontSize: 15, color: '#4A4D66', textAlign: 'center' }}>아직 선택된 일정이 없어요.</div>
        <button type="button" onClick={() => history.push('/my-trips')} style={{ height: 48, padding: '0 20px', border: '2px solid #14162B', borderRadius: 10, background: INK, color: '#FFD84A', fontFamily: "'Black Han Sans', sans-serif", fontSize: 16, cursor: 'pointer' }}>
          내 일정 보기
        </button>
      </div>
    );
  }

  const onSwipeStart = (e: React.TouchEvent | React.MouseEvent) => {
    const p = 'touches' in e && e.touches[0] ? e.touches[0] : (e as React.MouseEvent);
    swipeStart.current = { x: p.clientX, y: p.clientY };
  };
  const onSwipeEnd = (e: React.TouchEvent | React.MouseEvent) => {
    const p = 'changedTouches' in e && e.changedTouches[0] ? e.changedTouches[0] : (e as React.MouseEvent);
    const dx = p.clientX - swipeStart.current.x;
    const dy = p.clientY - swipeStart.current.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const n = Math.min(days.length - 1, Math.max(0, day + (dx < 0 ? 1 : -1)));
    if (n === day) return;
    setDay(n);
  };

  const date = dayDate(activeTrip, day);
  const dayDateLabel = date ? fmtDay(date) : '날짜 미정';
  const canNav = list.some((p) => typeof p.lat === 'number');
  const missing = list.filter((p) => typeof p.lat !== 'number' || typeof p.lng !== 'number');

  // 위치 없는 장소를 이름으로 검색해서 첫 결과의 좌표를 넣는다 (여행지 근처에서만)
  const locateMissing = async () => {
    if (locating) return;
    setLocating(true);
    setLocateMsg(null);
    const near = tripSearchArea(activeTrip);
    const found = new Map<string, { lat: number; lng: number }>();
    for (const p of missing) {
      try {
        const [hit] = await searchPlaces(p.name, { full: true, near });
        if (hit) found.set(p.id, { lat: hit.lat, lng: hit.lng });
      } catch {
        // 검색 실패한 곳은 그대로 둔다
      }
    }
    setLocating(false);
    if (found.size) updateDayItems(activeTrip.id, day, list.map((p) => (found.has(p.id) ? { ...p, ...found.get(p.id) } : p)));
    const left = missing.length - found.size;
    setLocateMsg(left === 0 ? found.size + '곳의 위치를 찾았어요' : (found.size ? found.size + '곳은 찾았지만 ' : '') + left + '곳은 못 찾았어요. 장소 추가에서 다시 넣어 주세요');
  };
  const targetIdx = navTargetId ? list.findIndex((p) => p.id === navTargetId) : -1;

  const flash = (text: string) => {
    if (mapMsgTimer.current) clearTimeout(mapMsgTimer.current);
    setMapMsg(text);
    mapMsgTimer.current = setTimeout(() => setMapMsg(null), 2500);
  };

  // 목록에서 장소를 누르면 초록색으로 강조하고 그 위치를 지도 가운데로 (겹친 마커를 펼친 자리 기준)
  const pickPlace = (p: Place) => {
    setPickedId(p.id);
    const map = mapInstanceRef.current;
    if (!map) return;
    if (typeof p.lat !== 'number' || typeof p.lng !== 'number') {
      flash('이 장소는 위치 정보가 없어요');
      return;
    }
    const i = markerPlacesRef.current.findIndex((mp) => mp.place.id === p.id);
    const at = i >= 0 ? markersRef.current[i].getLatLng() : L.latLng(p.lat, p.lng);
    map.setView(at, Math.max(map.getZoom(), FOCUS_ZOOM), { animate: true });
  };

  // 현재 위치로 지도 이동. 이동 안내 중이면 방금 받은 위치를 쓴다
  const goToMe = async () => {
    const map = mapInstanceRef.current;
    if (!map || findingMe) return;
    setFindingMe(true);
    try {
      const recent = nav?.fix && Date.now() - nav.fix.at < 15000 ? nav.fix : null;
      const f = recent || (await getCurrentFix());
      const m = mapInstanceRef.current;
      if (!m) return;
      myLocRef.current.forEach((l) => l.remove());
      myLocRef.current = [
        L.circle([f.lat, f.lng], { radius: Math.min(f.accuracy || 0, 300), color: '#2F3CF0', weight: 1, fillColor: '#2F3CF0', fillOpacity: 0.12, interactive: false }).addTo(m),
        L.circleMarker([f.lat, f.lng], { radius: 8, color: '#FFFFFF', weight: 3, fillColor: '#2F3CF0', fillOpacity: 1, interactive: false }).addTo(m)
      ];
      m.setView([f.lat, f.lng], Math.max(m.getZoom(), FOCUS_ZOOM), { animate: true });
    } catch (e) {
      flash(e instanceof LocationDeniedError ? '위치 권한을 허용해 주세요' : '현재 위치를 찾지 못했어요');
    } finally {
      setFindingMe(false);
    }
  };

  const onStartNav = async () => {
    setNavMsg(null);
    try {
      await startNav(activeTrip.id, day);
    } catch (e) {
      setNavMsg(e instanceof LocationDeniedError ? '위치 권한을 허용해야 이동 안내를 쓸 수 있어요' : '위치를 사용할 수 없어요');
    }
  };

  return (
    <div style={{ width: '100%', maxWidth: 390, height: 'calc(100vh - var(--ad-h, 0px))', maxHeight: 844, margin: '0 auto', boxSizing: 'border-box', background: PAPER, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {!bigMap && (
      <>
      <div style={{ flexShrink: 0, background: '#2F3CF0', borderBottom: '2px solid #14162B', padding: '14px 20px 18px', display: 'flex', flexDirection: 'column', gap: 8, color: '#FFFFFF' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: -10 }}>
          <button type="button" aria-label="뒤로" onClick={() => history.push('/my-trips')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, border: 0, background: 'transparent', cursor: 'pointer' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="square" aria-hidden="true">
              <path d="M20 12H4M11 5l-7 7 7 7" />
            </svg>
          </button>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, letterSpacing: '0.12em' }}>{tripRange(activeTrip)} · {activeTrip.pax}명</div>
        </div>
        <h1 style={{ margin: 0, fontFamily: "'Black Han Sans', sans-serif", fontSize: 36, lineHeight: 1.1, fontWeight: 400 }}>{tripTitle(activeTrip)}</h1>
        {activeTrip.title && <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.85 }}>여행지 · {activeTrip.destination}</div>}
      </div>

      <div style={{ flexShrink: 0, height: 48, boxSizing: 'border-box', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', margin: '16px 20px 0', border: '2px solid #14162B', borderRadius: 10, overflow: 'hidden' }}>
        <button type="button" onClick={() => history.push('/itinerary?day=' + day)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 44, borderRight: '2px solid #14162B', background: '#FFFFFF', color: INK, fontFamily: "'Black Han Sans', sans-serif", fontSize: 16, cursor: 'pointer' }}>목록</button>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 44, background: '#FFD84A', color: INK, fontFamily: "'Black Han Sans', sans-serif", fontSize: 16 }}>지도</div>
      </div>
      </>
      )}

      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: bigMap ? '10px 12px 0' : '14px 20px 0' }}>
        {bigMap && (
          <button
            type="button"
            aria-label="지도 작게 보기"
            onClick={() => setBigMap(false)}
            style={{ flexShrink: 0, width: 44, height: 44, marginBottom: 6, border: '2px solid #14162B', borderRadius: 8, background: INK, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFD84A" strokeWidth={2.6} strokeLinecap="square" aria-hidden="true">
              <path d="M5 5l14 14M19 5L5 19" />
            </svg>
          </button>
        )}
        <div style={{ flexGrow: 1, minWidth: 0, display: 'flex', gap: 8, overflowX: 'auto', padding: '2px 2px 8px' }}>
          {days.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setDay(i)}
              style={{ flexShrink: 0, minWidth: 68, height: 44, padding: '0 12px', border: '2px solid #14162B', borderRadius: 8, background: i === day ? '#14162B' : '#FFFFFF', color: i === day ? '#FFD84A' : INK, fontFamily: "'Black Han Sans', sans-serif", fontSize: 16, cursor: 'pointer' }}
            >
              {i + 1}일차
            </button>
          ))}
        </div>
        {!bigMap && (
        <button
          type="button"
          aria-label="전체 일차 보기"
          onClick={() => setGrid((g) => !g)}
          style={{ flexShrink: 0, width: 44, height: 44, marginBottom: 6, border: '2px solid #14162B', borderRadius: 8, background: grid ? '#FFD84A' : '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#14162B" strokeWidth={2.4} aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
          </svg>
        </button>
        )}
      </div>

      {!grid && (
        <div style={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ position: 'relative', ...(bigMap ? { flexGrow: 1, minHeight: 0, margin: '0 12px 12px' } : { flexShrink: 0, height: navHere ? 250 : 330, margin: '0 20px' }), border: '2px solid #14162B', borderRadius: 10, overflow: 'hidden', background: '#F2EFE9' }}>
            <div ref={mapElRef} style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} />
            {list.length > 0 && list.every((p) => typeof p.lat !== 'number') && (
              <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', padding: '8px 14px', border: '2px solid #14162B', borderRadius: 8, background: '#FFFFFF', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 1000 }}>
                이 날의 장소에 위치 정보가 없어요
              </div>
            )}
            <button
              type="button"
              aria-label={bigMap ? '지도 작게 보기' : '지도 크게 보기'}
              onClick={() => {
                setGrid(false);
                setBigMap((b) => !b);
              }}
              style={{ position: 'absolute', left: 8, top: 8, width: 44, height: 44, border: '2px solid #14162B', borderRadius: 8, background: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#14162B" strokeWidth={2.4} strokeLinecap="square" aria-hidden="true">
                {bigMap ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
              </svg>
            </button>
            <div style={{ position: 'absolute', right: 8, top: 8, display: 'flex', flexDirection: 'column', border: '2px solid #14162B', borderRadius: 8, overflow: 'hidden', background: '#FFFFFF', zIndex: 1000 }}>
              <button type="button" aria-label="지도 확대" onClick={() => mapInstanceRef.current?.zoomIn()} style={{ width: 44, height: 44, border: 0, borderBottom: '2px solid #14162B', background: '#FFFFFF', color: INK, fontSize: 22, cursor: 'pointer' }}>+</button>
              <button type="button" aria-label="지도 축소" onClick={() => mapInstanceRef.current?.zoomOut()} style={{ width: 44, height: 44, border: 0, background: '#FFFFFF', color: INK, fontSize: 22, cursor: 'pointer' }}>−</button>
            </div>
            <button
              type="button"
              aria-label="현재 위치로 이동"
              onClick={goToMe}
              disabled={findingMe}
              style={{ position: 'absolute', right: 8, bottom: 26, width: 44, height: 44, border: '2px solid #14162B', borderRadius: 8, background: '#FFFFFF', cursor: findingMe ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={findingMe ? '#8A8CA3' : '#2F3CF0'} strokeWidth={2.4} strokeLinecap="square" aria-hidden="true">
                <circle cx="12" cy="12" r="6" />
                <circle cx="12" cy="12" r="2" fill={findingMe ? '#8A8CA3' : '#2F3CF0'} stroke="none" />
                <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
              </svg>
            </button>
            {mapMsg && (
              <div role="status" style={{ position: 'absolute', left: 8, bottom: 26, padding: '6px 10px', border: '2px solid #14162B', borderRadius: 8, background: INK, color: '#FFFFFF', fontSize: 12, fontWeight: 700, zIndex: 1000 }}>
                {mapMsg}
              </div>
            )}
          </div>
          {!bigMap && missing.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 20px 0', padding: '8px 8px 8px 12px', border: '2px dashed #14162B', borderRadius: 8, background: '#FFFFFF' }}>
              <div style={{ flexGrow: 1, fontSize: 13, fontWeight: 700 }}>위치가 없는 장소 {missing.length}곳은 지도에 안 보여요</div>
              <button type="button" onClick={locateMissing} disabled={locating} style={{ flexShrink: 0, height: 36, padding: '0 12px', border: '2px solid #14162B', borderRadius: 6, background: '#FFD84A', color: INK, fontFamily: "'Black Han Sans', sans-serif", fontSize: 14, cursor: locating ? 'default' : 'pointer', opacity: locating ? 0.6 : 1 }}>
                {locating ? '찾는 중…' : '위치 찾기'}
              </button>
            </div>
          )}
          {!bigMap && locateMsg && <div style={{ margin: '6px 20px 0', fontSize: 12, fontWeight: 700, color: '#4A4D66' }}>{locateMsg}</div>}
          {navHere && <div style={{ flexShrink: 0, paddingBottom: bigMap ? 12 : 0 }}><NavCard nav={navHere} trip={activeTrip} /></div>}
          {!bigMap && !navHere && nav && (
            <button type="button" onClick={() => setDay(nav.day)} style={{ margin: '12px 20px 0', height: 44, border: '2px solid #14162B', borderRadius: 8, background: '#FFD84A', color: INK, fontFamily: "'Black Han Sans', sans-serif", fontSize: 15, cursor: 'pointer' }}>
              {nav.tripId === activeTrip.id ? nav.day + 1 + '일차 이동 안내 중 · 보기' : '다른 일정의 이동 안내 중이에요'}
            </button>
          )}
          {!bigMap && !nav && canNav && (
            <button type="button" onClick={onStartNav} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, margin: '12px 20px 0', height: 48, border: '2px solid #14162B', borderRadius: 10, background: INK, boxShadow: '3px 3px 0 #FFD84A', color: '#FFD84A', fontFamily: "'Black Han Sans', sans-serif", fontSize: 17, cursor: 'pointer' }}>
              <span aria-hidden="true">🚶</span> 이동 시작
            </button>
          )}
          {!bigMap && navMsg && <div style={{ margin: '8px 20px 0', fontSize: 13, fontWeight: 700, color: '#FF5A3C' }}>{navMsg}</div>}
          {/* 스와이프는 지도 아래 영역에서만 받는다 (지도를 끌어 이동할 때 일차가 바뀌지 않도록) */}
          <div style={{ flexGrow: 1, minHeight: 0, overflowY: 'auto', display: bigMap ? 'none' : 'flex', flexDirection: 'column', touchAction: 'pan-y', userSelect: 'none' }} onTouchStart={onSwipeStart} onTouchEnd={onSwipeEnd} onMouseDown={onSwipeStart} onMouseUp={onSwipeEnd}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 20px 4px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{day + 1}일차</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#4A4D66' }}>{dayDateLabel}</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 20px' }}>
            {list.map((p, k) => (
              <div
                key={p.id}
                // 누르면 초록색으로 강조하고 지도 가운데로. 이동 안내 중에는 목적지를 노란색, 지나온 장소는 흐리게
                role="button"
                tabIndex={0}
                aria-pressed={p.id === pickedId}
                aria-label={p.name + ' 지도에서 보기'}
                onClick={() => pickPlace(p)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    pickPlace(p);
                  }
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 40, margin: '0 -8px', padding: '0 8px', borderRadius: 8, border: p.id === pickedId ? '2px solid #14162B' : '2px solid transparent', background: p.id === pickedId ? PICK_GREEN : k === targetIdx ? '#FFD84A' : 'transparent', opacity: targetIdx > 0 && k < targetIdx && p.id !== pickedId ? 0.45 : 1, cursor: 'pointer' }}
              >
                <div style={{ width: 24, height: 24, boxSizing: 'border-box', border: '2px solid #14162B', borderRadius: 5, background: CAT_COLORS[p.cat][0], color: CAT_COLORS[p.cat][1], display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 500 }}>{k + 1}</div>
                <div style={{ flexGrow: 1, fontSize: 14, fontWeight: 700 }}>{p.name}</div>
                {typeof p.lat !== 'number' && <div style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#FF5A3C' }}>위치 없음</div>}
                {/* 이동 안내 중: 고른 장소를 목적지로 바꾸기 */}
                {navHere && p.id === pickedId && k !== targetIdx && typeof p.lat === 'number' && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      goTo(p.id);
                    }}
                    style={{ flexShrink: 0, height: 30, padding: '0 10px', border: '2px solid #14162B', borderRadius: 6, background: INK, color: '#FFD84A', fontFamily: "'Black Han Sans', sans-serif", fontSize: 13, cursor: 'pointer' }}
                  >
                    여기로 안내
                  </button>
                )}
              </div>
            ))}
            {list.length === 0 && <div style={{ fontSize: 14, color: '#4A4D66', padding: '8px 0' }}>이 날은 아직 장소가 없어요.</div>}
          </div>
          </div>
        </div>
      )}

      {grid && (
        <DayGrid
          trip={activeTrip}
          day={day}
          onPick={(i) => {
            setDay(i);
            setGrid(false);
          }}
        />
      )}
    </div>
  );
};

export default MapPage;
