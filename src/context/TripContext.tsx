import React, { createContext, useContext, useEffect, useState } from 'react';
import { dayCount, fillMissingCoords, tripExpiresAt } from '../utils/trip';

export type Category = '식당' | '관광' | '쇼핑' | '숙박' | '교통';

export interface Place {
  id: string;
  name: string;
  cat: Category;
  // 예전 데이터의 가상 지도 좌표(%). 새로 추가하는 장소는 lat/lng 만 쓴다.
  x?: number;
  y?: number;
  lat?: number;
  lng?: number;
  // 직접 정한 도착 시각 "HH:MM". 없으면 앞 장소에 이어서 자동 계산한다.
  time?: string;
  // 머무는 시간(분). 없으면 카테고리 기본값.
  stay?: number;
  // Wikidata 항목 ID (추천 장소에서 고른 경우). 장소 상세정보를 찾는 데 쓴다
  wd?: string;
}

export interface Trip {
  id: string;
  // 여행 제목 (예: "엄마랑 LA 여행"). 없으면 화면에 여행지를 제목처럼 보여 준다
  title?: string;
  // 여행지 (예: "로스앤젤레스, 미국")
  destination: string;
  startDate: number | null;
  endDate: number | null;
  pax: number;
  // 목록에 없는 도시를 검색해서 고른 경우의 지도 중심 [lat, lng]
  center?: [number, number];
  days: Place[][];
  createdAt: number;
  // 보관: 여행이 끝나도 자동으로 지우지 않는다
  keep?: boolean;
  // 사용 금액 (일차별로 적는다)
  expenses?: Expense[];
  // 준비물 체크리스트. 없으면 처음 열 때 여행지에 맞는 기본 목록을 넣는다
  checklist?: CheckItem[];
  // 항공편: 가는 편(1일차), 오는 편(마지막 날)
  flights?: Partial<Record<FlightKind, FlightInfo>>;
}

export type FlightKind = 'out' | 'back';
export interface FlightInfo {
  // IATA 편명 (KE123, 7C1101)
  no: string;
  // 출발 시각 "HH:MM" (현지 시각)
  time?: string;
}

export interface CheckItem {
  id: string;
  text: string;
  done: boolean;
  // 묶음 이름 (서류·돈, 전자기기 …). 직접 추가한 것은 '내가 추가'
  group: string;
}

export interface Expense {
  id: string;
  day: number; // 몇 번째 일차 (0부터)
  title: string;
  amount: number; // 원
}

// 일정 수정에서 바꿀 수 있는 정보
export type TripInfo = Pick<Trip, 'title' | 'destination' | 'startDate' | 'endDate' | 'pax' | 'center'>;

interface TripContextValue {
  trips: Trip[];
  activeTripId: string | null;
  activeTrip: Trip | null;
  createTrip: (destination: string, startDate: number | null, endDate: number | null, pax: number, center?: [number, number], title?: string) => string;
  updateTrip: (id: string, info: TripInfo) => void;
  setKeep: (id: string, keep: boolean) => void;
  // 백업 파일의 일정을 더한다. 같은 일정(id)이 이미 있으면 건너뛴다. 더한 개수를 돌려준다.
  importTrips: (trips: Trip[]) => number;
  deleteTrip: (id: string) => void;
  setActiveTrip: (id: string) => void;
  addPlacesToDay: (tripId: string, dayIdx: number, places: Place[]) => void;
  removePlaceFromDay: (tripId: string, dayIdx: number, placeId: string) => void;
  updateDayItems: (tripId: string, dayIdx: number, items: Place[]) => void;
  addExpense: (tripId: string, dayIdx: number, title: string, amount: number) => void;
  removeExpense: (tripId: string, expenseId: string) => void;
  setChecklist: (tripId: string, items: CheckItem[]) => void;
  // info 가 null 이면 그 항공편을 지운다
  setFlight: (tripId: string, kind: FlightKind, info: FlightInfo | null) => void;
}

const TripContext = createContext<TripContextValue | undefined>(undefined);

const STORAGE_KEY = 'runtrip_trips';
const ACTIVE_KEY = 'runtrip_active_trip';
// 예전 이름(폴리런 시절)으로 저장된 키. 처음 열 때 새 키로 옮긴다
const OLD_KEYS: [string, string][] = [
  ['polyrun_trips', STORAGE_KEY],
  ['polyrun_active_trip', ACTIVE_KEY]
];
const migrateKeys = () => {
  try {
    for (const [from, to] of OLD_KEYS) {
      const v = window.localStorage.getItem(from);
      if (v !== null && window.localStorage.getItem(to) === null) window.localStorage.setItem(to, v);
      if (v !== null) window.localStorage.removeItem(from);
    }
  } catch {
    // localStorage 사용 불가 환경은 무시
  }
};


function loadTrips(): Trip[] {
  migrateKeys();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    // 보관 기간이 지난 일정은 불러올 때 정리한다
    const now = Date.now();
    // 좌표 없이 저장된 예전 장소는 추천 장소 데이터로 위치를 채운다 (지도에 보이도록)
    return fillMissingCoords((JSON.parse(raw) as Trip[]).filter((t) => tripExpiresAt(t) > now));
  } catch {
    return [];
  }
}

function loadActiveId(): string | null {
  migrateKeys();
  try {
    return window.localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export const TripProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [trips, setTrips] = useState<Trip[]>(() => loadTrips());
  const [activeTripId, setActiveTripId] = useState<string | null>(() => loadActiveId());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
    } catch {
      // localStorage 사용 불가 환경은 무시
    }
  }, [trips]);

  useEffect(() => {
    try {
      if (activeTripId) window.localStorage.setItem(ACTIVE_KEY, activeTripId);
    } catch {
      // localStorage 사용 불가 환경은 무시
    }
  }, [activeTripId]);

  const createTrip = (destination: string, startDate: number | null, endDate: number | null, pax: number, center?: [number, number], title?: string) => {
    const id = 'trip_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const days: Place[][] = Array.from({ length: dayCount(startDate, endDate) }, () => []);
    const trip: Trip = { id, destination, startDate, endDate, pax, center, days, createdAt: Date.now() };
    if (title?.trim()) trip.title = title.trim();
    setTrips((prev) => [trip, ...prev]);
    setActiveTripId(id);
    return id;
  };

  // 날짜가 바뀌어 일차가 늘면 빈 일차를 붙이고, 줄면 없어지는 일차의 장소를 마지막 일차 끝으로 옮긴다
  const updateTrip = (id: string, info: TripInfo) => {
    setTrips((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const n = dayCount(info.startDate, info.endDate);
        const days = t.days.slice(0, n).map((d) => d.slice());
        if (t.days.length > n) days[n - 1] = days[n - 1].concat(t.days.slice(n).flat());
        while (days.length < n) days.push([]);
        // 없어지는 일차의 사용 금액도 장소처럼 마지막 일차로 옮긴다
        const expenses = t.expenses?.map((e) => (e.day >= n ? { ...e, day: n - 1 } : e));
        return { ...t, ...info, title: info.title?.trim() || undefined, days, ...(expenses ? { expenses } : {}) };
      })
    );
  };

  const setKeep = (id: string, keep: boolean) => {
    setTrips((prev) => prev.map((t) => (t.id === id ? { ...t, keep } : t)));
  };

  const importTrips = (incoming: Trip[]): number => {
    const have = new Set(trips.map((t) => t.id));
    // 백업에서 되살린 지난 여행이 다음 실행 때 바로 지워지지 않도록 보관으로 둔다
    const now = Date.now();
    const added = incoming.filter((t) => !have.has(t.id)).map((t) => (tripExpiresAt(t) <= now ? { ...t, keep: true } : t));
    if (added.length) setTrips((prev) => prev.concat(added).sort((a, b) => b.createdAt - a.createdAt));
    return added.length;
  };

  const deleteTrip = (id: string) => {
    setTrips((prev) => prev.filter((t) => t.id !== id));
    setActiveTripId((cur) => (cur === id ? null : cur));
  };

  const setActiveTrip = (id: string) => setActiveTripId(id);

  const addPlacesToDay = (tripId: string, dayIdx: number, places: Place[]) => {
    setTrips((prev) =>
      prev.map((t) => {
        if (t.id !== tripId) return t;
        const days = t.days.map((d, i) => (i === dayIdx ? d.concat(places) : d));
        return { ...t, days };
      })
    );
  };

  const removePlaceFromDay = (tripId: string, dayIdx: number, placeId: string) => {
    setTrips((prev) =>
      prev.map((t) => {
        if (t.id !== tripId) return t;
        const days = t.days.map((d, i) => (i === dayIdx ? d.filter((p) => p.id !== placeId) : d));
        return { ...t, days };
      })
    );
  };

  const updateDayItems = (tripId: string, dayIdx: number, items: Place[]) => {
    setTrips((prev) =>
      prev.map((t) => {
        if (t.id !== tripId) return t;
        const days = t.days.map((d, i) => (i === dayIdx ? items : d));
        return { ...t, days };
      })
    );
  };

  const addExpense = (tripId: string, dayIdx: number, title: string, amount: number) => {
    const e: Expense = { id: 'e_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), day: dayIdx, title, amount };
    setTrips((prev) => prev.map((t) => (t.id === tripId ? { ...t, expenses: (t.expenses || []).concat([e]) } : t)));
  };

  const removeExpense = (tripId: string, expenseId: string) => {
    setTrips((prev) => prev.map((t) => (t.id === tripId ? { ...t, expenses: (t.expenses || []).filter((e) => e.id !== expenseId) } : t)));
  };

  const setChecklist = (tripId: string, items: CheckItem[]) => {
    setTrips((prev) => prev.map((t) => (t.id === tripId ? { ...t, checklist: items } : t)));
  };

  const setFlight = (tripId: string, kind: FlightKind, info: FlightInfo | null) => {
    setTrips((prev) =>
      prev.map((t) => {
        if (t.id !== tripId) return t;
        const flights = { ...t.flights };
        if (info) flights[kind] = info;
        else delete flights[kind];
        return { ...t, flights };
      })
    );
  };

  const activeTrip = trips.find((t) => t.id === activeTripId) || null;

  return (
    <TripContext.Provider
      value={{ trips, activeTripId, activeTrip, createTrip, updateTrip, setKeep, importTrips, deleteTrip, setActiveTrip, addPlacesToDay, removePlaceFromDay, updateDayItems, addExpense, removeExpense, setChecklist, setFlight }}
    >
      {children}
    </TripContext.Provider>
  );
};

export function useTrip(): TripContextValue {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrip must be used within TripProvider');
  return ctx;
}
