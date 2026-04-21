import { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { IonPage, IonSpinner } from '@ionic/react';
import './Splash.css';

const Splash: React.FC = () => {
  const history = useHistory();
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // 2초 후 페이드 아웃 시작
    const fadeTimer = setTimeout(() => {
      setFadeOut(true);
    }, 2000);

    // 2.5초 후 지도 페이지로 이동 (replace로 히스토리에서 제거)
    const navigateTimer = setTimeout(() => {
      history.replace('/tabs/map');
    }, 2500);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(navigateTimer);
    };
  }, [history]);

  return (
    <IonPage>
      <div className={`splash-container ${fadeOut ? 'fade-out' : ''}`}>
        <div className="splash-image">
          <div className="splash-content">
            <IonSpinner name="crescent" style={{ width: '48px', height: '48px' }} />
          </div>
        </div>
      </div>
    </IonPage>
  );
};

export default Splash;

