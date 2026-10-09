import { useEffect } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';

// 안드로이드 뒤로가기 버튼: 방금 본 화면이 아니라 화면 구조상 위 페이지로 간다 (화면 안의 ← 버튼과 같은 곳).
// 첫 화면에서는 앱을 닫는다.
const parentOf = (pathname: string, search: string): string | null => {
  const day = new URLSearchParams(search).get('day');
  switch (pathname) {
    case '/my-trips':
      return '/main';
    case '/itinerary':
    case '/map':
    case '/today':
      return '/my-trips';
    case '/add-place':
      return '/itinerary' + (day ? '?day=' + day : '');
    case '/edit-trip':
      return '/itinerary';
    case '/checklist':
      return new URLSearchParams(search).get('from') === 'today' ? '/today' : '/itinerary?tab=prep';
    default:
      return null;
  }
};

const BackButton: React.FC = () => {
  const history = useHistory();
  const location = useLocation();

  useEffect(() => {
    // Ionic 이 뒤로가기를 화면 기록 되돌리기(우선순위 0)로 처리하므로 더 높은 우선순위로 먼저 받는다
    const onBack = (ev: Event) => {
      (ev as CustomEvent<{ register: (priority: number, handler: () => void) => void }>).detail.register(10, () => {
        const to = parentOf(location.pathname, location.search);
        if (to) history.replace(to);
        else CapApp.exitApp();
      });
    };
    document.addEventListener('ionBackButton', onBack);
    return () => document.removeEventListener('ionBackButton', onBack);
  }, [history, location.pathname, location.search]);

  return null;
};

export default BackButton;
