import React from 'react';
import type { Trip } from '../context/TripContext';
import { CAT_COLORS, INK } from '../theme/palette';
import { dayDate, fmtDay } from '../utils/trip';
import type { DayWeather } from '../api/geo';
import { WeatherIcon } from './WeatherBadge';

// 처음 몇 곳만 이름으로 보여주고 나머지는 "외 N곳"
const PREVIEW = 3;

// 전체 일차 한눈에 보기: 일차마다 날짜, 장소 수, 장소 이름
const DayGrid: React.FC<{ trip: Trip; day: number; weather?: Map<number, DayWeather>; onPick: (day: number) => void }> = ({ trip, day, weather, onPick }) => (
  <div style={{ flexGrow: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 20px 20px' }}>
    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: '0.12em', color: '#4A4D66' }}>
      ALL DAYS · 전체 {trip.days.length}일 · {trip.days.reduce((s, d) => s + d.length, 0)}곳
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
      {trip.days.map((list, i) => {
        const dd = dayDate(trip, i);
        const on = i === day;
        const sub = on ? '#FFD84A' : '#4A4D66';
        const w = weather?.get(i);
        return (
          <button
            key={i}
            type="button"
            onClick={() => onPick(i)}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 6, minHeight: 128, padding: '10px 12px', border: '2px solid #14162B', borderRadius: 8, background: on ? '#14162B' : '#FFFFFF', color: on ? '#FFFFFF' : INK, cursor: 'pointer', textAlign: 'left' }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
              <span style={{ fontFamily: "'Black Han Sans', sans-serif", fontSize: 20, color: on ? '#FFD84A' : INK }}>{i + 1}일차</span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: sub }}>{dd ? fmtDay(dd) : ''}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, fontFamily: "'DM Mono', monospace", fontSize: 11, color: sub }}>
              <span style={{ whiteSpace: 'nowrap' }}>{list.length ? list.length + '곳' : '비어 있어요'}</span>
              {w && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <WeatherIcon kind={w.kind} size={15} color={on ? '#FFFFFF' : '#14162B'} />
                  {w.max}°/{w.min}°
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {list.slice(0, PREVIEW).map((p) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{ flexShrink: 0, width: 8, height: 8, border: '1.5px solid ' + (on ? '#FFFFFF' : '#14162B'), background: CAT_COLORS[p.cat][0] }} />
                  <span style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                </div>
              ))}
              {list.length > PREVIEW && <div style={{ fontSize: 12, color: sub }}>외 {list.length - PREVIEW}곳</div>}
            </div>
          </button>
        );
      })}
    </div>
  </div>
);

export default DayGrid;
