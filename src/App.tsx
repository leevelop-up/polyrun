import { useEffect } from 'react';
import { Redirect, Route } from 'react-router-dom';
import {
  IonApp,
  IonRouterOutlet,
  IonTabBar,
  IonTabs,
  setupIonicReact
} from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { StatusBar, Style } from '@capacitor/status-bar';
import Splash from './pages/Splash';
import Map from './pages/Map';
import Records from './pages/Records';
import Login from './pages/Login';
import RunningScreen from './pages/RunningScreen';
import RunDetail from './pages/RunDetail';
import Routes from './pages/Routes';

/* Core CSS required for Ionic components to work properly */
import '@ionic/react/css/core.css';

/* Basic CSS for apps built with Ionic */
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';

/* Optional CSS utils that can be commented out */
import '@ionic/react/css/padding.css';
import '@ionic/react/css/float-elements.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/text-transformation.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';

/**
 * Ionic Dark Mode
 * -----------------------------------------------------
 * For more info, please see:
 * https://ionicframework.com/docs/theming/dark-mode
 */

/* import '@ionic/react/css/palettes/dark.always.css'; */
/* import '@ionic/react/css/palettes/dark.class.css'; */
import '@ionic/react/css/palettes/dark.system.css';

/* Theme variables */
import './theme/variables.css';

setupIonicReact();

const App: React.FC = () => {
  useEffect(() => {
    const setStatusBar = async () => {
      try {
        await StatusBar.setStyle({ style: Style.Light });
        await StatusBar.setBackgroundColor({ color: '#ffffff' });
      } catch (error) {
        // 웹 환경에서는 StatusBar API가 없을 수 있음
        console.log('StatusBar not available');
      }
    };
    setStatusBar();
  }, []);

  return (
    <IonApp>
      <IonReactRouter>
        <IonRouterOutlet>
          <Route exact path="/splash">
            <Splash />
          </Route>
          <Route exact path="/">
            <Redirect to="/splash" />
          </Route>
        </IonRouterOutlet>
        <Route path="/tabs">
          <IonTabs>
            <IonRouterOutlet>
              <Route exact path="/tabs/map">
                <Map />
              </Route>
              <Route exact path="/tabs/records">
                <Records />
              </Route>
              <Route exact path="/tabs/login">
                <Login />
              </Route>
              <Route exact path="/tabs/running">
                <RunningScreen />
              </Route>
              <Route exact path="/tabs/record-detail">
                <RunDetail />
              </Route>
              <Route exact path="/tabs/routes">
                <Routes />
              </Route>
              <Route exact path="/tabs">
                <Redirect to="/tabs/map" />
              </Route>
            </IonRouterOutlet>
            <IonTabBar slot="bottom" style={{ display: 'none' }} />
          </IonTabs>
        </Route>
      </IonReactRouter>
    </IonApp>
  );
};

export default App;
