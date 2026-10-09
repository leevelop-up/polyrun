import React, { useState } from 'react';
import { FlightKind, Trip, useTrip } from '../context/TripContext';
import { INK, MUTED, PAPER } from '../theme/palette';
import { FLIGHT_LABEL, flightStatusUrl, normalizeFlightNo } from '../utils/flight';
import { parseHM } from '../utils/trip';

const Plane: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#14162B" aria-hidden="true">
    <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
  </svg>
);

// 항공편 한 줄: 편명·출발 시각, 실시간 운항 정보(Flightradar24) 열기. 없으면 입력 버튼.
// indent: 일정 목록 안에서 장소 줄과 맞춰 들여쓴다. hideEmpty: 입력한 항공편만 보여 준다 (입력 버튼 없음)
const FlightCard: React.FC<{ trip: Trip; kind: FlightKind; indent?: boolean; hideEmpty?: boolean }> = ({ trip, kind, indent = true, hideEmpty = false }) => {
  const { setFlight } = useTrip();
  const f = trip.flights?.[kind];
  const [editing, setEditing] = useState(false);
  const [no, setNo] = useState('');
  const [time, setTime] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const open = () => {
    setNo(f?.no || '');
    setTime(f?.time || '');
    setErr(null);
    setEditing(true);
  };
  const save = () => {
    const n = normalizeFlightNo(no);
    if (!n) {
      setErr('편명은 항공사 코드 2자리 + 숫자예요 (예: KE123, 7C1101)');
      return;
    }
    setFlight(trip.id, kind, { no: n, ...(time && parseHM(time) !== null ? { time } : {}) });
    setEditing(false);
  };

  if (hideEmpty && !f) return null;
  const left = indent ? 32 : 0;

  const field: React.CSSProperties = { minWidth: 0, height: 48, boxSizing: 'border-box', padding: '0 12px', border: '2px solid #14162B', borderRadius: 8, background: '#FFFFFF', color: INK, fontSize: 16 };

  return (
    <>
      {f ? (
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, minHeight: 56, margin: '0 0 10px ' + left + 'px', padding: '6px 6px 6px 12px', border: '2px solid #14162B', borderRadius: 8, background: '#FFFFFF' }}>
          <Plane />
          <button type="button" aria-label={FLIGHT_LABEL[kind] + ' ' + f.no + ' 수정'} onClick={open} style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, padding: 0, border: 0, background: 'transparent', color: INK, textAlign: 'left', cursor: 'pointer' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: MUTED }}>{FLIGHT_LABEL[kind]}</span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 500 }}>
              {f.no}
              {f.time ? ' · ' + f.time + ' 출발' : ''}
            </span>
          </button>
          <button type="button" onClick={() => window.open(flightStatusUrl(f.no), '_blank')} style={{ flexShrink: 0, height: 40, padding: '0 10px', border: '2px solid #14162B', borderRadius: 6, background: '#FFD84A', color: INK, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            실시간 운항
          </button>
        </div>
      ) : (
        <button type="button" onClick={open} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 40, margin: '0 0 10px ' + left + 'px', border: '2px dashed #8A8CA3', borderRadius: 8, background: 'transparent', color: MUTED, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <Plane size={14} />+ {FLIGHT_LABEL[kind]} 항공편 입력
        </button>
      )}

      {editing && (
        // 시트 안의 터치가 일정 화면의 일차 넘기기 스와이프로 가지 않게
        <div onTouchEnd={(ev) => ev.stopPropagation()} onMouseUp={(ev) => ev.stopPropagation()}>
          <div onClick={() => setEditing(false)} style={{ position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, zIndex: 20, background: 'rgba(20,22,43,0.45)' }} />
          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              save();
            }}
            style={{ position: 'fixed', left: 0, right: 0, bottom: 'var(--ad-h, 0px)', zIndex: 21, maxWidth: 390, margin: '0 auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 12, padding: '18px 20px 20px', borderTop: '2px solid #14162B', background: PAPER }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontFamily: "'Black Han Sans', sans-serif", fontSize: 20 }}>{FLIGHT_LABEL[kind]} 항공편</div>
              <div style={{ fontSize: 13, lineHeight: 1.5, color: MUTED }}>편명을 넣으면 지연·게이트·지금 위치를 Flightradar24 에서 바로 볼 수 있어요.</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 120px', gap: 8 }}>
              <input
                value={no}
                onChange={(ev) => {
                  setNo(ev.target.value.slice(0, 10));
                  setErr(null);
                }}
                placeholder="편명 (예: KE123)"
                aria-label="편명"
                autoCapitalize="characters"
                autoComplete="off"
                style={{ ...field, fontFamily: "'DM Mono', monospace", textTransform: 'uppercase' }}
              />
              <input type="time" value={time} onChange={(ev) => setTime(ev.target.value)} aria-label="출발 시각" style={{ ...field, fontFamily: "'DM Mono', monospace" }} />
            </div>
            {err && <div style={{ fontSize: 13, fontWeight: 700, color: '#FF5A3C' }}>{err}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: f ? '1fr 1fr 2fr' : '1fr 2fr', gap: 8 }}>
              {f && (
                <button
                  type="button"
                  onClick={() => {
                    setFlight(trip.id, kind, null);
                    setEditing(false);
                  }}
                  style={{ height: 52, border: '2px solid #14162B', borderRadius: 10, background: '#FFFFFF', color: '#FF5A3C', fontFamily: "'Black Han Sans', sans-serif", fontSize: 17, cursor: 'pointer' }}
                >
                  삭제
                </button>
              )}
              <button type="button" onClick={() => setEditing(false)} style={{ height: 52, border: '2px solid #14162B', borderRadius: 10, background: '#FFFFFF', color: INK, fontFamily: "'Black Han Sans', sans-serif", fontSize: 17, cursor: 'pointer' }}>
                취소
              </button>
              <button type="submit" style={{ height: 52, border: '2px solid #14162B', borderRadius: 10, background: INK, boxShadow: '3px 3px 0 #FFD84A', color: '#FFD84A', fontFamily: "'Black Han Sans', sans-serif", fontSize: 17, cursor: 'pointer' }}>
                저장
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
};

export default FlightCard;
