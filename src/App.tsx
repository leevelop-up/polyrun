import { useEffect } from 'react';
import { Redirect, Route } from 'react-router-dom';
import { IonApp, IonRouterOutlet, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { StatusBar, Style } from '@capacitor/status-bar';
import { TripProvider, useTrip } from './context/TripContext';
import { NavProvider } from './context/NavContext';
import Main from './pages/Main';
import AddPlace from './pages/AddPlace';
import MyTrips from './pages/MyTrips';
import Itinerary from './pages/Itinerary';
import Map from './pages/Map';
import Today from './pages/Today';
import TripReminders from './components/TripReminders';
import { findTodayTrip } from './utils/today';
import MovePrompt from './components/MovePrompt';
import AdBanner from './components/AdBanner';
import BackButton from './components/BackButton';
import KeyboardAware from './components/KeyboardAware';

/* Core CSS required for Ionic components to work properly */
import '@ionic/react/css/core.css';

/* Basic CSS for apps built with Ionic */
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';

/* Theme variables */
import './theme/variables.css';

setupIonicReact();

// 앱을 열 때: 여행 중이면 오늘 일정, 아니면 첫 화면
const StartRedirect: React.FC = () => {
  const { trips, activeTripId } = useTrip();
  return <Redirect to={findTodayTrip(trips, activeTripId)?.kind === 'during' ? '/today' : '/main'} />;
};

const App: React.FC = () => {
  useEffect(() => {
    const setStatusBar = async () => {
      try {
        await StatusBar.setStyle({ style: Style.Light });
        await StatusBar.setBackgroundColor({ color: '#2F3CF0' });
      } catch {
        // 웹 환경에서는 StatusBar API가 없을 수 있음
        console.log('StatusBar not available');
      }
    };
    setStatusBar();
  }, []);

  return (
    <IonApp>
      <TripProvider>
        {/* 이동 안내는 화면을 옮겨도 계속되도록 라우터 바깥에 둔다 */}
        <NavProvider>
        <IonReactRouter>
          <IonRouterOutlet>
            <Route exact path="/">
              <StartRedirect />
            </Route>
            <Route exact path="/today">
              <Today />
            </Route>
            <Route exact path="/main">
              <Main />
            </Route>
            <Route exact path="/edit-trip">
              <Main editing />
            </Route>
            <Route exact path="/add-place">
              <AddPlace />
            </Route>
            <Route exact path="/my-trips">
              <MyTrips />
            </Route>
            <Route exact path="/itinerary">
              <Itinerary />
            </Route>
            <Route exact path="/map">
              <Map />
            </Route>
          </IonRouterOutlet>
          {/* 이동을 감지하면 어느 화면에서든 아래에 "이동 중이신가요?" */}
          <MovePrompt />
          {/* 출발 전날 저녁·여행 중 아침 알림 예약, 알림을 누르면 오늘 일정 */}
          <TripReminders />
          {/* AdMob 하단 배너 (안드로이드, 내 일정·목록 화면) */}
          <AdBanner />
          {/* 안드로이드 뒤로가기: 위 페이지로 */}
          <BackButton />
          {/* 키패드가 올라오면 입력 칸이 가려지지 않게 */}
          <KeyboardAware />
        </IonReactRouter>
        </NavProvider>
      </TripProvider>
    </IonApp>
  );
};

export default App;
