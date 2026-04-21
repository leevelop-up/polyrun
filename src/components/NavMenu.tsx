import { useHistory, useLocation } from 'react-router-dom';
import { IonIcon } from '@ionic/react';
import { mapOutline, timeOutline, bookmarkOutline, personOutline, closeOutline } from 'ionicons/icons';

interface NavMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

const NAV_ITEMS = [
  { icon: mapOutline, label: '지도', path: '/tabs/map' },
  { icon: timeOutline, label: '기록', path: '/tabs/records' },
  { icon: bookmarkOutline, label: '루트', path: '/tabs/routes' },
  // { icon: personOutline, label: '프로필', path: '/tabs/login' },
];

const NavMenu: React.FC<NavMenuProps> = ({ isOpen, onClose }) => {
  const history = useHistory();
  const location = useLocation();

  const handleNav = (path: string) => {
    onClose();
    history.push(path);
  };

  return (
    <>
      {/* 배경 오버레이 */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 2000,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
        }}
      />

      {/* 슬라이드 패널 */}
      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: '75%', maxWidth: '320px',
          background: '#ffffff',
          zIndex: 2001,
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s ease',
          display: 'flex', flexDirection: 'column',
          paddingTop: 'env(safe-area-inset-top)',
          boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
        }}
      >
        {/* 헤더 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid #f0f0f0',
        }}>
          <span style={{ fontSize: '18px', fontWeight: 600, color: '#4a4a4a' }}>메뉴</span>
          <div onClick={onClose} style={{ cursor: 'pointer', padding: '4px' }}>
            <IonIcon icon={closeOutline} style={{ fontSize: '24px', color: '#4a4a4a' }} />
          </div>
        </div>

        {/* 메뉴 항목 */}
        <div style={{ flex: 1, paddingTop: '8px' }}>
          {NAV_ITEMS.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <div
                key={item.path}
                onClick={() => handleNav(item.path)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '16px',
                  padding: '18px 24px', cursor: 'pointer',
                  background: isActive ? '#f0f5ff' : 'transparent',
                  borderLeft: isActive ? '3px solid #4285f4' : '3px solid transparent',
                }}
              >
                <IonIcon icon={item.icon} style={{ fontSize: '22px', color: isActive ? '#4285f4' : '#888' }} />
                <span style={{ fontSize: '16px', color: isActive ? '#4285f4' : '#4a4a4a', fontWeight: isActive ? 600 : 400 }}>
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};

export default NavMenu;
