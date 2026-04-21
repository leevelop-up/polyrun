import { useState } from 'react';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButton,
  IonIcon,
  IonInput,
  IonItem,
} from '@ionic/react';
import { logoGoogle, logoApple, mailOutline, lockClosedOutline, personOutline, menuOutline } from 'ionicons/icons';
import NavMenu from '../components/NavMenu';
import './Login.css';

const Login: React.FC = () => {
  const [showNavMenu, setShowNavMenu] = useState(false);

  return (
    <IonPage>
      <NavMenu isOpen={showNavMenu} onClose={() => setShowNavMenu(false)} />
      <IonHeader>
        <IonToolbar className="login-toolbar">
          <IonTitle className="login-toolbar-title">프로필</IonTitle>
          <div slot="end">
            <IonButton fill="clear" onClick={() => setShowNavMenu(true)} style={{ '--color': '#4a4a4a' }}>
              <IonIcon icon={menuOutline} style={{ fontSize: '24px' }} />
            </IonButton>
          </div>
        </IonToolbar>
      </IonHeader>
      <IonContent className="login-content">
        <div className="login-container">

          {/* 로고 & 타이틀 */}
          <div className="login-hero">
            <div className="login-logo">🏃</div>
            <h1 className="login-app-name">런플리</h1>
            <p className="login-subtitle">경로를 그리고, 함께 달리세요</p>
          </div>

          {/* 입력 폼 */}
          <div className="login-form">
            <div className="login-input-wrapper">
              <IonIcon icon={mailOutline} className="login-input-icon" />
              <IonInput
                type="email"
                placeholder="이메일"
                className="login-input"
              />
            </div>
            <div className="login-input-wrapper">
              <IonIcon icon={lockClosedOutline} className="login-input-icon" />
              <IonInput
                type="password"
                placeholder="비밀번호"
                className="login-input"
              />
            </div>

            <IonButton expand="block" className="login-btn-main">
              로그인
            </IonButton>

            <div className="login-divider">
              <span>또는</span>
            </div>

            {/* 소셜 로그인 */}
            <IonButton expand="block" fill="outline" className="login-btn-social login-btn-google">
              <IonIcon icon={logoGoogle} slot="start" />
              Google로 계속하기
            </IonButton>

            <IonButton expand="block" fill="outline" className="login-btn-social login-btn-apple">
              <IonIcon icon={logoApple} slot="start" />
              Apple로 계속하기
            </IonButton>
          </div>

          {/* 회원가입 */}
          <div className="login-footer">
            <span className="login-footer-text">계정이 없으신가요?</span>
            <IonButton fill="clear" className="login-signup-btn">
              <IonIcon icon={personOutline} slot="start" />
              회원가입
            </IonButton>
          </div>

        </div>
      </IonContent>
    </IonPage>
  );
};

export default Login;
