import React from 'react';
import type { Trip } from '../context/TripContext';
import type { DayWeather } from '../api/geo';
import { INK, MUTED } from '../theme/palette';
import { dayDate, fmtDay } from '../utils/trip';
import { agodaHotelsUrl, klookUrl, tripActivitiesUrl, tripBooking } from '../utils/booking';
import { FORECAST_DAYS } from '../hooks/useWeather';
import FlightCard from './FlightCard';
import BookingLinks from './BookingLinks';
import WeatherBadge from './WeatherBadge';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
    {children}
  </div>
);

// 일정 화면 "준비" 탭: 항공편, 준비물, 날씨, 숙소·투어 예약 (장소 일정과 따로 챙기는 것들)
const TripPrep: React.FC<{ trip: Trip; weather: Map<number, DayWeather>; onChecklist: () => void }> = ({ trip, weather, onChecklist }) => {
  const items = trip.checklist;
  const done = items ? items.filter((c) => c.done).length : 0;
  const pct = items?.length ? Math.round((done / items.length) * 100) : 0;
  const booking = tripBooking(trip);
  const hotelsUrl = agodaHotelsUrl(booking);
  const forecast = [...weather.entries()].sort((a, b) => a[0] - b[0]);

  return (
    <div style={{ flexGrow: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 22, padding: '16px 20px 16px' }}>
      <Section title="항공편">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <FlightCard trip={trip} kind="out" indent={false} />
          {trip.days.length > 1 && <FlightCard trip={trip} kind="back" indent={false} />}
        </div>
      </Section>

      <Section title="준비물">
        <button type="button" onClick={onChecklist} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 60, padding: '10px 14px', border: '2px solid #14162B', borderRadius: 10, background: '#FFFFFF', color: INK, textAlign: 'left', cursor: 'pointer' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#14162B" strokeWidth={2.2} strokeLinecap="square" aria-hidden="true">
            <path d="M5 8h14l-1 13H6L5 8zM9 8V5h6v3M9 14l2 2 4-4" />
          </svg>
          <div style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontFamily: "'Black Han Sans', sans-serif", fontSize: 16 }}>
              {!items ? '준비물 체크리스트 만들기' : items.length && done === items.length ? '다 챙겼어요' : done + ' / ' + items.length + ' 챙김'}
            </div>
            {items && items.length > 0 && (
              <div style={{ height: 8, border: '2px solid #14162B', borderRadius: 5, overflow: 'hidden' }}>
                <div style={{ width: pct + '%', height: '100%', background: '#FFD84A' }} />
              </div>
            )}
            {!items && <div style={{ fontSize: 12, color: MUTED }}>여행지에 맞는 기본 목록을 만들어 드려요</div>}
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#14162B" strokeWidth={2.6} strokeLinecap="square" aria-hidden="true">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </Section>

      <Section title="날씨">
        {forecast.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', border: '2px solid #14162B', borderRadius: 10, background: '#FFFFFF', padding: '2px 14px' }}>
            {forecast.map(([i, w], k) => {
              const d = dayDate(trip, i);
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, borderTop: k ? '1px solid #D9D4C7' : 0 }}>
                  <div style={{ flexShrink: 0, width: 92, fontSize: 13, fontWeight: 700 }}>
                    {i + 1}일차 <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 400, color: MUTED }}>{d ? fmtDay(d).split(' ')[0] : ''}</span>
                  </div>
                  <WeatherBadge w={w} size={12} />
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: 13, lineHeight: 1.5, color: MUTED }}>{trip.startDate ? '출발 ' + FORECAST_DAYS + '일 전부터 날씨 예보가 보여요.' : '여행 날짜를 정하면 출발 ' + FORECAST_DAYS + '일 전부터 날씨 예보가 보여요.'}</div>
        )}
      </Section>

      <BookingLinks
        title={booking.city + ' 숙소 · 투어 예약'}
        links={[
          ...(hotelsUrl ? [{ label: '숙소', site: '아고다', href: hotelsUrl }] : []),
          { label: '투어·입장권', site: '클룩', href: klookUrl(booking.city) },
          { label: '투어·입장권', site: '트립닷컴', href: tripActivitiesUrl(booking.city) }
        ]}
      />
      {forecast.length > 0 && <div style={{ marginTop: -12, fontSize: 10, color: '#8A8CA3' }}>날씨 예보: 노르웨이 기상청(MET Norway)</div>}
    </div>
  );
};

export default TripPrep;
