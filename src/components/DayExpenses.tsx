import React, { useState } from 'react';
import { Trip, useTrip } from '../context/TripContext';
import { INK } from '../theme/palette';
import { fmtWon, spentOf } from '../utils/trip';

const MAX_AMOUNT = 999999999;

// 목록 화면 아래: 그 일차에 쓴 돈을 항목·금액으로 적고 합계를 보여준다
const DayExpenses: React.FC<{ trip: Trip; day: number }> = ({ trip, day }) => {
  const { addExpense, removeExpense } = useTrip();
  const [title, setTitle] = useState('');
  // 숫자만 들고 있고 화면에는 쉼표를 넣어 보여준다
  const [digits, setDigits] = useState('');
  const items = (trip.expenses || []).filter((e) => e.day === day);
  const amount = Math.min(MAX_AMOUNT, Number(digits) || 0);

  const add = () => {
    if (!amount) return;
    addExpense(trip.id, day, title.trim() || '지출', amount);
    setTitle('');
    setDigits('');
  };

  const field: React.CSSProperties = { minWidth: 0, height: 44, boxSizing: 'border-box', padding: '0 10px', border: '2px solid #14162B', borderRadius: 8, background: '#FFFFFF', color: INK, fontSize: 14 };

  return (
    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, margin: '4px 0 14px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: '0.12em', color: '#4A4D66' }}>SPEND · {day + 1}일차 사용 금액</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 500 }}>{fmtWon(spentOf(trip, day))}</div>
      </div>

      {items.map((e) => (
        <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 4px 0 12px', border: '2px solid #14162B', borderRadius: 8, background: '#FFFFFF' }}>
          <div style={{ flexGrow: 1, minWidth: 0, fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</div>
          <div style={{ flexShrink: 0, fontFamily: "'DM Mono', monospace", fontSize: 14 }}>{fmtWon(e.amount)}</div>
          <button type="button" aria-label={e.title + ' ' + fmtWon(e.amount) + ' 지우기'} onClick={() => removeExpense(trip.id, e.id)} style={{ flexShrink: 0, width: 40, height: 40, border: 0, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#14162B" strokeWidth={2.6} strokeLinecap="square" aria-hidden="true">
              <path d="M5 5l14 14M19 5L5 19" />
            </svg>
          </button>
        </div>
      ))}

      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          add();
        }}
        style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 112px auto', gap: 6 }}
      >
        <input value={title} onChange={(ev) => setTitle(ev.target.value.slice(0, 30))} placeholder="항목 (예: 점심)" aria-label="사용 항목" style={field} />
        <input
          value={digits ? Number(digits).toLocaleString('ko-KR') : ''}
          onChange={(ev) => setDigits(ev.target.value.replace(/\D/g, '').slice(0, 9))}
          inputMode="numeric"
          placeholder="금액(원)"
          aria-label="금액(원)"
          style={{ ...field, textAlign: 'right', fontFamily: "'DM Mono', monospace" }}
        />
        <button type="submit" disabled={!amount} style={{ height: 44, padding: '0 12px', border: '2px solid #14162B', borderRadius: 8, background: amount ? INK : '#FFFFFF', color: amount ? '#FFD84A' : '#8A8CA3', fontFamily: "'Black Han Sans', sans-serif", fontSize: 15, cursor: amount ? 'pointer' : 'default' }}>
          추가
        </button>
      </form>
    </div>
  );
};

export default DayExpenses;
