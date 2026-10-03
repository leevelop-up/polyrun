import { useEffect, useRef, useState } from 'react';
import { GeoSearchResult, SearchArea, searchPlacesDetailed } from '../api/geo';

// 이 시간이 지나도 결과가 없으면 "서버가 느려요" 안내를 붙인다
const WAIT_HINT_MS = 2500;

// 한국 밖 여행지에서 한글로 찾으면 자동완성(Photon)은 거의 항상 0건이다 (한글 이름이 붙은 곳이 대부분 한국).
// 게다가 공개 Photon 은 3~8초씩 걸려서, 기다렸다가 확정 검색으로 넘어가면 그만큼 늦기만 한다.
// 이럴 땐 처음부터 확정 검색을 한다. 확정 검색(Nominatim)은 요청이 몰리면 안 되므로 입력이 조금 더 멈춘 뒤에 부른다.
const DEBOUNCE_MS = 400;
const DIRECT_DEBOUNCE_MS = 700;
const inKorea = (a: SearchArea) => a.lat > 33 && a.lat < 38.7 && a.lng > 124.5 && a.lng < 131;
const skipAutocomplete = (q: string, area?: SearchArea) => /[가-힣]/.test(q) && !!area && !inKorea(area);

// "여행지 밖까지 찾기"에서 쓰는 반경
export const WIDE_RADIUS_KM = 3000;

// 장소 검색: 입력 후 400ms 뒤 자동완성(Photon)으로 찾고,
// 결과가 없으면(해외 장소 한글 이름 등) 확정 검색(Nominatim 포함)으로 한 번 더 찾는다.
export function usePlaceSearch(query: string, near?: SearchArea) {
  const [results, setResults] = useState<GeoSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  // 확정 검색까지 끝났는지 (끝났는데 결과가 없으면 "결과 없음"을 보여준다)
  const [full, setFull] = useState(false);
  // 확정 검색(Nominatim) 중인지: 몇 초 걸리므로 안내 문구를 바꿔 보여준다
  const [slow, setSlow] = useState(false);
  // 서버/네트워크 오류: "결과 없음"과 구분해서 "다시 시도"를 보여준다
  const [error, setError] = useState(false);
  // 여행지 반경 밖까지 찾았는지 (검색어가 바뀌면 다시 여행지 안에서 찾는다)
  const [wide, setWide] = useState(false);
  // 검색이 오래 걸리는 중인지 (공개 검색 서버가 느릴 때 안내용)
  const [waitLong, setWaitLong] = useState(false);
  const waitTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const wideRef = useRef(false);
  const seqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const nearRef = useRef(near);
  nearRef.current = near;

  // direct: 자동완성을 건너뛴 확정 검색 (오래 걸린다는 안내를 띄우지 않음)
  const run = async (raw: string, forceFull: boolean, direct = false) => {
    const seq = ++seqRef.current;
    const area = nearRef.current && wideRef.current ? { ...nearRef.current, radiusKm: WIDE_RADIUS_KM } : nearRef.current;
    // 이전 검색 요청은 취소한다 (서버도 대기 중인 Nominatim 호출을 건너뜀)
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const q = raw.trim();
    setError(false);
    if (!q) {
      setResults([]);
      setLoading(false);
      setFull(false);
      return;
    }
    setLoading(true);
    clearTimeout(waitTimerRef.current);
    setWaitLong(false);
    waitTimerRef.current = setTimeout(() => seq === seqRef.current && setWaitLong(true), WAIT_HINT_MS);
    try {
      let isFull = forceFull;
      setSlow(isFull && !direct);
      let r = await searchPlacesDetailed(q, { full: isFull, near: area, signal: ctrl.signal });
      if (seq !== seqRef.current) return;
      if (!isFull && r.results.length === 0) {
        isFull = true;
        setSlow(true);
        r = await searchPlacesDetailed(q, { full: true, near: area, signal: ctrl.signal });
        if (seq !== seqRef.current) return;
      }
      setResults(r.results);
      setFull(isFull);
      // 서버 하나가 응답하지 않아 아무것도 못 찾았으면 "결과 없음"이 아니라 "다시 시도"로 보여준다
      if (isFull && r.partial && r.results.length === 0) setError(true);
    } catch {
      if (seq === seqRef.current) {
        setResults([]);
        setError(true);
      }
    } finally {
      if (seq === seqRef.current) {
        setLoading(false);
        clearTimeout(waitTimerRef.current);
        setWaitLong(false);
      }
    }
  };

  useEffect(() => {
    clearTimeout(timerRef.current);
    wideRef.current = false;
    setWide(false);
    if (!query.trim()) {
      run('', false);
      return;
    }
    // 디바운스 동안에도 "검색 중"으로 보여서 빈 화면이 깜빡이지 않게 한다
    setLoading(true);
    const direct = skipAutocomplete(query, nearRef.current);
    timerRef.current = setTimeout(() => run(query, direct, direct), direct ? DIRECT_DEBOUNCE_MS : DEBOUNCE_MS);
    return () => clearTimeout(timerRef.current);
  }, [query]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      clearTimeout(waitTimerRef.current);
    },
    []
  );

  // Enter / "더 찾아보기" / "다시 시도": 대기 중인 자동완성을 취소하고 확정 검색
  const searchFull = () => {
    clearTimeout(timerRef.current);
    run(query, true);
  };

  // 여행지 반경 안에서 못 찾았을 때: 범위를 넓혀 확정 검색
  const searchWide = () => {
    clearTimeout(timerRef.current);
    wideRef.current = true;
    setWide(true);
    run(query, true);
  };

  return { results, loading, full, slow, error, wide, waitLong, searchFull, searchWide };
}
