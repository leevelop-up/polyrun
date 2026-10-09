import React, { useEffect, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { CheckItem, useTrip } from '../context/TripContext';
import { INK, MUTED, PAPER } from '../theme/palette';
import { dayDate, fmtDay, tripRange, tripTitle } from '../utils/trip';
import { defaultChecklist, GROUP_ORDER, makeItem, MY_GROUP, weatherSuggestions } from '../utils/checklist';
import { useWeather } from '../hooks/useWeather';
import { WeatherIcon } from '../components/WeatherBadge';

// 준비물 체크리스트: 묶음별로 챙긴 것을 체크하고, 직접 더하거나 지운다. 날씨 예보를 보고 챙길 것을 권한다
const Checklist: React.FC = () => {
  const history = useHistory();
  const location = useLocation();
  // 오늘 일정 화면에서 왔으면 그리로, 아니면 일정 화면의 준비 탭으로 돌아간다
  const back = new URLSearchParams(location.search).get('from') === 'today' ? '/today' : '/itinerary?tab=prep';
  const { activeTrip, setChecklist } = useTrip();
  const [text, setText] = useState('');
  const weather = useWeather(activeTrip);

  // 처음 열면 여행지(국내/해외)에 맞는 기본 목록으로 시작
  useEffect(() => {
    if (activeTrip && !activeTrip.checklist) setChecklist(activeTrip.id, defaultChecklist(activeTrip));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTrip?.id, !activeTrip?.checklist]);

  if (!activeTrip) {
    return (
      <div style={{ width: '100%', maxWidth: 390, height: 'calc(100vh - var(--ad-h, 0px))', maxHeight: 844, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: PAPER, padding: 20, boxSizing: 'border-box' }}>
        <div style={{ fontSize: 15, color: MUTED, textAlign: 'center' }}>아직 선택된 일정이 없어요.</div>
        <button type="button" onClick={() => history.push('/my-trips')} style={{ height: 48, padding: '0 20px', border: '2px solid #14162B', borderRadius: 10, background: INK, color: '#FFD84A', fontFamily: "'Black Han Sans', sans-serif", fontSize: 16, cursor: 'pointer' }}>
          내 일정 보기
        </button>
      </div>
    );
  }

  const trip = activeTrip;
  const items = trip.checklist || [];
  const doneCount = items.filter((i) => i.done).length;
  const save = (next: CheckItem[]) => setChecklist(trip.id, next);
  const toggle = (id: string) => save(items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  const remove = (id: string) => save(items.filter((i) => i.id !== id));
  const add = (t: string, group?: string) => {
    const v = t.trim().slice(0, 40);
    if (!v) return;
    save(items.concat([makeItem(v, group)]));
  };

  const forecastDays = [...weather.entries()].sort((a, b) => a[0] - b[0]);
  const suggestions = weatherSuggestions(items, forecastDays.map(([, w]) => w));

  // 기본 묶음 순서대로, 모르는 묶음(백업에서 온 것)은 뒤에
  const groups = [...new Set(items.map((i) => i.group))].sort((a, b) => {
    const ia = GROUP_ORDER.indexOf(a);
    const ib = GROUP_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  const pct = items.length ? Math.round((doneCount / items.length) * 100) : 0;

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 390, height: 'calc(100vh - var(--ad-h, 0px))', maxHeight: 844, margin: '0 auto', boxSizing: 'border-box', background: PAPER, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flexShrink: 0, background: '#2F3CF0', borderBottom: '2px solid #14162B', padding: '14px 20px 18px', display: 'flex', flexDirection: 'column', gap: 8, color: '#FFFFFF' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: -10 }}>
          <button type="button" aria-label="뒤로" onClick={() => history.push(back)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, border: 0, background: 'transparent', cursor: 'pointer' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="square" aria-hidden="true">
              <path d="M20 12H4M11 5l-7 7 7 7" />
            </svg>
          </button>
          <div style={{ flexGrow: 1, minWidth: 0, fontFamily: "'DM Mono', monospace", fontSize: 12, letterSpacing: '0.12em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {tripTitle(trip)} · {tripRange(trip)}
          </div>
        </div>
        <h1 style={{ margin: 0, fontFamily: "'Black Han Sans', sans-serif", fontSize: 36, lineHeight: 1.1, fontWeight: 400 }}>준비물</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flexGrow: 1, height: 10, border: '2px solid #FFFFFF', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ width: pct + '%', height: '100%', background: '#FFD84A', transition: 'width 200ms ease' }} />
          </div>
          <div style={{ flexShrink: 0, fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 500 }}>
            {doneCount} / {items.length} 챙김
          </div>
        </div>
      </div>

      <div style={{ flexGrow: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18, padding: '16px 20px 16px' }}>
        {forecastDays.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 14px', border: '2px solid #14162B', borderRadius: 10, background: '#FFFFFF' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: '0.12em', color: MUTED }}>WEATHER · 여행 기간 날씨</div>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
              {forecastDays.map(([i, w]) => {
                const d = dayDate(trip, i);
                return (
                  <div key={i} style={{ flexShrink: 0, minWidth: 56, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '6px 4px', border: '1.5px solid #D9D4C7', borderRadius: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700 }}>{i + 1}일차</div>
                    <WeatherIcon kind={w.kind} size={22} />
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{w.max}°/{w.min}°</div>
                    {d && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: MUTED }}>{fmtDay(d).split(' ')[0]}</div>}
                  </div>
                );
              })}
            </div>
            {suggestions.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {suggestions.map((s) => (
                  <button key={s.text} type="button" onClick={() => add(s.text, '날씨')} style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '0 10px', border: '2px solid #14162B', borderRadius: 18, background: '#FFD84A', color: INK, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    + {s.text}
                    <span style={{ fontSize: 11, fontWeight: 500, color: MUTED }}>{s.why}</span>
                  </button>
                ))}
              </div>
            )}
            <div style={{ fontSize: 10, color: MUTED }}>예보: 노르웨이 기상청(MET Norway)</div>
          </div>
        )}

        {groups.map((g) => {
          const list = items.filter((i) => i.group === g);
          const left = list.filter((i) => !i.done).length;
          return (
            <div key={g} style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{g}</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: MUTED }}>{left ? left + '개 남음' : '다 챙김'}</div>
              </div>
              {list.map((it) => (
                <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 4, minHeight: 48, borderBottom: '1px solid #D9D4C7' }}>
                  <button type="button" role="checkbox" aria-checked={it.done} onClick={() => toggle(it.id)} style={{ flexGrow: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, minHeight: 48, padding: 0, border: 0, background: 'transparent', color: INK, textAlign: 'left', cursor: 'pointer' }}>
                    <div style={{ flexShrink: 0, width: 22, height: 22, boxSizing: 'border-box', border: '2px solid #14162B', borderRadius: 5, background: it.done ? INK : '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {it.done && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFD84A" strokeWidth={3.4} strokeLinecap="square" aria-hidden="true">
                          <path d="M4 12l5 5L20 6" />
                        </svg>
                      )}
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 700, opacity: it.done ? 0.45 : 1, textDecoration: it.done ? 'line-through' : 'none', overflowWrap: 'anywhere' }}>{it.text}</span>
                  </button>
                  <button type="button" aria-label={it.text + ' 지우기'} onClick={() => remove(it.id)} style={{ flexShrink: 0, width: 44, height: 44, marginRight: -10, border: 0, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8A8CA3" strokeWidth={2.6} strokeLinecap="square" aria-hidden="true">
                      <path d="M5 5l14 14M19 5L5 19" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          );
        })}

        {items.length === 0 && trip.checklist && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 15, lineHeight: 1.5, color: MUTED }}>준비물이 비어 있어요. 아래에서 직접 더하거나 기본 목록을 넣어 보세요.</div>
            <button type="button" onClick={() => save(defaultChecklist(trip))} style={{ height: 48, border: '2px solid #14162B', borderRadius: 8, background: '#FFFFFF', color: INK, fontFamily: "'Black Han Sans', sans-serif", fontSize: 15, cursor: 'pointer' }}>
              기본 준비물 넣기
            </button>
          </div>
        )}

        {doneCount > 0 && (
          <button type="button" onClick={() => save(items.map((i) => ({ ...i, done: false })))} style={{ alignSelf: 'flex-start', height: 36, padding: '0 4px', border: 0, background: 'transparent', color: MUTED, fontSize: 13, fontWeight: 700, textDecoration: 'underline', cursor: 'pointer' }}>
            체크 모두 풀기
          </button>
        )}
      </div>

      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          add(text, MY_GROUP);
          setText('');
        }}
        style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, padding: '10px 20px 20px', borderTop: '2px solid #14162B', background: PAPER }}
      >
        <input
          value={text}
          onChange={(ev) => setText(ev.target.value.slice(0, 40))}
          placeholder="챙길 것 추가 (예: 수영복)"
          aria-label="챙길 것"
          style={{ minWidth: 0, height: 48, boxSizing: 'border-box', padding: '0 12px', border: '2px solid #14162B', borderRadius: 8, background: '#FFFFFF', color: INK, fontSize: 15 }}
        />
        <button type="submit" disabled={!text.trim()} style={{ height: 48, padding: '0 16px', border: '2px solid #14162B', borderRadius: 8, background: text.trim() ? INK : '#FFFFFF', color: text.trim() ? '#FFD84A' : '#8A8CA3', fontFamily: "'Black Han Sans', sans-serif", fontSize: 16, cursor: text.trim() ? 'pointer' : 'default' }}>
          추가
        </button>
      </form>
    </div>
  );
};

export default Checklist;
