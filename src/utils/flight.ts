// 항공편: 편명 정리와 실시간 운항 정보 페이지 링크 (API 없이 외부 사이트로 연다)
import type { FlightKind, Trip } from '../context/TripContext';

// "ke 123", "KE-0123" → "KE123". 항공사 코드 2자리(영문 2자 또는 영문+숫자: 7C, LJ) + 숫자 1~4자리. 형식이 틀리면 null
export const normalizeFlightNo = (raw: string): string | null => {
  const s = raw.toUpperCase().replace(/[\s-]/g, '');
  const m = /^([A-Z]{2}|[A-Z]\d|\d[A-Z])0*(\d{1,4})([A-Z]?)$/.exec(s);
  return m ? m[1] + m[2] + m[3] : null;
};

// 지연·게이트·지금 위치를 보여 주는 Flightradar24 편명 페이지
export const flightStatusUrl = (no: string): string => 'https://www.flightradar24.com/data/flights/' + no.toLowerCase();

export const FLIGHT_LABEL: Record<FlightKind, string> = { out: '가는 편', back: '오는 편' };

// 그 일차에 타는 항공편 (가는 편은 1일차, 오는 편은 마지막 날)
export const flightsOnDay = (trip: Pick<Trip, 'flights' | 'days'>, day: number): FlightKind[] => {
  const out: FlightKind[] = [];
  if (day === 0) out.push('out');
  if (day === trip.days.length - 1) out.push('back');
  return out;
};

// 알림용 한 줄: "✈️ KE123 09:30 출발"
export const flightLine = (trip: Pick<Trip, 'flights'>, kind: FlightKind): string => {
  const f = trip.flights?.[kind];
  return f ? '✈️ ' + f.no + (f.time ? ' ' + f.time + ' 출발' : '') : '';
};
