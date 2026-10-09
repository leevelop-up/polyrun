import React from 'react';
import { useHistory } from 'react-router-dom';
import { INK } from '../theme/palette';

export type TripTab = 'plan' | 'map' | 'prep' | 'money';
const TABS: [TripTab, string][] = [
  ['plan', '일정'],
  ['map', '지도'],
  ['prep', '준비'],
  ['money', '경비']
];

// 일정·지도 화면 위 탭 막대. 지도는 따로 화면(/map), 나머지는 일정 화면의 탭(/itinerary?tab=).
// onSelect: 일정 화면처럼 화면 안에서 탭을 바꿀 수 있으면 그쪽에서 처리한다
const TripTabs: React.FC<{ current: TripTab; day: number; onSelect?: (tab: Exclude<TripTab, 'map'>) => void }> = ({ current, day, onSelect }) => {
  const history = useHistory();
  const go = (k: TripTab) => {
    if (k === current) return;
    if (k === 'map') history.push('/map?day=' + day);
    else if (onSelect) onSelect(k);
    else history.push('/itinerary?day=' + day + (k === 'plan' ? '' : '&tab=' + k));
  };
  return (
    <div role="tablist" style={{ flexShrink: 0, height: 48, boxSizing: 'border-box', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', margin: '16px 20px 0', border: '2px solid #14162B', borderRadius: 10, overflow: 'hidden' }}>
      {TABS.map(([k, label], i) => {
        const on = k === current;
        return (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => go(k)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 44, padding: 0, border: 0, borderLeft: i ? '2px solid #14162B' : 0, background: on ? '#FFD84A' : '#FFFFFF', color: INK, fontFamily: "'Black Han Sans', sans-serif", fontSize: 16, cursor: on ? 'default' : 'pointer' }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
};

export default TripTabs;
