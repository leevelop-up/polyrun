import React from 'react';
import type { Trip } from '../context/TripContext';
import { INK, MUTED } from '../theme/palette';
import { fmtWon, spentOf } from '../utils/trip';
import DayExpenses from './DayExpenses';

// 일정 화면 "경비" 탭: 여행 전체 합계(1인당), 일차별 합계, 고른 일차의 사용 금액 입력
const TripMoney: React.FC<{ trip: Trip; day: number; onPickDay: (day: number) => void }> = ({ trip, day, onPickDay }) => {
  const total = spentOf(trip);
  const perDay = trip.days.map((_, i) => spentOf(trip, i));
  const max = Math.max(1, ...perDay);

  return (
    <div style={{ flexGrow: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18, padding: '8px 20px 16px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', border: '2px solid #14162B', borderRadius: 10, background: '#FFFFFF', boxShadow: '4px 4px 0 #14162B' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: '0.12em', color: MUTED }}>TOTAL · 여행 전체</div>
          {trip.pax > 1 && <div style={{ fontSize: 12, fontWeight: 700, color: MUTED }}>1인당 {fmtWon(Math.round(total / trip.pax))}</div>}
        </div>
        <div style={{ fontFamily: "'Black Han Sans', sans-serif", fontSize: 30, color: INK }}>{fmtWon(total)}</div>
        {trip.days.length > 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {perDay.map((v, i) => (
              <button key={i} type="button" onClick={() => onPickDay(i)} aria-label={i + 1 + '일차 사용 금액 보기'} style={{ display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr) auto', alignItems: 'center', gap: 8, minHeight: 32, padding: 0, border: 0, background: 'transparent', color: INK, cursor: 'pointer' }}>
                <span style={{ fontSize: 12, fontWeight: i === day ? 700 : 400, textAlign: 'left' }}>{i + 1}일차</span>
                <span style={{ height: 8, borderRadius: 4, background: '#EEEAE0', overflow: 'hidden' }}>
                  <span style={{ display: 'block', width: (v / max) * 100 + '%', height: '100%', background: i === day ? '#2F3CF0' : '#14162B' }} />
                </span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, textAlign: 'right' }}>{fmtWon(v)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <DayExpenses trip={trip} day={day} indent={false} />
    </div>
  );
};

export default TripMoney;
