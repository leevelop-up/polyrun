import React, { useEffect, useRef, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { useTrip } from '../context/TripContext';
import { dayCount } from '../utils/trip';
import { INK, PAPER } from '../theme/palette';
import { DESTINATIONS, findDestination, matchDestination } from '../data/destinations';
import { GeoSearchResult, searchPlaces } from '../api/geo';

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function fmt(t: number): string {
  const d = new Date(t);
  return d.getMonth() + 1 + '월 ' + d.getDate() + '일 (' + DAY_LABELS[d.getDay()] + ')';
}

// editing: 지금 일정(activeTrip)의 목적지·날짜·인원을 고치는 화면 (/edit-trip)
const Main: React.FC<{ editing?: boolean }> = ({ editing = false }) => {
  const history = useHistory();
  const location = useLocation();
  const { createTrip, updateTrip, activeTrip } = useTrip();
  const editTrip = editing ? activeTrip : null;
  // 날짜를 줄여서 없어지는 일차에 장소가 있을 때 확인
  const [confirmShrink, setConfirmShrink] = useState<{ removed: number; places: number; lastDay: number } | null>(null);

  const now = new Date();
  // 새 일정은 목적지를 비워 두고 직접 고르게 한다
  const [dest, setDest] = useState('');
  // 목적지 없이 "일정 만들기"를 누르면 목적지부터 고르게 하고, 고르면 이어서 날짜를 고르게 한다
  const [createAfterDest, setCreateAfterDest] = useState(false);
  // 목록에 없는 도시를 검색해서 고른 경우의 지도 중심
  const [destCenter, setDestCenter] = useState<[number, number] | undefined>(undefined);
  const [sheet, setSheet] = useState<'dest' | 'date' | null>(null);
  // 날짜 없이 "일정 만들기"를 누르면 날짜부터 고르게 하고, 다 고르면 바로 만든다
  const [createAfterDate, setCreateAfterDate] = useState(false);
  const [cityResults, setCityResults] = useState<GeoSearchResult[] | null>(null);
  const [cityLoading, setCityLoading] = useState(false);
  const citySeq = useRef(0);
  const [q, setQ] = useState('');
  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);
  const [vy, setVy] = useState(now.getFullYear());
  const [vm, setVm] = useState(now.getMonth());
  const [pax, setPax] = useState(2);
  // 직접 입력한 목적지의 지도 위치를 찾는 중
  const [creating, setCreating] = useState(false);

  // 수정 화면에 들어올 때마다 지금 일정 정보로 채운다 (Ionic 은 화면을 재사용하므로 마운트 때만으로는 부족)
  useEffect(() => {
    if (!editing || location.pathname !== '/edit-trip' || !activeTrip) return;
    setDest(activeTrip.destination);
    setDestCenter(activeTrip.center);
    setStart(activeTrip.startDate);
    setEnd(activeTrip.endDate);
    setPax(activeTrip.pax);
    setConfirmShrink(null);
    if (activeTrip.startDate) {
      const d = new Date(activeTrip.startDate);
      setVy(d.getFullYear());
      setVm(d.getMonth());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, location.pathname, activeTrip?.id]);

  // 새 일정 화면에 들어올 때마다 입력을 비운다 (다른 화면에 다녀와도 전에 고른 목적지·날짜가 남지 않게)
  useEffect(() => {
    if (editing || location.pathname !== '/main') return;
    setDest('');
    setDestCenter(undefined);
    setStart(null);
    setEnd(null);
    setPax(2);
    setSheet(null);
    setCreateAfterDest(false);
    setCreateAfterDate(false);
    setVy(now.getFullYear());
    setVm(now.getMonth());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, location.pathname]);

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const first = new Date(vy, vm, 1);
  const daysInMonth = new Date(vy, vm + 1, 0).getDate();
  const atMin = !editing && vy === now.getFullYear() && vm === now.getMonth();

  const qTrim = q.trim();
  const places = DESTINATIONS.filter((p) => matchDestination(p, qTrim));

  const searchCity = async () => {
    if (!qTrim) return;
    const seq = ++citySeq.current;
    setCityLoading(true);
    try {
      const r = await searchPlaces(qTrim, { city: true });
      if (seq === citySeq.current) setCityResults(r);
    } catch {
      if (seq === citySeq.current) setCityResults([]);
    } finally {
      if (seq === citySeq.current) setCityLoading(false);
    }
  };

  const closeDestSheet = () => {
    citySeq.current++;
    setSheet(null);
    setQ('');
    setCityResults(null);
    setCityLoading(false);
  };

  const cells: { label: string; aria: string; border: string; bg: string; color: string; onClick: () => void }[] = [];
  for (let i = 0; i < first.getDay(); i++) {
    cells.push({ label: '', aria: '', border: '0', bg: 'transparent', color: INK, onClick: () => {} });
  }
  for (let n = 1; n <= daysInMonth; n++) {
    const t = new Date(vy, vm, n).getTime();
    const past = !editing && t < today;
    const isS = t === start;
    const isE = t === end;
    const mid = !!start && !!end && t > start && t < end;
    cells.push({
      label: String(n),
      aria: vm + 1 + '월 ' + n + '일',
      border: t === today ? '2px solid #14162B' : '0',
      bg: isS || isE ? '#2F3CF0' : mid ? '#FFD84A' : 'transparent',
      color: isS || isE ? '#FFFFFF' : past ? '#B5B2A8' : '#14162B',
      onClick: () => {
        if (past) return;
        if (!start || end) {
          setStart(t);
          setEnd(null);
        } else if (t < start) {
          setStart(t);
        } else {
          setEnd(t);
        }
      }
    });
  }

  const nights = start && end ? Math.round((end - start) / 86400000) : 0;
  const summary = !start ? '출발일을 선택하세요' : !end ? '도착일을 선택하세요 (그대로 완료하면 당일치기)' : nights === 0 ? '당일치기' : nights + '박 ' + (nights + 1) + '일';

  const shiftMonth = (k: number) => {
    const d = new Date(vy, vm + k, 1);
    setVy(d.getFullYear());
    setVm(d.getMonth());
  };

  // 직접 입력한 목적지를 목적지로 정한다. 지도 위치는 일정을 만들 때 찾는다.
  const applyTypedDest = () => {
    if (!qTrim) return;
    const preset = DESTINATIONS.find((d) => d.name === qTrim);
    setDest(preset ? preset.name : qTrim);
    setDestCenter(undefined);
    closeDestSheet();
  };

  const create = async (s: number, e: number) => {
    // 수정 화면인데 고칠 일정이 없으면(새로고침 등) 새로 만들지 않고 목록으로
    if (editing && !editTrip) {
      history.push('/my-trips');
      return;
    }
    let center = destCenter;
    // 수정: 목적지를 그대로 두면 저장된 지도 위치도 그대로 쓴다
    if (editTrip && dest === editTrip.destination) center = editTrip.center;
    // 직접 입력한 목적지는 도시 검색으로 지도 위치를 찾는다 (못 찾아도 일정은 만들고, 지도는 장소를 추가하면 그쪽으로 간다)
    if (!center && !findDestination(dest)) {
      setCreating(true);
      try {
        const [hit] = await searchPlaces(dest, { city: true });
        if (hit) center = [hit.lat, hit.lng];
      } catch {
        // 위치를 못 찾은 채로 진행
      } finally {
        setCreating(false);
      }
    }
    if (editTrip) {
      updateTrip(editTrip.id, { destination: dest, startDate: s, endDate: e, pax, center });
      history.push('/itinerary?day=0');
      return;
    }
    createTrip(dest, s, e, pax, center);
    history.push('/add-place?day=0');
  };

  // 수정 저장: 일차가 줄어 장소가 옮겨지면 먼저 알려준다
  const save = (s: number, e: number) => {
    if (editTrip && !confirmShrink) {
      const n = dayCount(s, e);
      const moved = editTrip.days.slice(n).reduce((sum, d) => sum + d.length, 0);
      if (moved > 0) {
        setConfirmShrink({ removed: editTrip.days.length - n, places: moved, lastDay: n });
        return;
      }
    }
    setConfirmShrink(null);
    create(s, e);
  };

  const handleCreate = () => {
    if (!dest) {
      setCreateAfterDest(true);
      setSheet('dest');
      return;
    }
    if (!start || !end) {
      setCreateAfterDate(true);
      setSheet('date');
      return;
    }
    save(start, end);
  };

  useEffect(() => {
    if (!createAfterDest || !dest) return;
    setCreateAfterDest(false);
    if (!start || !end) {
      setCreateAfterDate(true);
      setSheet('date');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dest, createAfterDest]);

  const closeDateSheet = () => {
    setSheet(null);
    setCreateAfterDate(false);
  };

  const completeDate = () => {
    if (!start) return;
    const e = end ?? start;
    if (!end) setEnd(start);
    setSheet(null);
    if (createAfterDate) {
      setCreateAfterDate(false);
      save(start, e);
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 390,
        height: 'calc(100vh - var(--ad-h, 0px))',
        maxHeight: 844,
        margin: '0 auto',
        boxSizing: 'border-box',
        padding: '26px 20px 24px',
        background: PAPER,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        overflow: 'hidden'
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 12 }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, letterSpacing: '0.12em', color: INK }}>
          {editing ? 'EDIT TRIP' : 'NEW TRIP — 001'}
        </div>
        <h1
          style={{
            margin: 0,
            fontFamily: "'Black Han Sans', sans-serif",
            fontSize: 52,
            lineHeight: 1.1,
            fontWeight: 400,
            color: INK
          }}
        >
          {editing ? (
            <>
              일정
              <br />
              수정하기
            </>
          ) : (
            <>
              어디로
              <br />
              떠날까요?
            </>
          )}
        </h1>
      </div>

      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: '#FFFFFF',
          border: '2px solid #14162B',
          borderRadius: 10,
          boxShadow: '4px 4px 0 #14162B',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '14px 18px 8px' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: '0.12em', color: '#4A4D66' }}>
            DESTINATION · 목적지
          </div>
          <button
            type="button"
            onClick={() => setSheet('dest')}
            aria-label="목적지 선택"
            style={{
              height: 48,
              boxSizing: 'border-box',
              padding: 0,
              border: 0,
              background: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              textAlign: 'left',
              fontFamily: "'Black Han Sans', sans-serif",
              fontSize: 30,
              color: '#2F3CF0',
              width: '100%'
            }}
          >
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: dest ? undefined : '#8A8CA3' }}>{dest || '목적지 선택'}</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#14162B" strokeWidth={2.6} strokeLinecap="square" aria-hidden="true">
              <path d="M5 9l7 7 7-7" />
            </svg>
          </button>
        </div>
        <div style={{ position: 'relative', height: 20 }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: 20, height: 20, marginLeft: -12, boxSizing: 'border-box', border: '2px solid #14162B', borderRadius: 10, background: PAPER }} />
          <div style={{ position: 'absolute', right: 0, top: 0, width: 20, height: 20, marginRight: -12, boxSizing: 'border-box', border: '2px solid #14162B', borderRadius: 10, background: PAPER }} />
          <div style={{ position: 'absolute', left: 16, right: 16, top: 9, borderTop: '2px dashed #14162B' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, padding: '8px 18px 6px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: '0.12em', color: '#4A4D66' }}>FROM · 출발</div>
            <button
              type="button"
              onClick={() => setSheet('date')}
              aria-label="출발일 선택"
              style={{ height: 44, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: "'Noto Sans KR', sans-serif", fontSize: 17, fontWeight: 700, color: INK }}
            >
              {start ? fmt(start) : '날짜 선택'}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: '0.12em', color: '#4A4D66' }}>TO · 도착</div>
            <button
              type="button"
              onClick={() => setSheet('date')}
              aria-label="도착일 선택"
              style={{ height: 44, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: "'Noto Sans KR', sans-serif", fontSize: 17, fontWeight: 700, color: INK }}
            >
              {end ? fmt(end) : '날짜 선택'}
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 10px 8px 18px', borderTop: '2px dashed #14162B', marginTop: 8 }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: '0.12em', color: '#4A4D66' }}>PASSENGERS · 인원</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <button
              type="button"
              aria-label="인원 줄이기"
              onClick={() => setPax((p) => Math.max(1, p - 1))}
              style={{ width: 44, height: 44, border: 0, background: 'transparent', color: INK, fontSize: 22, cursor: 'pointer', opacity: pax <= 1 ? 0.3 : 1 }}
            >
              −
            </button>
            <div style={{ width: 28, textAlign: 'center', fontFamily: "'DM Mono', monospace", fontSize: 20, fontWeight: 500 }} aria-live="polite">
              {pax}
            </div>
            <button
              type="button"
              aria-label="인원 늘리기"
              onClick={() => setPax((p) => Math.min(10, p + 1))}
              style={{ width: 44, height: 44, border: 0, background: 'transparent', color: INK, fontSize: 22, cursor: 'pointer', opacity: pax >= 10 ? 0.3 : 1 }}
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div style={{ flexGrow: 1 }} />

      <button
        type="button"
        onClick={handleCreate}
        disabled={creating}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 58,
          padding: '0 22px',
          border: '2px solid #14162B',
          borderRadius: 10,
          background: INK,
          boxShadow: '4px 4px 0 #FFD84A',
          color: '#FFD84A',
          fontFamily: "'Black Han Sans', sans-serif",
          fontSize: 22,
          cursor: creating ? 'default' : 'pointer',
          opacity: creating ? 0.7 : 1
        }}
      >
        {creating ? (editing ? '저장하는 중...' : '만드는 중...') : editing ? '수정 완료' : '일정 만들기'}
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFD84A" strokeWidth={2.4} strokeLinecap="square" aria-hidden="true">
          <path d="M4 12h16M13 5l7 7-7 7" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => history.push(editing ? '/itinerary' : '/my-trips')}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 58,
          padding: '0 22px',
          border: '2px solid #14162B',
          borderRadius: 10,
          background: '#FFFFFF',
          color: INK,
          fontFamily: "'Black Han Sans', sans-serif",
          fontSize: 22,
          cursor: 'pointer'
        }}
      >
        {editing ? '취소' : '내 일정 보기'}
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#14162B" strokeWidth={2.4} strokeLinecap="square" aria-hidden="true">
          <path d="M4 12h16M13 5l7 7-7 7" />
        </svg>
      </button>

      {sheet === 'dest' && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, background: 'rgba(20,22,43,0.5)', display: 'flex', alignItems: 'flex-end' }}>
          <div role="dialog" aria-label="목적지 선택" style={{ width: '100%', boxSizing: 'border-box', maxHeight: 640, background: PAPER, borderTop: '2px solid #14162B', padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: "'Black Han Sans', sans-serif", fontSize: 24 }}>어디로 가세요?</div>
              <button type="button" aria-label="닫기" onClick={() => { setCreateAfterDest(false); closeDestSheet(); }} style={{ width: 44, height: 44, marginRight: -10, border: 0, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#14162B" strokeWidth={2.6} strokeLinecap="square" aria-hidden="true">
                  <path d="M5 5l14 14M19 5L5 19" />
                </svg>
              </button>
            </div>
            <input
              type="text"
              aria-label="목적지 입력"
              placeholder="가고 싶은 도시를 입력하세요"
              value={q}
              onInput={(e) => {
                setQ((e.target as HTMLInputElement).value);
                setCityResults(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) applyTypedDest();
              }}
              enterKeyHint="done"
              style={{ height: 48, boxSizing: 'border-box', padding: '0 14px', border: '2px solid #14162B', borderRadius: 10, background: '#FFFFFF', fontSize: 16, outline: 0, fontFamily: 'inherit' }}
            />
            {qTrim && !DESTINATIONS.some((d) => d.name === qTrim) && (
              <button
                type="button"
                onClick={applyTypedDest}
                style={{ minHeight: 48, border: '2px solid #14162B', borderRadius: 10, background: INK, boxShadow: '3px 3px 0 #FFD84A', color: '#FFD84A', fontFamily: "'Black Han Sans', sans-serif", fontSize: 17, cursor: 'pointer' }}
              >
                “{qTrim}”(으)로 정하기
              </button>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', maxHeight: 380, border: '2px solid #14162B', borderRadius: 10, background: '#FFFFFF' }}>
              {places.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => {
                    setDest(p.name);
                    setDestCenter(undefined);
                    closeDestSheet();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: 52,
                    padding: '0 16px',
                    border: 0,
                    borderBottom: '1px solid #14162B',
                    background: p.name === dest ? '#FFD84A' : '#FFFFFF',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: 16,
                    fontWeight: 700,
                    color: INK
                  }}
                >
                  {p.name}
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 400, color: '#4A4D66' }}>{p.code}</span>
                </button>
              ))}
              {/* 목록에 없는 도시는 동음이의(런던: 영국/캐나다)를 가려 고를 수 있게 후보를 찾아 준다 */}
              {qTrim && !cityResults && (
                <button
                  type="button"
                  onClick={searchCity}
                  disabled={cityLoading}
                  style={{ minHeight: 44, padding: '0 16px', border: 0, background: '#FFFFFF', color: '#4A4D66', fontSize: 13, fontWeight: 700, textAlign: 'left', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  {cityLoading ? '찾는 중...' : '“' + qTrim + '” 비슷한 도시 후보 보기'}
                </button>
              )}
              {cityResults && cityResults.length === 0 && (
                <div style={{ padding: '14px 16px', fontSize: 14, color: '#4A4D66', lineHeight: 1.5 }}>“{qTrim}”을(를) 찾지 못했어요. 도시 이름을 다시 확인해 주세요.</div>
              )}
              {cityResults && cityResults.map((r, i) => {
                const country = r.label.split(',').pop()?.trim() || '';
                const name = country && country !== r.name ? r.name + ', ' + country : r.name;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setDest(name);
                      setDestCenter([r.lat, r.lng]);
                      closeDestSheet();
                    }}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '10px 16px', border: 0, borderBottom: '1px solid #14162B', background: '#FFFFFF', cursor: 'pointer', textAlign: 'left', color: INK }}
                  >
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{name}</span>
                    <span style={{ fontSize: 11, color: '#4A4D66' }}>{r.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {confirmShrink && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, background: 'rgba(20,22,43,0.5)', display: 'flex', alignItems: 'flex-end' }}>
          <div role="dialog" aria-label="일차 줄이기 확인" style={{ width: '100%', boxSizing: 'border-box', background: PAPER, borderTop: '2px solid #14162B', padding: '18px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontFamily: "'Black Han Sans', sans-serif", fontSize: 22 }}>여행이 {confirmShrink.removed}일 줄어요</div>
            <div style={{ fontSize: 15, lineHeight: 1.5 }}>
              없어지는 일차의 장소 {confirmShrink.places}곳은 {confirmShrink.lastDay}일차 끝으로 옮겨져요.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <button type="button" onClick={() => setConfirmShrink(null)} style={{ height: 52, border: '2px solid #14162B', borderRadius: 10, background: '#FFFFFF', color: INK, fontFamily: "'Black Han Sans', sans-serif", fontSize: 17, cursor: 'pointer' }}>취소</button>
              <button type="button" onClick={() => start && create(start, end ?? start)} style={{ height: 52, border: '2px solid #14162B', borderRadius: 10, background: INK, boxShadow: '3px 3px 0 #FFD84A', color: '#FFD84A', fontFamily: "'Black Han Sans', sans-serif", fontSize: 17, cursor: 'pointer' }}>그래도 저장</button>
            </div>
          </div>
        </div>
      )}

      {sheet === 'date' && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, background: 'rgba(20,22,43,0.5)', display: 'flex', alignItems: 'flex-end' }}>
          <div role="dialog" aria-label="날짜 선택" style={{ width: '100%', boxSizing: 'border-box', background: PAPER, borderTop: '2px solid #14162B', padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: "'Black Han Sans', sans-serif", fontSize: 24 }}>{createAfterDate ? '여행 날짜를 먼저 골라 주세요' : '날짜 선택'}</div>
              <button type="button" aria-label="닫기" onClick={closeDateSheet} style={{ width: 44, height: 44, marginRight: -10, border: 0, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#14162B" strokeWidth={2.6} strokeLinecap="square" aria-hidden="true">
                  <path d="M5 5l14 14M19 5L5 19" />
                </svg>
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button
                type="button"
                aria-label="이전 달"
                onClick={() => {
                  if (!atMin) shiftMonth(-1);
                }}
                style={{ width: 44, height: 44, border: '2px solid #14162B', borderRadius: 10, background: '#FFFFFF', cursor: 'pointer', opacity: atMin ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#14162B" strokeWidth={2.6} strokeLinecap="square" aria-hidden="true">
                  <path d="M15 5l-7 7 7 7" />
                </svg>
              </button>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 16, fontWeight: 500, letterSpacing: '0.08em' }}>
                {vy}.{String(vm + 1).padStart(2, '0')}
              </div>
              <button
                type="button"
                aria-label="다음 달"
                onClick={() => shiftMonth(1)}
                style={{ width: 44, height: 44, border: '2px solid #14162B', borderRadius: 10, background: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#14162B" strokeWidth={2.6} strokeLinecap="square" aria-hidden="true">
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', textAlign: 'center', fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#4A4D66' }}>
              {DAY_LABELS.map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', rowGap: 2, border: '2px solid #14162B', borderRadius: 10, background: '#FFFFFF', padding: '6px 2px' }}>
              {cells.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={c.aria}
                  onClick={c.onClick}
                  style={{ height: 44, margin: '0 1px', padding: 0, border: c.border, borderRadius: 8, background: c.bg, color: c.color, fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 500, cursor: 'pointer' }}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.4 }}>{summary}</div>
              <button
                type="button"
                onClick={completeDate}
                disabled={!start}
                style={{ flexShrink: 0, height: 48, padding: '0 22px', border: '2px solid #14162B', borderRadius: 10, background: INK, boxShadow: '3px 3px 0 #FFD84A', color: '#FFD84A', fontFamily: "'Black Han Sans', sans-serif", fontSize: 18, cursor: start ? 'pointer' : 'default', opacity: start ? 1 : 0.4 }}
              >
                {createAfterDate ? (editing ? '수정 완료' : '일정 만들기') : '선택 완료'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Main;
