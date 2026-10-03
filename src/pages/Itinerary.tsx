import React, { useEffect, useRef, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { Place, useTrip } from '../context/TripContext';
import { CAT_COLORS, INK, PAPER } from '../theme/palette';
import { dayDate, daySchedule, fmtDay, fmtTravel, readDayParam, travelBetween, tripRange, tripTitle } from '../utils/trip';
import { loadAllLegs, useRouteLegs } from '../hooks/useRouteLegs';
import DayGrid from '../components/DayGrid';
import DayExpenses from '../components/DayExpenses';

// 두 장소 사이 이동 시간(분)
type Cost = (a: Place, b: Place) => number;

function pathLen(l: Place[], cost: Cost): number {
  let s = 0;
  for (let i = 1; i < l.length; i++) s += cost(l[i - 1], l[i]);
  return s;
}
// 이동 시간 합이 가장 짧은 순서로 바꾼다. fixStart/fixEnd 면 첫/마지막 장소는 자리를 지킨다.
// 움직이는 장소가 8곳 이하면 모든 순서를 비교하고, 그보다 많으면 가까운 곳부터 고른 뒤 구간을 뒤집어 보며 다듬는다(2-opt).
function bestOrder(l: Place[], cost: Cost, fixStart: boolean, fixEnd: boolean): Place[] {
  const head = fixStart ? l.slice(0, 1) : [];
  const foot = fixEnd ? l.slice(-1) : [];
  const mid = l.slice(head.length, l.length - foot.length);
  const total = (m: Place[]) => pathLen(head.concat(m, foot), cost);
  if (mid.length > 8) {
    // 출발지가 자유로우면 모든 장소를 출발점으로 해 보고 가장 짧은 것을 쓴다
    const starts = fixStart ? [-1] : mid.map((_, i) => i);
    let bestM = mid;
    let bestD = total(mid);
    for (const s of starts) {
      const rest = mid.slice();
      let out = s < 0 ? [] : rest.splice(s, 1);
      while (rest.length) {
        const last = out.length ? out[out.length - 1] : head[0];
        let bi = 0;
        rest.forEach((x, i) => {
          if (cost(last, x) < cost(last, rest[bi])) bi = i;
        });
        out.push(rest.splice(bi, 1)[0]);
      }
      // 길이 일방통행 등으로 방향마다 시간이 다를 수 있어 뒤집은 경로 전체 길이로 비교한다
      let d = total(out);
      for (let improved = true; improved; ) {
        improved = false;
        for (let i = 0; i < out.length - 1; i++) {
          for (let j = i + 1; j < out.length; j++) {
            const cand = out.slice(0, i).concat(out.slice(i, j + 1).reverse(), out.slice(j + 1));
            const cd = total(cand);
            if (cd < d - 0.001) {
              d = cd;
              out = cand;
              improved = true;
            }
          }
        }
      }
      if (d < bestD - 0.001) {
        bestD = d;
        bestM = out;
      }
    }
    return head.concat(bestM, foot);
  }
  let bl = mid;
  let bd = total(mid);
  const rec = (cur: Place[], left: Place[]) => {
    if (!left.length) {
      const p = total(cur);
      if (p < bd - 0.001) {
        bd = p;
        bl = cur;
      }
      return;
    }
    left.forEach((x, i) => rec(cur.concat([x]), left.slice(0, i).concat(left.slice(i + 1))));
  };
  rec([], mid);
  return head.concat(bl, foot);
}

const Itinerary: React.FC = () => {
  const history = useHistory();
  const location = useLocation();
  const { activeTrip, updateDayItems } = useTrip();
  const [day, setDay] = useState(() => readDayParam(location.search, activeTrip ? activeTrip.days.length : 1));
  const [grid, setGrid] = useState(false);
  const [moving, setMoving] = useState<{ day: number; id: string } | null>(null);
  const [toast, setToast] = useState<{ text: string; undo: boolean; sort: boolean; prev: Place[] | null } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeStart = useRef({ x: 0, y: 0 });
  // 드래그로 순서 바꾸기: 손잡이를 누른 채 위아래로 끌면 놓은 자리로 옮긴다
  const [drag, setDrag] = useState<{ from: number; to: number; dy: number } | null>(null);
  const dragRef = useRef<{ from: number; to: number; startY: number; startScroll: number; rects: { top: number; height: number }[] } | null>(null);
  const itemEls = useRef(new Map<string, HTMLDivElement>());
  const scrollRef = useRef<HTMLDivElement>(null);
  // 손잡이에서 시작한 터치/마우스는 일차 넘기기 스와이프로 보지 않는다
  const suppressSwipe = useRef(false);
  // 실제 길 기준 이동 시간 (받기 전/실패 시에는 직선거리 추정)
  const legOf = useRouteLegs(activeTrip ? activeTrip.days : []);
  // 자동 정렬이 실제 이동 시간을 받는 중인지, 받는 동안 보던 일차 목록이 바뀌었는지 확인용
  const sorting = useRef(false);
  const latestList = useRef<Place[] | null>(null);

  // 장소 추가/지도 화면에서 돌아올 때 보던 일차를 유지
  useEffect(() => {
    if (location.pathname !== '/itinerary') return;
    setDay(readDayParam(location.search, activeTrip ? activeTrip.days.length : 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search, activeTrip?.id]);

  if (!activeTrip) {
    return (
      <div style={{ width: '100%', maxWidth: 390, height: 'calc(100vh - var(--ad-h, 0px))', maxHeight: 844, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: PAPER, padding: 20, boxSizing: 'border-box' }}>
        <div style={{ fontSize: 15, color: '#4A4D66', textAlign: 'center' }}>아직 선택된 일정이 없어요.</div>
        <button type="button" onClick={() => history.push('/my-trips')} style={{ height: 48, padding: '0 20px', border: '2px solid #14162B', borderRadius: 10, background: INK, color: '#FFD84A', fontFamily: "'Black Han Sans', sans-serif", fontSize: 16, cursor: 'pointer' }}>
          내 일정 보기
        </button>
      </div>
    );
  }

  const days = activeTrip.days;
  const list = days[day] || [];
  latestList.current = list;

  const setDayList = (l: Place[], text: string, undo: boolean) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    const prev = days[day];
    updateDayItems(activeTrip.id, day, l);
    setToast({ text, undo, sort: false, prev });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  };

  const doUndo = () => {
    if (!toast || !toast.prev) return;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    updateDayItems(activeTrip.id, day, toast.prev);
    setToast(null);
  };

  const autoSort = async () => {
    if (sorting.current) return;
    if (list.length < 3) {
      setDayList(list, '정렬할 장소가 3곳 이상 필요해요', false);
      return;
    }
    sorting.current = true;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text: '실제 길 기준으로 동선 계산 중…', undo: false, sort: false, prev: null });
    // 모든 장소 쌍의 실제 이동 시간(OSRM)을 받아 와서 그걸로 비교한다. 못 받으면 직선거리 추정.
    const real = await loadAllLegs(list);
    sorting.current = false;
    // 계산하는 동안 일정을 고쳤거나 다른 일차로 넘어갔으면 정렬하지 않는다
    if (latestList.current !== list) {
      setToast(null);
      return;
    }
    // 많은 순서를 비교하므로 두 장소 사이 시간은 한 번만 계산해 둔다
    const memo = new Map<string, number>();
    const cost: Cost = (a, b) => {
      const k = a.id + '>' + b.id;
      let m = memo.get(k);
      if (m === undefined) memo.set(k, (m = travelBetween(a, b, legOf).mins));
      return m;
    };
    // 숙소·역에서 출발하면 출발지는 그대로, 숙소로 돌아오면 도착지도 그대로 둔다.
    // 관광지·식당이 맨 앞이면 출발지도 함께 고른다 (그곳이 다른 장소들 사이에 있을 수 있으므로)
    const fixStart = list[0].cat === '숙박' || list[0].cat === '교통';
    const fixEnd = list[list.length - 1].cat === '숙박';
    const nl = bestOrder(list, cost, fixStart, fixEnd);
    const a = pathLen(list, cost);
    const b = pathLen(nl, cost);
    const pct = a > 0 ? Math.round((1 - b / a) * 100) : 0;
    const basis = real ? '' : ' (직선거리 추정)';
    if (pct <= 0) {
      setDayList(list, '이미 가장 효율적인 순서예요' + basis, false);
      return;
    }
    const kept = fixStart && fixEnd ? '출발·도착지는 그대로, ' : fixStart ? '출발지는 그대로, ' : fixEnd ? '도착지는 그대로, ' : '';
    setDayList(nl, kept + '이동 시간이 ' + pct + '% 줄었어요' + basis, true);
  };

  const removeItem = (p: Place) => {
    setDayList(list.filter((x) => x.id !== p.id), "'" + p.name + "'을(를) 삭제했어요", true);
  };

  const moveToDay = (targetDay: number) => {
    if (!moving || targetDay === day) return;
    const item = list.find((x) => x.id === moving.id);
    if (!item) return;
    const prevDays = days.map((d) => d.slice());
    updateDayItems(activeTrip.id, day, list.filter((x) => x.id !== item.id));
    updateDayItems(activeTrip.id, targetDay, (days[targetDay] || []).concat([item]));
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text: "'" + item.name + "'을(를) " + (targetDay + 1) + '일차로 옮겼어요', undo: true, sort: false, prev: prevDays[day] });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
    setMoving(null);
  };

  const movingItem = moving ? (days[moving.day] || []).find((x) => x.id === moving.id) : null;

  // 장소 사이 이동 시간·수단 (도보 8분, 차로 25분)
  const schedule = daySchedule(list, legOf);

  const reorder = (from: number, to: number) => {
    if (from === to || to < 0 || to >= list.length) return;
    const nl = list.slice();
    const [it] = nl.splice(from, 1);
    nl.splice(to, 0, it);
    setDayList(nl, "'" + it.name + "'을(를) " + (to + 1) + '번째로 옮겼어요', true);
  };

  const onDragStart = (e: React.PointerEvent, k: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    suppressSwipe.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rects = list.map((it) => {
      const r = itemEls.current.get(it.id)?.getBoundingClientRect();
      return { top: r ? r.top : 0, height: r ? r.height : 0 };
    });
    dragRef.current = { from: k, to: k, startY: e.clientY, startScroll: scrollRef.current?.scrollTop || 0, rects };
    setDrag({ from: k, to: k, dy: 0 });
  };
  const onDragMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const sc = scrollRef.current;
    // 목록 위/아래 끝으로 끌면 스크롤
    if (sc) {
      const r = sc.getBoundingClientRect();
      if (e.clientY < r.top + 40) sc.scrollTop -= 10;
      else if (e.clientY > r.bottom - 40) sc.scrollTop += 10;
    }
    // 드래그 시작 시점 화면 좌표 기준으로 계산 (그사이 스크롤한 만큼 보정)
    const dy = e.clientY - d.startY + ((sc?.scrollTop || 0) - d.startScroll);
    const mid = d.rects[d.from].top + d.rects[d.from].height / 2 + dy;
    let to = 0;
    d.rects.forEach((r, i) => {
      if (i !== d.from && r.top + r.height / 2 < mid) to++;
    });
    d.to = to;
    setDrag({ from: d.from, to, dy });
  };
  const onDragEnd = (apply: boolean) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (d && apply) reorder(d.from, d.to);
  };
  // 드래그 중 다른 카드가 비켜나는 거리
  const dragShift = (k: number): number => {
    if (!drag || !dragRef.current) return 0;
    const { from, to, dy } = drag;
    const h = dragRef.current.rects[from].height;
    if (k === from) return dy;
    if (from < to && k > from && k <= to) return -h;
    if (to < from && k >= to && k < from) return h;
    return 0;
  };

  // 드래그 중에는 놓을 자리 기준 번호를 보여준다
  const dragIndex = (k: number): number => {
    if (!drag) return k;
    const { from, to } = drag;
    if (k === from) return to;
    if (from < to && k > from && k <= to) return k - 1;
    if (to < from && k >= to && k < from) return k + 1;
    return k;
  };

  const onSwipeStart = (e: React.TouchEvent | React.MouseEvent) => {
    const p = 'touches' in e && e.touches[0] ? e.touches[0] : (e as React.MouseEvent);
    swipeStart.current = { x: p.clientX, y: p.clientY };
  };
  const onSwipeEnd = (e: React.TouchEvent | React.MouseEvent) => {
    if (suppressSwipe.current) {
      suppressSwipe.current = false;
      return;
    }
    const p = 'changedTouches' in e && e.changedTouches[0] ? e.changedTouches[0] : (e as React.MouseEvent);
    const dx = p.clientX - swipeStart.current.x;
    const dy = p.clientY - swipeStart.current.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const n = Math.min(days.length - 1, Math.max(0, day + (dx < 0 ? 1 : -1)));
    if (n === day) return;
    setDay(n);
  };

  const date = dayDate(activeTrip, day);
  const dayDateLabel = date ? fmtDay(date) : '날짜 미정';

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 390, height: 'calc(100vh - var(--ad-h, 0px))', maxHeight: 844, margin: '0 auto', boxSizing: 'border-box', background: PAPER, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flexShrink: 0, background: '#2F3CF0', borderBottom: '2px solid #14162B', padding: '14px 20px 18px', display: 'flex', flexDirection: 'column', gap: 8, color: '#FFFFFF' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: -10 }}>
          <button type="button" aria-label="뒤로" onClick={() => history.push('/my-trips')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, border: 0, background: 'transparent', cursor: 'pointer' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="square" aria-hidden="true">
              <path d="M20 12H4M11 5l-7 7 7 7" />
            </svg>
          </button>
          <div style={{ flexGrow: 1, minWidth: 0, fontFamily: "'DM Mono', monospace", fontSize: 12, letterSpacing: '0.12em' }}>
            {tripRange(activeTrip)} · {activeTrip.pax}명
          </div>
          <button type="button" onClick={() => history.push('/edit-trip')} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, height: 32, padding: '0 10px', marginRight: -6, border: '2px solid #FFFFFF', borderRadius: 6, background: 'transparent', color: '#FFFFFF', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.6} strokeLinecap="square" aria-hidden="true">
              <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" />
            </svg>
            수정
          </button>
        </div>
        <h1 style={{ margin: 0, fontFamily: "'Black Han Sans', sans-serif", fontSize: 36, lineHeight: 1.1, fontWeight: 400 }}>{tripTitle(activeTrip)}</h1>
        {activeTrip.title && <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.85 }}>여행지 · {activeTrip.destination}</div>}
      </div>

      <div style={{ flexShrink: 0, height: 48, boxSizing: 'border-box', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', margin: '16px 20px 0', border: '2px solid #14162B', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 44, borderRight: '2px solid #14162B', background: '#FFD84A', color: INK, fontFamily: "'Black Han Sans', sans-serif", fontSize: 16 }}>목록</div>
        <button type="button" onClick={() => history.push('/map?day=' + day)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 44, border: 0, background: '#FFFFFF', color: INK, fontFamily: "'Black Han Sans', sans-serif", fontSize: 16, cursor: 'pointer' }}>지도</button>
      </div>

      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '14px 20px 0' }}>
        <div style={{ flexGrow: 1, minWidth: 0, display: 'flex', gap: 8, overflowX: 'auto', padding: '2px 2px 8px' }}>
          {days.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setDay(i)}
              style={{ flexShrink: 0, minWidth: 68, height: 44, padding: '0 12px', border: '2px solid #14162B', borderRadius: 8, background: i === day ? '#14162B' : '#FFFFFF', color: i === day ? '#FFD84A' : INK, fontFamily: "'Black Han Sans', sans-serif", fontSize: 16, cursor: 'pointer' }}
            >
              {i + 1}일차
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="전체 일차 보기"
          onClick={() => setGrid((g) => !g)}
          style={{ flexShrink: 0, width: 44, height: 44, marginBottom: 6, border: '2px solid #14162B', borderRadius: 8, background: grid ? '#FFD84A' : '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#14162B" strokeWidth={2.4} aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
          </svg>
        </button>
      </div>

      {!grid && (
        <div style={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column', touchAction: 'pan-y', userSelect: 'none' }} onTouchStart={onSwipeStart} onTouchEnd={onSwipeEnd} onMouseDown={onSwipeStart} onMouseUp={onSwipeEnd}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '4px 20px 8px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>
                {day + 1}일차
              </div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#4A4D66' }}>{dayDateLabel} · {list.length}곳</div>
            </div>
            <button type="button" onClick={autoSort} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, height: 44, padding: '0 14px', border: '2px solid #14162B', borderRadius: 8, background: '#FFD84A', color: INK, fontFamily: "'Black Han Sans', sans-serif", fontSize: 15, cursor: 'pointer' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#14162B" strokeWidth={2.4} strokeLinecap="square" aria-hidden="true">
                <path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" />
              </svg>
              자동 정렬
            </button>
          </div>
          <div ref={scrollRef} style={{ flexGrow: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: '0 20px' }}>
            {list.map((it, k) => {
              const row = schedule[k];
              const shift = dragShift(k);
              const dragging = !!drag && drag.from === k;
              return (
              <div
                key={it.id}
                ref={(el) => {
                  if (el) itemEls.current.set(it.id, el);
                  else itemEls.current.delete(it.id);
                }}
                style={{ flexShrink: 0, display: 'flex', gap: 8, paddingBottom: 10, position: 'relative', zIndex: dragging ? 5 : 'auto', transform: shift ? 'translateY(' + shift + 'px)' : undefined, transition: dragging || !drag ? 'none' : 'transform 150ms ease' }}
              >
                <div style={{ position: 'relative', width: 24, flexShrink: 0 }}>
                  <div style={{ position: 'absolute', left: 11, top: 0, bottom: -10, width: 2, background: '#14162B' }} />
                  <div style={{ position: 'absolute', left: 0, top: 14, width: 24, height: 24, boxSizing: 'border-box', border: '2px solid #14162B', background: CAT_COLORS[it.cat][0], color: CAT_COLORS[it.cat][1], display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 500 }}>{dragIndex(k) + 1}</div>
                </div>
                <div style={{ flexGrow: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 2, padding: '6px 6px 6px 0', background: '#FFFFFF', border: '2px solid #14162B', borderRadius: 8, boxShadow: dragging ? '4px 4px 0 #14162B' : 'none' }}>
                  <button
                    type="button"
                    aria-label={it.name + ' 순서 바꾸기 (끌거나 위아래 화살표)'}
                    onPointerDown={(e) => onDragStart(e, k)}
                    onPointerMove={onDragMove}
                    onPointerUp={() => onDragEnd(true)}
                    onPointerCancel={() => onDragEnd(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.preventDefault();
                        reorder(k, k + (e.key === 'ArrowUp' ? -1 : 1));
                      }
                    }}
                    style={{ flexShrink: 0, alignSelf: 'stretch', width: 34, border: 0, background: 'transparent', cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                  >
                    <svg width="14" height="20" viewBox="0 0 14 20" fill="#8A8CA3" aria-hidden="true">
                      <circle cx="4" cy="4" r="1.8" /><circle cx="10" cy="4" r="1.8" /><circle cx="4" cy="10" r="1.8" /><circle cx="10" cy="10" r="1.8" /><circle cx="4" cy="16" r="1.8" /><circle cx="10" cy="16" r="1.8" />
                    </svg>
                  </button>
                  <div style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{it.name}</div>
                    <div style={{ fontSize: 12, color: '#4A4D66' }}>{k === 0 ? it.cat + ' · 이 날의 첫 장소' : it.cat + ' · ' + fmtTravel({ mins: row.travel, mode: row.mode })}</div>
                  </div>
                  {days.length > 1 && (
                    <button type="button" aria-label={it.name + ' 다른 일차로 옮기기'} onClick={() => setMoving({ day, id: it.id })} style={{ flexShrink: 0, height: 32, padding: '0 8px', margin: '0 4px', border: '2px solid #14162B', borderRadius: 6, background: '#FFFFFF', color: INK, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      다른 날로
                    </button>
                  )}
                  <button type="button" aria-label={it.name + ' 삭제'} onClick={() => removeItem(it)} style={{ flexShrink: 0, width: 44, height: 44, border: 0, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#14162B" strokeWidth={2.2} strokeLinecap="square" aria-hidden="true">
                      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
                    </svg>
                  </button>
                </div>
              </div>
              );
            })}
            {list.length === 0 && (
              <div style={{ padding: '16px 0 14px' }}>
                <div style={{ fontSize: 15, lineHeight: 1.5, color: '#4A4D66' }}>이 날은 아직 장소가 없어요.</div>
              </div>
            )}
            <button
              type="button"
              aria-label={day + 1 + '일차에 장소 추가'}
              onClick={() => history.push('/add-place?day=' + day)}
              style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 56, margin: '0 0 10px 32px', border: '2px dashed #14162B', borderRadius: 8, color: INK, fontFamily: "'Black Han Sans', sans-serif", fontSize: 16, background: 'transparent', cursor: 'pointer' }}
            >
              + {day + 1}일차에 장소 추가
            </button>
            <DayExpenses trip={activeTrip} day={day} />
          </div>
          <button
            type="button"
            onClick={() => history.push('/my-trips')}
            style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 56, margin: '8px 20px 20px', border: '2px solid #14162B', borderRadius: 10, background: INK, boxShadow: '4px 4px 0 #FFD84A', color: '#FFD84A', fontFamily: "'Black Han Sans', sans-serif", fontSize: 20, cursor: 'pointer' }}
          >
            저장하고 내 일정 보기
          </button>
        </div>
      )}

      {grid && (
        <DayGrid
          trip={activeTrip}
          day={day}
          onPick={(i) => {
            setDay(i);
            setGrid(false);
          }}
        />
      )}

      {toast && (
        <div style={{ position: 'absolute', left: 20, right: 20, bottom: 92, display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px 4px 16px', border: '2px solid #14162B', borderRadius: 10, background: INK, boxShadow: '4px 4px 0 #FFD84A', color: '#FFFFFF' }}>
          <div style={{ flexGrow: 1, fontSize: 14, fontWeight: 700, padding: '8px 0' }}>{toast.text}</div>
          {toast.sort && (
            <button type="button" onClick={autoSort} style={{ flexShrink: 0, whiteSpace: 'nowrap', height: 44, padding: '0 12px', border: 0, background: 'transparent', color: '#FFD84A', fontFamily: "'Black Han Sans', sans-serif", fontSize: 15, cursor: 'pointer' }}>자동 정렬</button>
          )}
          {toast.undo && (
            <button type="button" onClick={doUndo} style={{ flexShrink: 0, whiteSpace: 'nowrap', height: 44, padding: '0 12px', border: 0, background: 'transparent', color: '#FFD84A', fontFamily: "'Black Han Sans', sans-serif", fontSize: 15, cursor: 'pointer' }}>되돌리기</button>
          )}
        </div>
      )}

      {movingItem && (
        <>
          <div onClick={() => setMoving(null)} style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, background: 'rgba(20,22,43,0.45)' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', gap: 12, padding: '18px 20px 20px', borderTop: '2px solid #14162B', background: PAPER }}>
            <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.4 }}>'{movingItem.name}'을(를) 어느 날로 옮길까요?</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
              {days.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={i === day}
                  onClick={() => moveToDay(i)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'space-between', height: 64, padding: '8px 10px', border: '2px solid #14162B', borderRadius: 8, background: '#FFFFFF', color: INK, cursor: 'pointer', textAlign: 'left', opacity: i === day ? 0.35 : 1 }}
                >
                  <span style={{ fontFamily: "'Black Han Sans', sans-serif", fontSize: 17 }}>{i + 1}일차</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{d.length}곳</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setMoving(null)} style={{ height: 48, border: '2px solid #14162B', borderRadius: 10, background: '#FFFFFF', color: INK, fontFamily: "'Black Han Sans', sans-serif", fontSize: 17, cursor: 'pointer' }}>취소</button>
          </div>
        </>
      )}
    </div>
  );
};

export default Itinerary;
