// 준비물 체크리스트: 여행지(국내/해외)에 맞는 기본 목록과, 날씨 예보를 보고 더할 만한 것
import type { CheckItem, Trip } from '../context/TripContext';
import type { DayWeather } from '../api/geo';
import { findTripDestination } from '../data/destinations';

export const MY_GROUP = '내가 추가';

// [묶음, 항목, 해외만]
const DEFAULTS: [string, string, boolean?][] = [
  ['서류·돈', '여권', true],
  ['서류·돈', '항공권·e티켓'],
  ['서류·돈', '숙소 예약 확인서'],
  ['서류·돈', '신분증'],
  ['서류·돈', '신용카드·체크카드'],
  ['서류·돈', '현지 화폐', true],
  ['서류·돈', '여행자 보험', true],
  ['전자기기', '휴대폰 충전기'],
  ['전자기기', '보조배터리'],
  ['전자기기', '멀티 어댑터', true],
  ['전자기기', '유심·eSIM·포켓 와이파이', true],
  ['옷·세면', '갈아입을 옷'],
  ['옷·세면', '속옷·양말'],
  ['옷·세면', '잠옷'],
  ['옷·세면', '편한 신발'],
  ['옷·세면', '세면도구·화장품'],
  ['옷·세면', '선크림'],
  ['건강', '상비약 (소화제·진통제·밴드)'],
  ['건강', '평소 먹는 약']
];

// 한국 안 여행인지: 목적지 목록의 나라 코드, 없으면 여행지 이름이나 지도 위치로 판단
export const isDomestic = (trip: Pick<Trip, 'destination' | 'center'>): boolean => {
  const dest = findTripDestination(trip);
  if (dest) return dest.code === 'KR';
  if (/대한민국|한국|Korea/i.test(trip.destination)) return true;
  const c = trip.center;
  return !!c && c[0] > 33 && c[0] < 38.7 && c[1] > 124.5 && c[1] < 131;
};

let seq = 0;
const newId = () => 'c_' + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 5);

export const makeItem = (text: string, group = MY_GROUP): CheckItem => ({ id: newId(), text, done: false, group });

export const defaultChecklist = (trip: Pick<Trip, 'destination' | 'center'>): CheckItem[] => {
  const abroad = !isDomestic(trip);
  // 해외면 신분증 대신 여권
  return DEFAULTS.filter(([, text, abroadOnly]) => (abroadOnly ? abroad : !(abroad && text === '신분증'))).map(([group, text]) => makeItem(text, group));
};

// 묶음 순서: 기본 묶음 → 날씨 → 직접 추가
export const GROUP_ORDER = [...new Set(DEFAULTS.map(([g]) => g)), '날씨', MY_GROUP];

export type Suggestion = { text: string; why: string };

// 예보를 보고 챙기면 좋은 것. 이미 비슷한 항목이 있으면 권하지 않는다
export const weatherSuggestions = (items: CheckItem[], forecast: DayWeather[]): Suggestion[] => {
  if (!forecast.length) return [];
  const has = (re: RegExp) => items.some((i) => re.test(i.text));
  const out: Suggestion[] = [];
  const wet = forecast.filter((w) => w.rain >= 1 && w.kind !== 'snow');
  if (wet.length && !has(/우산|우비|우의/)) out.push({ text: '우산', why: '비 예보 ' + wet.length + '일' });
  const snowy = forecast.some((w) => w.kind === 'snow');
  const cold = Math.min(...forecast.map((w) => w.min));
  if ((snowy || cold <= 5) && !has(/패딩|코트|두꺼운|방한/)) out.push({ text: '두꺼운 겉옷', why: '최저 ' + cold + '°' });
  else if (cold > 5 && cold <= 12 && !has(/겉옷|자켓|재킷|가디건|바람막이/)) out.push({ text: '얇은 겉옷', why: '최저 ' + cold + '°' });
  if ((snowy || cold <= 0) && !has(/장갑|핫팩/)) out.push({ text: '장갑·핫팩', why: snowy ? '눈 예보' : '영하' });
  const hot = Math.max(...forecast.map((w) => w.max));
  if (hot >= 28 && !has(/모자|선글라스/)) out.push({ text: '모자·선글라스', why: '최고 ' + hot + '°' });
  return out;
};
