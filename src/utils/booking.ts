// 숙소·투어 예약 링크 (제휴 수익). 각 제휴 프로그램에 가입해 받은 ID 를 아래에 넣으면 링크에 붙는다.
// ID 가 비어 있어도 링크는 그대로 열린다 (수수료만 안 쌓임).
import type { Trip } from '../context/TripContext';
import { findTripDestination } from '../data/destinations';

export const AFFILIATE = {
  // 아고다 파트너스(partners.agoda.com) 사이트 ID → 링크의 cid
  agodaCid: '1739459',
  // 클룩 어필리에이트(affiliate.klook.com) 파트너 ID → 링크의 aid
  klookAid: '',
  // 트립닷컴 어필리에이트(www.trip.com/partners) Alliance ID, SID
  tripAllianceId: '',
  tripSid: ''
};

// 광고(제휴) 표시: 공정위 추천·보증 심사지침 — 링크 가까이에 경제적 대가가 있음을 알린다
export const AFFILIATE_NOTICE = '예약 링크로 예약하면 런트립이 제휴 수수료를 받을 수 있어요. 가격은 같아요.';

export type BookingInfo = {
  // 아고다 도시 ID (src/data/cities.json, scripts/agoda-cities.mjs)
  agodaCity?: number;
  // 여행지 이름 (투어 검색어)
  city: string;
  checkIn?: string;
  nights?: number;
  pax: number;
};

const ymd = (t: number) => {
  const d = new Date(t);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

export const tripBooking = (trip: Pick<Trip, 'destination' | 'center' | 'startDate' | 'endDate' | 'pax'>): BookingInfo => {
  const dest = findTripDestination(trip);
  // "바르셀로나 · 마드리드" → 바르셀로나, "호놀룰루(하와이), 미국" → 호놀룰루
  const city = (dest?.name || trip.destination).split(',')[0].split('·')[0].replace(/\(.*\)/, '').trim();
  const nights = trip.startDate && trip.endDate ? Math.max(1, Math.round((trip.endDate - trip.startDate) / 86400000)) : undefined;
  return { agodaCity: dest?.agoda, city, checkIn: trip.startDate ? ymd(trip.startDate) : undefined, nights, pax: Math.max(1, trip.pax || 2) };
};

// 아고다 숙소 검색 (도시 ID 가 있어야 결과가 나온다)
export const agodaHotelsUrl = (b: BookingInfo): string | null => {
  if (!b.agodaCity) return null;
  const q = new URLSearchParams({ city: String(b.agodaCity), rooms: '1', adults: String(b.pax) });
  if (b.checkIn) {
    q.set('checkIn', b.checkIn);
    q.set('los', String(b.nights || 1));
  }
  if (AFFILIATE.agodaCid) q.set('cid', AFFILIATE.agodaCid);
  return 'https://www.agoda.com/ko-kr/search?' + q.toString();
};

// 클룩 투어·입장권 검색
export const klookUrl = (query: string): string => {
  const q = new URLSearchParams({ query });
  if (AFFILIATE.klookAid) q.set('aid', AFFILIATE.klookAid);
  return 'https://www.klook.com/ko/search/result/?' + q.toString();
};

// 트립닷컴 투어·입장권 검색
export const tripActivitiesUrl = (keyword: string): string => {
  const q = new URLSearchParams({ keyword });
  if (AFFILIATE.tripAllianceId) {
    q.set('Allianceid', AFFILIATE.tripAllianceId);
    q.set('SID', AFFILIATE.tripSid);
  }
  return 'https://kr.trip.com/things-to-do/list?' + q.toString();
};
