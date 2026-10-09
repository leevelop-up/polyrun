import React, { useEffect, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { Place, useTrip } from '../context/TripContext';
import { useNav } from '../context/NavContext';
import { CAT_COLORS, INK, MUTED, PAPER } from '../theme/palette';
import { dayDate, daySchedule, fmtDay, fmtHM, fmtStay, stayOf, tripRegion, tripTitle } from '../utils/trip';
import { findTodayTrip } from '../utils/today';
import { tripBooking } from '../utils/booking';
import { useRouteLegs } from '../hooks/useRouteLegs';
import { LocationDeniedError } from '../native/tracking';
import PlaceDetail from '../components/PlaceDetail';
import WeatherBadge from '../components/WeatherBadge';
import FlightCard from '../components/FlightCard';
import { flightsOnDay } from '../utils/flight';
import { useWeather } from '../hooks/useWeather';

// 다녀온 장소 체크 (이 기기에서만): { 일정 id: [장소 id] }
const DONE_KEY = 'runtrip_done';
const readDone = (): Record<string, string[]> => {
  try {
    return JSON.parse(window.localStorage.getItem(DONE_KEY) || '{}');
  } catch {
    return {};
  }
};

// 오늘 일정: 여행 중이면 오늘 일차, 내일 출발이면 1일차 미리 보기. "지금 갈 곳"과 길 안내를 크게 보여 준다.
const Today: React.FC = () => {
  const history = useHistory();
  const location = useLocation();
  const { trips, activeTripId, setActiveTrip } = useTrip();
  const { nav, startNav, goTo } = useNav();
  const [done, setDone] = useState<Record<string, string[]>>(readDone);
  const [detail, setDetail] = useState<Place | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const wanted = new URLSearchParams(location.search).get('trip');
  const today = findTodayTrip(trips, wanted || activeTripId);
  const trip = today?.trip;
  const day = today?.day ?? 0;
  const list = trip?.days[day] || [];
  const legOf = useRouteLegs(trip ? trip.days : []);
  const schedule = daySchedule(list, legOf);
  const weather = useWeather(trip);

  // 이 화면에서 고른 여행을 지금 일정으로 (일정·지도 화면이 같은 여행을 보도록)
  useEffect(() => {
    if (location.pathname === '/today' && trip && trip.id !== activeTripId) setActiveTrip(trip.id);
  }, [location.pathname, trip?.id]);

  // 여행 중·전날이 아니면(날짜가 지났거나 알림이 늦게 눌림) 내 일정으로
  useEffect(() => {
    if (location.pathname === '/today' && !today) history.replace('/my-trips');
  }, [location.pathname, !today]);

  if (!trip || !today) return null;

  const doneIds = new Set(done[trip.id] || []);
  const toggleDone = (p: Place) => {
    const ids = new Set(doneIds);
    if (ids.has(p.id)) ids.delete(p.id);
    else ids.add(p.id);
    const next = { ...done, [trip.id]: [...ids] };
    setDone(next);
    try {
      window.localStorage.setItem(DONE_KEY, JSON.stringify(next));
    } catch {
      // 저장 못 해도 화면에서는 체크된 채로
    }
  };

  const nextIdx = list.findIndex((p) => !doneIds.has(p.id));
  const next = nextIdx >= 0 ? list[nextIdx] : null;
  const navHere = !!nav && nav.tripId === trip.id && nav.day === day;
  const date = dayDate(trip, day);
  const isTomorrow = today.kind === 'tomorrow';
  const packLeft = (trip.checklist || []).filter((c) => !c.done).length;

  const guide = async (p: Place) => {
    setMsg(null);
    try {
      if (!navHere) await startNav(trip.id, day);
      goTo(p.id);
      history.push('/map?day=' + day);
    } catch (e) {
      setMsg(e instanceof LocationDeniedError ? '위치 권한을 허용해야 길 안내를 쓸 수 있어요' : '위치를 사용할 수 없어요');
    }
  };

  const bigBtn: React.CSSProperties = { flex: 1, height: 50, border: '2px solid #14162B', borderRadius: 10, fontFamily: "'Black Han Sans', sans-serif", fontSize: 16, cursor: 'pointer' };

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 390, height: 'calc(100vh - var(--ad-h, 0px))', maxHeight: 844, margin: '0 auto', boxSizing: 'border-box', background: PAPER, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flexShrink: 0, background: '#2F3CF0', borderBottom: '2px solid #14162B', padding: '14px 20px 18px', display: 'flex', flexDirection: 'column', gap: 8, color: '#FFFFFF' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: -10 }}>
          <button type="button" aria-label="내 일정" onClick={() => history.push('/my-trips')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, border: 0, background: 'transparent', cursor: 'pointer' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="square" aria-hidden="true">
              <path d="M20 12H4M11 5l-7 7 7 7" />
            </svg>
          </button>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, letterSpacing: '0.12em' }}>{isTomorrow ? 'TOMORROW' : 'TODAY'}</div>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, opacity: 0.9 }}>
          {isTomorrow ? '내일 출발 · 1일차 미리 보기' : day + 1 + '일차 · ' + (date ? fmtDay(date) : '')}
        </div>
        <h1 style={{ margin: 0, fontFamily: "'Black Han Sans', sans-serif", fontSize: 34, lineHeight: 1.1, fontWeight: 400 }}>{tripTitle(trip)}</h1>
        {weather.get(day) && <WeatherBadge w={weather.get(day)!} color="#FFFFFF" size={13} />}
      </div>

      <div style={{ flexGrow: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18, padding: '18px 20px 12px' }}>
        {list.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 0' }}>
            <div style={{ fontSize: 15, lineHeight: 1.6, color: MUTED }}>{isTomorrow ? '1일차' : '오늘'} 일정이 아직 비어 있어요.</div>
            <button type="button" onClick={() => history.push('/itinerary?day=' + day)} style={{ ...bigBtn, flex: 'none', background: '#FFD84A', color: INK, boxShadow: '3px 3px 0 #14162B' }}>
              일정 짜러 가기
            </button>
          </div>
        ) : next ? (
          <div style={{ border: '2px solid #14162B', borderRadius: 12, background: '#FFFFFF', boxShadow: '4px 4px 0 #14162B', padding: '16px 16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#2F3CF0' }}>{isTomorrow ? '첫 장소' : navHere && nav?.targetId === next.id ? '지금 가는 곳' : '다음 갈 곳'}</div>
              <div style={{ marginLeft: 'auto', fontFamily: "'DM Mono', monospace", fontSize: 12, color: MUTED }}>
                {nextIdx + 1} / {list.length}
              </div>
            </div>
            <button type="button" onClick={() => setDetail(next)} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 0, border: 0, background: 'transparent', color: INK, textAlign: 'left', cursor: 'pointer' }}>
              <div style={{ width: 16, height: 16, flexShrink: 0, marginTop: 8, border: '2px solid #14162B', background: CAT_COLORS[next.cat][0] }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "'Black Han Sans', sans-serif", fontSize: 26, lineHeight: 1.25 }}>{next.name}</div>
                <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>
                  {fmtHM(schedule[nextIdx].arrive)} 도착 예정 · {next.cat}
                  {stayOf(next) > 0 ? ' · ' + fmtStay(stayOf(next)) : ''}
                </div>
              </div>
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              {typeof next.lat === 'number' && !isTomorrow && (
                <button type="button" onClick={() => guide(next)} style={{ ...bigBtn, flex: 1.4, background: INK, color: '#FFD84A', boxShadow: '3px 3px 0 #FFD84A' }}>
                  {navHere ? '지도에서 보기' : '길 안내'}
                </button>
              )}
              {!isTomorrow && (
                <button type="button" onClick={() => toggleDone(next)} style={{ ...bigBtn, background: '#FFFFFF', color: INK }}>
                  다녀왔어요
                </button>
              )}
              {isTomorrow && (
                <button type="button" onClick={() => setDetail(next)} style={{ ...bigBtn, background: '#FFFFFF', color: INK }}>
                  상세정보
                </button>
              )}
            </div>
            {msg && <div style={{ fontSize: 13, fontWeight: 700, color: '#FF5A3C' }}>{msg}</div>}
          </div>
        ) : (
          <div style={{ border: '2px solid #14162B', borderRadius: 12, background: '#FFD84A', padding: '16px', fontFamily: "'Black Han Sans', sans-serif", fontSize: 20 }}>오늘 일정을 모두 다녀왔어요 🎉</div>
        )}

        {flightsOnDay(trip, day).map((k) => <FlightCard key={k} trip={trip} kind={k} indent={false} hideEmpty />)}

        {isTomorrow && (
          <button type="button" onClick={() => history.push('/checklist?from=today')} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 60, padding: '10px 14px', border: '2px solid #14162B', borderRadius: 12, background: packLeft ? '#FFD84A' : '#FFFFFF', color: INK, textAlign: 'left', cursor: 'pointer' }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#14162B" strokeWidth={2.2} strokeLinecap="square" aria-hidden="true">
              <path d="M5 8h14l-1 13H6L5 8zM9 8V5h6v3M9 14l2 2 4-4" />
            </svg>
            <div style={{ flexGrow: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'Black Han Sans', sans-serif", fontSize: 17 }}>준비물 챙기기</div>
              <div style={{ fontSize: 13, color: MUTED }}>{!trip.checklist ? '여행지에 맞는 기본 목록을 만들어 드려요' : packLeft ? packLeft + '개 아직 안 챙겼어요' : '다 챙겼어요'}</div>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#14162B" strokeWidth={2.6} strokeLinecap="square" aria-hidden="true">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {list.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{isTomorrow ? '1일차' : '오늘'} 일정 · {list.length}곳</div>
            {list.map((p, k) => {
              const isDone = doneIds.has(p.id);
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 52, borderBottom: '1px solid #D9D4C7', opacity: isDone ? 0.45 : 1 }}>
                  {!isTomorrow && (
                    <button type="button" aria-label={p.name + (isDone ? ' 다녀옴 취소' : ' 다녀옴')} onClick={() => toggleDone(p)} style={{ flexShrink: 0, width: 44, height: 44, marginLeft: -10, border: 0, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: 22, height: 22, boxSizing: 'border-box', border: '2px solid #14162B', borderRadius: 5, background: isDone ? INK : '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isDone && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFD84A" strokeWidth={3.4} strokeLinecap="square" aria-hidden="true">
                            <path d="M4 12l5 5L20 6" />
                          </svg>
                        )}
                      </div>
                    </button>
                  )}
                  <div style={{ flexShrink: 0, width: 46, fontFamily: "'DM Mono', monospace", fontSize: 13, color: MUTED }}>{fmtHM(schedule[k].arrive)}</div>
                  <button type="button" onClick={() => setDetail(p)} style={{ flexGrow: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, padding: 0, border: 0, background: 'transparent', color: INK, textAlign: 'left', cursor: 'pointer' }}>
                    <div style={{ width: 10, height: 10, flexShrink: 0, border: '2px solid #14162B', background: CAT_COLORS[p.cat][0] }} />
                    <div style={{ fontSize: 15, fontWeight: 700, textDecoration: isDone ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ flexShrink: 0, padding: '8px 20px 20px' }}>
        <button
          type="button"
          onClick={() => history.push('/itinerary?day=' + day)}
          style={{ width: '100%', height: 54, border: '2px solid #14162B', borderRadius: 10, background: '#FFFFFF', color: INK, fontFamily: "'Black Han Sans', sans-serif", fontSize: 18, cursor: 'pointer' }}
        >
          전체 일정 보기
        </button>
      </div>

      {detail && <PlaceDetail place={detail} region={tripRegion(trip)} booking={tripBooking(trip)} onClose={() => setDetail(null)} />}
    </div>
  );
};

export default Today;
