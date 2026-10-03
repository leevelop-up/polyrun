import React from 'react';
import { Trip } from '../context/TripContext';
import { NavState, placesOf, remainingOf, useNav } from '../context/NavContext';
import { CAT_COLORS, INK } from '../theme/palette';
import { fmtKm } from '../utils/nav';
import Walker from './Walker';

const btn: React.CSSProperties = { height: 44, padding: '0 14px', border: '2px solid #14162B', borderRadius: 8, fontFamily: "'Black Han Sans', sans-serif", fontSize: 15, cursor: 'pointer' };

// 지도 아래 이동 안내 카드: 출발 → 목적지 사이를 사람이 걸어가는 진행 막대, 남은 시간, 일정 대비 늦음
const NavCard: React.FC<{ nav: NavState; trip: Trip }> = ({ nav, trip }) => {
  const { stopNav, next } = useNav();
  const places = placesOf([trip], nav);
  const k = places.findIndex((p) => p.id === nav.targetId);
  const target = places[k];
  const nextPlace = places[k + 1];
  const dayList = trip.days[nav.day] || [];
  const num = target ? dayList.findIndex((p) => p.id === target.id) + 1 : 0;
  const r = remainingOf(nav);
  const progress = nav.status === 'arrived' ? 1 : nav.leg && nav.leg.total > 0 ? Math.min(1, nav.along / nav.leg.total) : 0;
  const mood = nav.status === 'arrived' || nav.status === 'done' ? 'cheer' : nav.status === 'moving' ? 'walking' : 'idle';

  let headline: React.ReactNode;
  if (nav.status === 'locating') headline = '현재 위치를 찾는 중…';
  else if (nav.status === 'done') headline = '오늘 일정 끝! 수고했어요 🎉';
  else if (!target) headline = '목적지를 정하는 중…';
  else if (nav.status === 'arrived') headline = target.name + ' 도착!';
  else headline = target.name + '(으)로 이동 중';

  return (
    <div style={{ margin: '12px 20px 0', border: '2px solid #14162B', borderRadius: 10, background: '#FFFFFF', boxShadow: '4px 4px 0 #14162B', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }} aria-live="polite">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {target && nav.status !== 'done' && (
          <div style={{ flexShrink: 0, width: 24, height: 24, boxSizing: 'border-box', border: '2px solid #14162B', borderRadius: 5, background: CAT_COLORS[target.cat][0], color: CAT_COLORS[target.cat][1], display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 500 }}>{num}</div>
        )}
        <div style={{ flexGrow: 1, minWidth: 0, fontFamily: "'Black Han Sans', sans-serif", fontSize: 18, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{headline}</div>
        {nav.leg && nav.status === 'moving' && (
          <div style={{ flexShrink: 0, padding: '2px 8px', border: '2px solid #14162B', borderRadius: 999, background: nav.leg.mode === 'car' ? '#2F3CF0' : '#7BD4A0', color: nav.leg.mode === 'car' ? '#FFFFFF' : INK, fontSize: 12, fontWeight: 700 }}>{nav.leg.mode === 'car' ? '차량' : '도보'}</div>
        )}
      </div>

      {/* 진행 막대: 지나온 길은 실선, 남은 길은 점선. 사람이 진행률 위치에 서 있다 */}
      <div style={{ position: 'relative', height: 44, margin: '0 6px' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 8, borderTop: '3px dashed #14162B', opacity: 0.35 }} />
        <div style={{ position: 'absolute', left: 0, bottom: 8, width: progress * 100 + '%', borderTop: '3px solid #14162B', transition: 'width 0.9s linear' }} />
        <div style={{ position: 'absolute', left: -4, bottom: 3, width: 12, height: 12, boxSizing: 'border-box', border: '2px solid #14162B', borderRadius: '50%', background: '#FFFFFF' }} />
        <div style={{ position: 'absolute', right: -6, bottom: 2, width: 14, height: 14, boxSizing: 'border-box', border: '2px solid #14162B', borderRadius: 3, background: target ? CAT_COLORS[target.cat][0] : '#FFD84A' }} />
        <Walker size={26} mood={mood} style={{ position: 'absolute', bottom: 6, left: 'calc(' + progress * 100 + '% - 13px)', transition: 'left 0.9s linear' }} />
      </div>

      {nav.status === 'moving' && r && (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 20, fontWeight: 500 }}>
            {r.min}분 <span style={{ fontSize: 13, color: '#4A4D66' }}>· {fmtKm(r.m)} 남음</span>
          </div>
        </div>
      )}
      {nav.status === 'routing' && <div style={{ fontSize: 13, color: '#4A4D66' }}>길 찾는 중…</div>}
      {nav.status === 'arrived' && target && (
        <div style={{ fontSize: 13, color: '#4A4D66' }}>
          {nextPlace ? '다음은 ' + nextPlace.name + ' · 출발하면 자동으로 안내해요' : '오늘의 마지막 장소예요'}
        </div>
      )}
      {nav.leg?.straight && nav.status === 'moving' && <div style={{ fontSize: 12, color: '#4A4D66' }}>길 정보를 받지 못해 직선 거리로 안내해요</div>}
      {nav.error && <div style={{ fontSize: 12, fontWeight: 700, color: '#FF5A3C' }}>{nav.error}</div>}

      <div style={{ display: 'flex', gap: 8 }}>
        {nav.status === 'arrived' && nextPlace && (
          <button type="button" onClick={next} style={{ ...btn, flexGrow: 1, background: INK, color: '#FFD84A', boxShadow: '3px 3px 0 #FFD84A' }}>
            {nextPlace.name}(으)로 출발
          </button>
        )}
        <button type="button" onClick={stopNav} style={{ ...btn, flexGrow: nav.status === 'arrived' && nextPlace ? 0 : 1, background: '#FFFFFF', color: INK }}>
          안내 종료
        </button>
      </div>
    </div>
  );
};

export default NavCard;
