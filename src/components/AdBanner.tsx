import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { pauseBanner, setBanner } from '../native/ads';
import { KB_EVENT } from './KeyboardAware';

// 배너는 내 일정·목록 화면에만. 지도(이동 안내)와 장소 추가(검색·지도 조작) 화면에는 띄우지 않는다.
// 키패드가 올라와 있는 동안에는 숨긴다 (배너가 키패드 위로 따라 올라와 입력 칸을 가리지 않게)
const AD_PAGES = ['/my-trips', '/itinerary'];

const AdBanner: React.FC = () => {
  const { pathname } = useLocation();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const want = AD_PAGES.includes(pathname);
  useEffect(() => {
    const onKb = (e: Event) => setKeyboardOpen((e as CustomEvent<boolean>).detail);
    window.addEventListener(KB_EVENT, onKb);
    return () => window.removeEventListener(KB_EVENT, onKb);
  }, []);
  useEffect(() => {
    setBanner(want);
  }, [want]);
  useEffect(() => {
    pauseBanner(keyboardOpen);
  }, [keyboardOpen]);
  useEffect(
    () => () => {
      setBanner(false);
    },
    []
  );
  return null;
};

export default AdBanner;
