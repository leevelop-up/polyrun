import React, { useEffect, useRef, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Category, Place, useTrip } from '../context/TripContext';
import { CAT_COLORS, INK, PAPER } from '../theme/palette';
import { reverseGeocode, GeoSearchResult } from '../api/geo';
import { findTripDestination, loadPicks, matchPick, PlacePick } from '../data/destinations';
import { usePlaceSearch } from '../hooks/usePlaceSearch';
import PlaceDetail from '../components/PlaceDetail';
import { tripBooking } from '../utils/booking';
import { dayDate, fmtDay, readDayParam, tripCenter, tripRange, tripRegion, tripSearchArea } from '../utils/trip';

type Candidate = { name: string; cat: Category; lat: number; lng: number; wd?: string; area?: string; aliases?: string[] };

const newId = () => 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const AddPlace: React.FC = () => {
  const history = useHistory();
  const location = useLocation();
  const { activeTrip, addPlacesToDay, removePlaceFromDay } = useTrip();
  const [mode, setMode] = useState<'search' | 'map'>('search');
  const dayCount = activeTrip ? activeTrip.days.length : 1;
  const [day, setDay] = useState(() => readDayParam(location.search, dayCount));
  const [q, setQ] = useState('');
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [pname, setPname] = useState('');
  const [cat, setCat] = useState<Category>('관광');
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [isLookingUpName, setIsLookingUpName] = useState(false);
  // 목적지의 전체 추천 장소 (직접 고른 추천 + 도시별 관광지 파일). 파일은 처음 열 때 불러온다
  const [allPicks, setAllPicks] = useState<PlacePick[] | null>(null);
  const [mapQuery, setMapQuery] = useState('');
  // 추천 장소 지역 필터 (null = 전체)
  const [area, setArea] = useState<string | null>(null);
  // 장소 상세정보 시트
  const [detail, setDetail] = useState<Candidate | null>(null);

  const mapElRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const pinMarkerRef = useRef<L.Marker | null>(null);
  const lookupSeqRef = useRef(0);

  const { center, zoom } = tripCenter(activeTrip);
  // 장소 검색은 여행지 반경 안에서만 (없으면 "여행지 밖까지 찾기")
  const tripArea = tripSearchArea(activeTrip);
  const mapCenter = mapInstanceRef.current?.getCenter();
  const search = usePlaceSearch(q, tripArea);
  // 지도 검색은 지금 보고 있는 곳을 중심으로, 반경은 여행지와 같게
  const mapSearch = usePlaceSearch(mapQuery, mapCenter ? { lat: mapCenter.lat, lng: mapCenter.lng, radiusKm: tripArea?.radiusKm } : tripArea);

  // "+ N일차에 장소 추가"로 들어오면 그 일차를 연다
  useEffect(() => {
    if (location.pathname !== '/add-place') return;
    setDay(readDayParam(location.search, dayCount));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search, activeTrip?.id]);

  // 다른 일정으로 바뀌면 검색어를 비우고 지도를 새 목적지로 옮긴다
  useEffect(() => {
    setQ('');
    setMapQuery('');
    setArea(null);
    setPin(null);
    mapInstanceRef.current?.setView(center, zoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTrip?.id]);

  const list = activeTrip ? activeTrip.days[day] || [] : [];
  const dest = activeTrip ? findTripDestination(activeTrip) : undefined;
  const picks = allPicks || dest?.picks || [];
  const areas = dest?.areas || [];
  useEffect(() => {
    setAllPicks(null);
    if (!dest) return;
    let alive = true;
    loadPicks(dest).then((l) => alive && setAllPicks(l));
    return () => {
      alive = false;
    };
  }, [dest]);

  const qTrim = q.trim().toLowerCase();
  // 검색어가 있으면 지역과 상관없이 전체 추천 장소에서 찾는다
  const shownPicks = picks.filter((p) => matchPick(p, q) && (qTrim !== '' || !area || p.area === area));
  // "전체" 보기에서는 지역별로 묶어서 보여준다
  // 지역 칩에 없는 관광지(도시별 관광지 파일)는 맨 뒤 "더 많은 관광지"로 모은다
  const groups = !qTrim && !area && areas.length > 1
    ? areas
        .map((a) => ({ area: a, items: shownPicks.filter((p) => p.area === a) }))
        .concat([{ area: '더 많은 관광지', items: shownPicks.filter((p) => !areas.includes(p.area)) }])
        .filter((g) => g.items.length)
    : [{ area: '', items: shownPicks }];
  const pickNames = new Set(shownPicks.map((p) => p.name));
  const apiResults = search.results.filter((r) => !pickNames.has(r.name));

  const findAdded = (name: string) => list.find((x) => x.name === name);

  const showToast = (text: string) => {
    clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  // 추가/빼기는 바로 일정에 저장한다 (뒤로가기해도 사라지지 않음)
  const toggle = (c: Candidate) => {
    if (!activeTrip) return;
    const existing = findAdded(c.name);
    if (existing) {
      removePlaceFromDay(activeTrip.id, day, existing.id);
    } else {
      addPlacesToDay(activeTrip.id, day, [{ id: newId(), name: c.name, cat: c.cat, lat: c.lat, lng: c.lng, ...(c.wd ? { wd: c.wd } : {}) }]);
    }
  };

  // 백엔드(/api/reverse)로 클릭한 좌표의 장소 이름을 조회.
  // 백엔드는 주변 관광명소/역(Photon)을 우선 찾아 한국어 이름으로 바꾸고, 없으면 Nominatim 역지오코딩으로 폴백한다.
  const lookupPlaceName = async (lat: number, lng: number) => {
    const seq = ++lookupSeqRef.current;
    setIsLookingUpName(true);
    try {
      const name = await reverseGeocode(lat, lng);
      if (seq !== lookupSeqRef.current) return; // 이후 클릭이 있었으면 이 응답은 버림
      setPname(name || '선택한 장소');
    } catch {
      if (seq === lookupSeqRef.current) setPname('선택한 장소');
    } finally {
      if (seq === lookupSeqRef.current) setIsLookingUpName(false);
    }
  };

  const placePin = (lat: number, lng: number) => {
    setPin({ lat, lng });
    setPname('');
    lookupPlaceName(lat, lng);
  };
  const placePinRef = useRef(placePin);
  placePinRef.current = placePin;

  const selectMapSearchResult = (r: GeoSearchResult) => {
    mapInstanceRef.current?.setView([r.lat, r.lng], 17);
    lookupSeqRef.current++; // 진행 중인 역지오코딩 결과가 검색 결과 이름을 덮어쓰지 않게
    setIsLookingUpName(false);
    setPin({ lat: r.lat, lng: r.lng });
    setPname(r.name);
    if (r.cat) setCat(r.cat);
    setMapQuery('');
  };

  const addPin = () => {
    if (!pin || !activeTrip) return;
    const name = pname.trim() || '선택한 장소';
    const place: Place = { id: newId(), name, cat, lat: pin.lat, lng: pin.lng };
    addPlacesToDay(activeTrip.id, day, [place]);
    showToast("'" + name + "'을(를) " + (day + 1) + '일차에 추가했어요');
    setPin(null);
    setPname('');
  };

  // "지도에서 찍기" 모드로 전환될 때 Leaflet 지도를 초기화
  useEffect(() => {
    if (mode !== 'map' || !mapElRef.current || mapInstanceRef.current) return;

    const map = L.map(mapElRef.current, {
      center,
      zoom,
      zoomControl: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      placePinRef.current(e.latlng.lat, e.latlng.lng);
    });

    mapInstanceRef.current = map;
    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      pinMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // pin 위치가 바뀔 때마다 마커 갱신
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!pin) {
      if (pinMarkerRef.current) {
        pinMarkerRef.current.remove();
        pinMarkerRef.current = null;
      }
      return;
    }

    const [bg, fg] = CAT_COLORS[cat];
    const icon = L.divIcon({
      className: '',
      html: `<div style="width:30px;height:30px;box-sizing:border-box;border:2px solid #14162B;border-radius:6px;background:${bg};display:flex;align-items:center;justify-content:center;font-family:'DM Mono',monospace;font-size:16px;font-weight:500;color:${fg};transform:translate(-50%,-100%);">+</div>`,
      iconSize: [0, 0]
    });

    if (pinMarkerRef.current) {
      pinMarkerRef.current.setLatLng([pin.lat, pin.lng]).setIcon(icon);
    } else {
      pinMarkerRef.current = L.marker([pin.lat, pin.lng], { icon }).addTo(map);
    }
  }, [pin, cat]);

  if (!activeTrip) {
    return (
      <div style={{ width: '100%', maxWidth: 390, height: 'calc(100vh - var(--ad-h, 0px))', maxHeight: 844, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: PAPER, padding: 20, boxSizing: 'border-box' }}>
        <div style={{ fontSize: 15, color: '#4A4D66', textAlign: 'center' }}>아직 선택된 일정이 없어요.</div>
        <button type="button" onClick={() => history.push('/main')} style={{ height: 48, padding: '0 20px', border: '2px solid #14162B', borderRadius: 10, background: INK, color: '#FFD84A', fontFamily: "'Black Han Sans', sans-serif", fontSize: 16, cursor: 'pointer' }}>
          새 일정 만들기
        </button>
      </div>
    );
  }

  const dayName = day + 1 + '일차';
  const date = dayDate(activeTrip, day);

  const renderRow = (key: string, c: Candidate, sub: string) => {
    const added = !!findAdded(c.name);
    return (
      <div key={key} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px 8px 14px', background: '#FFFFFF', border: '2px solid #14162B', borderRadius: 8 }}>
        <div style={{ width: 12, height: 12, flexShrink: 0, border: '2px solid #14162B', background: CAT_COLORS[c.cat][0] }} />
        <button type="button" aria-label={c.name + ' 상세정보'} onClick={() => setDetail(c)} style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 1, padding: 0, border: 0, background: 'transparent', color: INK, textAlign: 'left', cursor: 'pointer' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{c.name}</div>
          <div style={{ fontSize: 12, color: '#4A4D66', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
        </button>
        <button
          type="button"
          aria-label={c.name + (added ? ' 빼기' : ' 추가')}
          onClick={() => toggle(c)}
          style={{ flexShrink: 0, minWidth: 64, height: 44, padding: '0 10px', border: '2px solid #14162B', borderRadius: 8, background: added ? '#14162B' : '#FFD84A', color: added ? '#FFD84A' : INK, fontFamily: "'Black Han Sans', sans-serif", fontSize: 15, cursor: 'pointer' }}
        >
          {added ? '추가됨' : '추가'}
        </button>
      </div>
    );
  };

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 390, height: 'calc(100vh - var(--ad-h, 0px))', maxHeight: 844, margin: '0 auto', boxSizing: 'border-box', background: PAPER, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flexShrink: 0, background: '#2F3CF0', borderBottom: '2px solid #14162B', padding: '14px 20px 16px', display: 'flex', flexDirection: 'column', gap: 6, color: '#FFFFFF' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: -10 }}>
          <button type="button" aria-label="뒤로" onClick={() => history.push('/itinerary?day=' + day)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, border: 0, background: 'transparent', cursor: 'pointer' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="square" aria-hidden="true">
              <path d="M20 12H4M11 5l-7 7 7 7" />
            </svg>
          </button>
          <div style={{ minWidth: 0, fontFamily: "'DM Mono', monospace", fontSize: 12, letterSpacing: '0.12em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {activeTrip.destination} · {tripRange(activeTrip)}
          </div>
        </div>
        <h1 style={{ margin: 0, fontFamily: "'Black Han Sans', sans-serif", fontSize: 32, lineHeight: 1.1, fontWeight: 400 }}>{dayName} 어디 갈까요?</h1>
      </div>

      <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', margin: '14px 20px 0', border: '2px solid #14162B', borderRadius: 10, overflow: 'hidden' }}>
        <button type="button" onClick={() => setMode('search')} style={{ height: 44, border: 0, borderRight: '2px solid #14162B', background: mode === 'search' ? '#FFD84A' : '#FFFFFF', color: INK, fontFamily: "'Black Han Sans', sans-serif", fontSize: 16, cursor: 'pointer' }}>검색</button>
        <button type="button" onClick={() => setMode('map')} style={{ height: 44, border: 0, background: mode === 'map' ? '#FFD84A' : '#FFFFFF', color: INK, fontFamily: "'Black Han Sans', sans-serif", fontSize: 16, cursor: 'pointer' }}>지도에서 찍기</button>
      </div>

      <div style={{ flexShrink: 0, padding: '12px 20px 0' }}>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '2px 2px 8px' }}>
          {Array.from({ length: dayCount }, (_, i) => i).map((i) => (
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
      </div>

      {mode === 'search' && (
        <div style={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 20px 0' }}>
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label htmlFor="q" style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: '0.12em', color: '#4A4D66' }}>SEARCH · 장소 검색</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 52, padding: '0 14px', border: '2px solid #14162B', borderRadius: 10, background: '#FFFFFF', boxShadow: '4px 4px 0 #14162B' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#14162B" strokeWidth={2.4} strokeLinecap="square" aria-hidden="true">
                <circle cx="10" cy="10" r="6" />
                <path d="M15 15l6 6" />
              </svg>
              <input
                id="q"
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) search.searchFull();
                }}
                enterKeyHint="search"
                placeholder="가고 싶은 곳을 검색하세요"
                style={{ flexGrow: 1, minWidth: 0, height: 44, border: 0, outline: 0, background: 'transparent', fontSize: 16, color: INK, fontFamily: 'inherit' }}
              />
              {q && (
                <button type="button" aria-label="검색어 지우기" onClick={() => setQ('')} style={{ flexShrink: 0, width: 28, height: 28, border: 0, background: 'transparent', color: '#4A4D66', fontSize: 18, cursor: 'pointer' }}>×</button>
              )}
            </div>
          </div>
          {!qTrim && areas.length > 1 && (
            <div role="tablist" aria-label="추천 장소 지역" style={{ flexShrink: 0, display: 'flex', gap: 6, overflowX: 'auto', margin: '0 -20px', padding: '2px 20px 4px' }}>
              {[null, ...areas].map((a) => {
                const on = a === area;
                return (
                  <button
                    key={a || '전체'}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setArea(a)}
                    style={{ flexShrink: 0, height: 36, padding: '0 12px', border: '2px solid #14162B', borderRadius: 18, background: on ? '#14162B' : '#FFFFFF', color: on ? '#FFD84A' : INK, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer' }}
                  >
                    {a || '전체'}
                  </button>
                );
              })}
            </div>
          )}
          <div style={{ flexGrow: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 4px 8px 0' }}>
            {shownPicks.length > 0 && (
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: '0.12em', color: '#4A4D66' }}>PICKS · 추천 장소{area && !qTrim ? ' · ' + area : ''}</div>
            )}
            {groups.map((g) => (
              <React.Fragment key={'g-' + g.area}>
                {g.area && <div style={{ flexShrink: 0, paddingTop: 6, fontSize: 14, fontWeight: 700, color: INK }}>{g.area}</div>}
                {g.items.map((p) => renderRow('pick-' + p.area + p.name, p, p.cat + ' · ' + p.area))}
              </React.Fragment>
            ))}

            {qTrim && (
              <>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: '0.12em', color: '#4A4D66', paddingTop: 6 }}>RESULTS · 검색 결과</div>
                {search.loading && <div style={{ padding: '8px 4px', fontSize: 14, color: '#4A4D66' }}>{search.slow ? '더 넓게 찾는 중... (몇 초 걸려요)' : search.waitLong ? '검색 서버가 느려요. 조금만 기다려 주세요...' : '검색 중...'}</div>}
                {!search.loading && apiResults.map((r, i) => renderRow('api-' + i, { name: r.name, cat: r.cat || '관광', lat: r.lat, lng: r.lng }, (r.cat || '관광') + ' · ' + r.label))}
                {!search.loading && !search.error && apiResults.length === 0 && search.full && shownPicks.length === 0 && (
                  <div style={{ padding: '8px 4px', fontSize: 14, color: '#4A4D66', lineHeight: 1.5 }}>{tripArea && !search.wide ? '여행지 근처에서 찾지 못했어요. ' : '검색 결과가 없어요. '}{/[가-힣]/.test(q) ? '해외 장소는 한글 이름이 등록 안 된 곳이 많아요. 영어 이름으로 검색해 보거나 ' : ''}"지도에서 찍기"로 직접 추가해 보세요.</div>
                )}
                {!search.loading && !search.error && search.full && tripArea && !search.wide && (
                  <button type="button" onClick={search.searchWide} style={{ flexShrink: 0, height: 44, border: '2px dashed #14162B', borderRadius: 8, background: '#FFFFFF', color: INK, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                    여행지 밖까지 찾아보기
                  </button>
                )}
                {!search.loading && search.error && (
                  <button type="button" onClick={search.searchFull} style={{ flexShrink: 0, minHeight: 44, padding: '8px 12px', border: '2px dashed #14162B', borderRadius: 8, background: '#FFFBEA', color: INK, fontSize: 14, fontWeight: 700, cursor: 'pointer', lineHeight: 1.4 }}>
                    검색 서버 응답이 늦어요 · 다시 시도
                  </button>
                )}
                {!search.loading && !search.error && !search.full && (
                  <button type="button" onClick={search.searchFull} style={{ flexShrink: 0, height: 44, border: '2px dashed #14162B', borderRadius: 8, background: '#FFFBEA', color: INK, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                    “{q.trim()}” 더 찾아보기
                  </button>
                )}
              </>
            )}
            {!qTrim && shownPicks.length === 0 && (
              <div style={{ padding: '20px 4px', fontSize: 14, color: '#4A4D66', lineHeight: 1.5 }}>가고 싶은 곳을 검색하거나 "지도에서 찍기"로 추가해 보세요.</div>
            )}
          </div>
        </div>
      )}

      {mode === 'map' && (
        <div style={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 20px 0' }}>
          <div style={{ position: 'relative', flexGrow: 1, minHeight: 220, border: '2px solid #14162B', borderRadius: 10, overflow: 'hidden', background: '#F2EFE9' }}>
            <div ref={mapElRef} style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} />

            <div style={{ position: 'absolute', left: 8, right: 60, top: 8, zIndex: 1000 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 44, padding: '0 10px', border: '2px solid #14162B', borderRadius: 8, background: '#FFFFFF', boxShadow: '2px 2px 0 #14162B' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#14162B" strokeWidth={2.4} strokeLinecap="square" aria-hidden="true">
                  <circle cx="10" cy="10" r="6" />
                  <path d="M15 15l6 6" />
                </svg>
                <input
                  type="text"
                  value={mapQuery}
                  onChange={(e) => setMapQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) mapSearch.searchFull();
                  }}
                  enterKeyHint="search"
                  placeholder="주소나 장소를 검색하세요"
                  style={{ flexGrow: 1, minWidth: 0, height: 40, border: 0, outline: 0, background: 'transparent', fontSize: 14, color: INK, fontFamily: 'inherit' }}
                />
                {mapQuery && (
                  <button
                    type="button"
                    aria-label="검색어 지우기"
                    onClick={() => setMapQuery('')}
                    style={{ flexShrink: 0, width: 24, height: 24, border: 0, background: 'transparent', color: '#4A4D66', fontSize: 16, cursor: 'pointer' }}
                  >
                    ×
                  </button>
                )}
              </div>
              {mapQuery.trim() !== '' && (
                <div style={{ marginTop: 6, maxHeight: 220, overflowY: 'auto', border: '2px solid #14162B', borderRadius: 8, background: '#FFFFFF', boxShadow: '2px 2px 0 #14162B' }}>
                  {mapSearch.loading && (
                    <div style={{ padding: '10px 12px', fontSize: 13, color: '#4A4D66' }}>{mapSearch.slow ? '더 넓게 찾는 중... (몇 초 걸려요)' : mapSearch.waitLong ? '검색 서버가 느려요. 조금만 기다려 주세요...' : '검색 중...'}</div>
                  )}
                  {!mapSearch.loading && mapSearch.results.map((r, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => selectMapSearchResult(r)}
                      style={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%', boxSizing: 'border-box', textAlign: 'left', padding: '10px 12px', border: 0, borderBottom: i < mapSearch.results.length - 1 ? '1px solid #E4E0D8' : 0, background: '#FFFFFF', cursor: 'pointer' }}
                    >
                      <span style={{ fontSize: 14, fontWeight: 700, color: INK }}>{r.name}</span>
                      <span style={{ fontSize: 11, color: '#4A4D66' }}>{r.label}</span>
                    </button>
                  ))}
                  {!mapSearch.loading && !mapSearch.error && mapSearch.results.length === 0 && mapSearch.full && (
                    <div style={{ padding: '10px 12px', fontSize: 13, color: '#4A4D66' }}>{tripArea && !mapSearch.wide ? '이 근처에서 찾지 못했어요. ' : '검색 결과가 없어요. '}{/[가-힣]/.test(mapQuery) ? '영어 이름으로 검색해 보거나 ' : ''}지도를 직접 눌러 찍어 보세요.</div>
                  )}
                  {!mapSearch.loading && !mapSearch.error && mapSearch.full && tripArea && !mapSearch.wide && (
                    <button
                      type="button"
                      onClick={mapSearch.searchWide}
                      style={{ display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'left', padding: '10px 12px', border: 0, borderTop: '1px solid #E4E0D8', background: '#FFFFFF', color: INK, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                    >
                      더 먼 곳까지 찾아보기
                    </button>
                  )}
                  {!mapSearch.loading && mapSearch.error && (
                    <button
                      type="button"
                      onClick={mapSearch.searchFull}
                      style={{ display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'left', padding: '10px 12px', border: 0, background: '#FFFBEA', color: INK, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                    >
                      검색 서버 응답이 늦어요 · 다시 시도
                    </button>
                  )}
                  {!mapSearch.loading && !mapSearch.error && !mapSearch.full && (
                    <button
                      type="button"
                      onClick={mapSearch.searchFull}
                      style={{ display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'left', padding: '10px 12px', border: 0, borderTop: mapSearch.results.length ? '1px solid #E4E0D8' : 0, background: '#FFFBEA', color: INK, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                    >
                      “{mapQuery.trim()}” 더 찾아보기 (Enter)
                    </button>
                  )}
                </div>
              )}
            </div>

            {!pin && (
              <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', padding: '8px 14px', border: '2px solid #14162B', borderRadius: 8, background: '#FFD84A', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 900 }}>
                지도를 눌러 위치를 찍어 주세요
              </div>
            )}
            <div style={{ position: 'absolute', right: 8, top: 8, display: 'flex', flexDirection: 'column', border: '2px solid #14162B', borderRadius: 8, overflow: 'hidden', background: '#FFFFFF', zIndex: 1000 }}>
              <button type="button" aria-label="지도 확대" onClick={() => mapInstanceRef.current?.zoomIn()} style={{ width: 44, height: 44, border: 0, borderBottom: '2px solid #14162B', background: '#FFFFFF', color: INK, fontSize: 22, cursor: 'pointer' }}>+</button>
              <button type="button" aria-label="지도 축소" onClick={() => mapInstanceRef.current?.zoomOut()} style={{ width: 44, height: 44, border: 0, background: '#FFFFFF', color: INK, fontSize: 22, cursor: 'pointer' }}>−</button>
            </div>
          </div>
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input id="pname" aria-label="장소 이름" type="text" value={pname} onChange={(e) => setPname(e.target.value)} placeholder={isLookingUpName ? '장소 이름을 찾는 중...' : '지도를 찍으면 위치 이름이 나와요'} style={{ height: 44, boxSizing: 'border-box', padding: '0 14px', border: '2px solid #14162B', borderRadius: 10, background: '#FFFFFF', fontSize: 15, color: INK, fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: 6 }}>
              {(Object.keys(CAT_COLORS) as Category[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setCat(k)}
                  style={{ flexGrow: 1, height: 38, padding: 0, border: '2px solid #14162B', borderRadius: 8, background: k === cat ? CAT_COLORS[k][0] : '#FFFFFF', color: k === cat ? CAT_COLORS[k][1] : INK, fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                >
                  {k}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={!pin}
              onClick={addPin}
              style={{ height: 46, border: '2px solid #14162B', borderRadius: 10, background: '#FFD84A', color: INK, fontFamily: "'Black Han Sans', sans-serif", fontSize: 17, cursor: 'pointer', opacity: pin ? 1 : 0.4 }}
            >
              {dayName}에 추가
            </button>
          </div>
        </div>
      )}

      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px 20px', borderTop: '2px solid #14162B', background: PAPER }}>
        <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 13, color: '#4A4D66' }}>{dayName}{date ? ' · ' + fmtDay(date) : ''}</div>
          <div style={{ fontFamily: "'Black Han Sans', sans-serif", fontSize: 22 }}>{list.length}곳 담김</div>
        </div>
        <button
          type="button"
          onClick={() => history.push('/itinerary?day=' + day)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 150, height: 54, border: '2px solid #14162B', borderRadius: 10, background: INK, boxShadow: '4px 4px 0 #FFD84A', color: '#FFD84A', fontFamily: "'Black Han Sans', sans-serif", fontSize: 19, cursor: 'pointer' }}
        >
          일정 보기
        </button>
      </div>

      {detail && (
        <PlaceDetail
          place={detail}
          region={activeTrip ? tripRegion(activeTrip) : undefined}
          booking={activeTrip ? tripBooking(activeTrip) : undefined}
          onClose={() => setDetail(null)}
          action={{ label: findAdded(detail.name) ? '추가됨' : day + 1 + '일차에 추가', active: !!findAdded(detail.name), onClick: () => toggle(detail) }}
        />
      )}

      {toast && (
        <div role="status" style={{ position: 'absolute', left: 20, right: 20, bottom: 100, padding: '12px 16px', border: '2px solid #14162B', borderRadius: 10, background: INK, boxShadow: '4px 4px 0 #FFD84A', color: '#FFFFFF', fontSize: 14, fontWeight: 700, zIndex: 1100 }}>
          {toast}
        </div>
      )}
    </div>
  );
};

export default AddPlace;
