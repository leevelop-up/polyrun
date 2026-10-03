import React, { useEffect, useState } from 'react';
import type { Category } from '../context/TripContext';
import { CAT_COLORS, INK, MUTED, PAPER } from '../theme/palette';
import { fetchPlaceInfo, PlaceInfo } from '../api/geo';

export type DetailPlace = { name: string; cat: Category; lat?: number; lng?: number; wd?: string; area?: string; aliases?: string[] };

type Props = {
  place: DetailPlace;
  onClose: () => void;
  // 여행지 이름들 (제주, 제주도 …): 같은 이름의 다른 지역 문서를 거르는 데 쓴다
  region?: string[];
  // 장소 추가 화면의 "추가/추가됨" 같은 버튼
  action?: { label: string; active?: boolean; onClick: () => void };
};

// 장소 상세정보 시트: 위키백과 사진·설명, 위키백과/구글 지도 링크
const PlaceDetail: React.FC<Props> = ({ place, onClose, region, action }) => {
  // undefined: 불러오는 중, null: 못 찾음
  const [info, setInfo] = useState<PlaceInfo | null | undefined>(undefined);
  const [imgOk, setImgOk] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    setInfo(undefined);
    setImgOk(true);
    fetchPlaceInfo({ name: place.name, lat: place.lat, lng: place.lng, wd: place.wd, alt: place.aliases, region }, ctrl.signal)
      .then(setInfo)
      .catch(() => !ctrl.signal.aborted && setInfo(null));
    return () => ctrl.abort();
  }, [place.name, place.lat, place.lng, place.wd]);

  // 열려 있는 동안 안드로이드 뒤로가기는 이 시트를 먼저 닫는다
  useEffect(() => {
    const onBack = (ev: Event) => {
      (ev as CustomEvent<{ register: (priority: number, handler: () => void) => void }>).detail.register(30, onClose);
    };
    document.addEventListener('ionBackButton', onBack);
    return () => document.removeEventListener('ionBackButton', onBack);
  }, [onClose]);

  // 구글 지도는 현지/영어 이름으로 찾아야 장소 정보(사진·리뷰·영업시간)가 잘 잡힌다. 한국 장소는 한국어 이름 그대로
  const localName = (place.aliases || []).find((a) => !/[가-힣]/.test(a));
  const mapsHref = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(localName || place.name);
  const open = (url: string) => window.open(url, '_blank');
  const sub = [place.cat, place.area].filter(Boolean).join(' · ');

  return (
    <>
      <div onClick={onClose} style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 1200, background: 'rgba(20,22,43,0.45)' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 1201, maxHeight: '85%', display: 'flex', flexDirection: 'column', borderTop: '2px solid #14162B', background: PAPER }}>
        <div style={{ flexGrow: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, padding: '18px 20px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ width: 14, height: 14, flexShrink: 0, marginTop: 7, border: '2px solid #14162B', background: CAT_COLORS[place.cat][0] }} />
            <div style={{ flexGrow: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'Black Han Sans', sans-serif", fontSize: 22, lineHeight: 1.25 }}>{place.name}</div>
              {sub && <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>{sub}</div>}
            </div>
            <button type="button" aria-label="닫기" onClick={onClose} style={{ flexShrink: 0, width: 40, height: 40, marginTop: -6, marginRight: -8, border: 0, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#14162B" strokeWidth={2.6} strokeLinecap="square" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          {info === undefined && <div style={{ padding: '18px 0', fontSize: 14, color: MUTED }}>정보를 찾는 중…</div>}
          {info === null && <div style={{ padding: '6px 0', fontSize: 14, lineHeight: 1.6, color: MUTED }}>위키백과에서 이 장소의 설명을 찾지 못했어요. 구글 지도에서 사진과 리뷰를 볼 수 있어요.</div>}
          {info && (
            <>
              {info.image && imgOk && (
                <img
                  src={info.image}
                  alt={info.title}
                  onError={() => setImgOk(false)}
                  style={{ width: '100%', maxHeight: 220, objectFit: 'cover', border: '2px solid #14162B', borderRadius: 8, background: '#E4E0D6' }}
                />
              )}
              {info.description && <div style={{ fontSize: 13, fontWeight: 700, color: INK }}>{info.description}</div>}
              <div style={{ fontSize: 15, lineHeight: 1.65, color: INK, whiteSpace: 'pre-line' }}>{info.extract}</div>
              <div style={{ fontSize: 11, color: MUTED }}>
                출처: {info.lang === 'ko' ? '한국어' : '영어'} 위키백과 「{info.title}」 (CC BY-SA)
              </div>
            </>
          )}
        </div>
        <div style={{ flexShrink: 0, display: 'flex', gap: 8, padding: '8px 20px 20px' }}>
          {info && (
            <button type="button" onClick={() => open(info.url)} style={{ flex: 1, height: 48, border: '2px solid #14162B', borderRadius: 10, background: '#FFFFFF', color: INK, fontFamily: "'Black Han Sans', sans-serif", fontSize: 15, cursor: 'pointer' }}>
              위키백과
            </button>
          )}
          <button type="button" onClick={() => open(mapsHref)} style={{ flex: 1, height: 48, border: '2px solid #14162B', borderRadius: 10, background: '#FFFFFF', color: INK, fontFamily: "'Black Han Sans', sans-serif", fontSize: 15, cursor: 'pointer' }}>
            구글 지도
          </button>
          {action && (
            <button type="button" onClick={action.onClick} style={{ flex: 1.3, height: 48, border: '2px solid #14162B', borderRadius: 10, background: action.active ? INK : '#FFD84A', color: action.active ? '#FFD84A' : INK, fontFamily: "'Black Han Sans', sans-serif", fontSize: 15, cursor: 'pointer' }}>
              {action.label}
            </button>
          )}
        </div>
      </div>
    </>
  );
};

export default PlaceDetail;
