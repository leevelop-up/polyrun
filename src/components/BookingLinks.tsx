import React from 'react';
import { INK, MUTED } from '../theme/palette';
import { AFFILIATE_NOTICE } from '../utils/booking';

export type BookingLink = { label: string; site: string; href: string };

type Props = { title: string; links: BookingLink[] };

// 숙소·투어 예약 버튼 묶음 (제휴 링크). 외부 사이트는 기기 브라우저로 연다.
const BookingLinks: React.FC<Props> = ({ title, links }) => {
  if (!links.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: INK }}>{title}</div>
        <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, border: '1px solid ' + MUTED, borderRadius: 4, padding: '0 4px' }}>광고</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(' + Math.min(links.length, 3) + ', minmax(0, 1fr))', gap: 8 }}>
        {links.map((l) => (
          <button
            key={l.href}
            type="button"
            onClick={() => window.open(l.href, '_blank')}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, minHeight: 52, padding: '6px 4px', border: '2px solid #14162B', borderRadius: 10, background: '#FFFFFF', color: INK, cursor: 'pointer' }}
          >
            <span style={{ fontFamily: "'Black Han Sans', sans-serif", fontSize: 15 }}>{l.label}</span>
            <span style={{ fontSize: 11, color: MUTED }}>{l.site}</span>
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11, lineHeight: 1.5, color: MUTED }}>{AFFILIATE_NOTICE}</div>
    </div>
  );
};

export default BookingLinks;
