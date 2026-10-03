import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { setBanner } from '../native/ads';

// 배너는 내 일정·목록 화면에만. 지도(이동 안내)와 장소 추가(검색·지도 조작) 화면에는 띄우지 않는다
const AD_PAGES = ['/my-trips', '/itinerary'];

const AdBanner: React.FC = () => {
  const { pathname } = useLocation();
  const want = AD_PAGES.includes(pathname);
  useEffect(() => {
    setBanner(want);
  }, [want]);
  useEffect(
    () => () => {
      setBanner(false);
    },
    []
  );
  return null;
};

export default AdBanner;
