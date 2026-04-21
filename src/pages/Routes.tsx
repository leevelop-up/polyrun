import { useState } from 'react';
import { useHistory } from 'react-router-dom';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButton, IonIcon, IonAlert, useIonViewDidEnter,
} from '@ionic/react';
import { trash, pencil, chevronForward, menuOutline, mapOutline } from 'ionicons/icons';
import NavMenu from '../components/NavMenu';
import { RouteStorage } from '../storage/routeStorage';
import type { SavedRoute } from '../storage/routeStorage';

const formatDate = (d: string) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}.${String(dt.getMonth()+1).padStart(2,'0')}.${String(dt.getDate()).padStart(2,'0')}`;
};

const RoutePathPreview: React.FC<{ path: { lat: number; lng: number }[] }> = ({ path }) => {
  const w = 56, h = 40, pad = 5;
  if (path.length < 2) return null;
  const lats = path.map(p => p.lat), lngs = path.map(p => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const rx = maxLng - minLng || 0.001, ry = maxLat - minLat || 0.001;
  const scale = Math.min((w-pad*2)/rx, (h-pad*2)/ry);
  const ox = (w - rx*scale)/2, oy = (h - ry*scale)/2;
  const pts = path.map(p => `${ox+(p.lng-minLng)*scale},${h-oy-(p.lat-minLat)*scale}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke="#4285f4" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

const Routes: React.FC = () => {
  const [routes, setRoutes] = useState<SavedRoute[] | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showNavMenu, setShowNavMenu] = useState(false);
  const history = useHistory();

  useIonViewDidEnter(() => {
    setRoutes(RouteStorage.getAll().reverse());
  });

  const handleSelect = (route: SavedRoute) => {
    localStorage.setItem('selectedRoute', JSON.stringify(route));
    history.push('/tabs/map');
  };

  const handleEditLabel = (route: SavedRoute) => {
    const newLabel = window.prompt('루트 이름을 입력하세요:', route.label || '');
    if (newLabel !== null) {
      RouteStorage.updateLabel(route.id, newLabel.trim() || undefined);
      setRoutes(RouteStorage.getAll().reverse());
    }
  };

  const handleDelete = (id: string) => {
    RouteStorage.delete(id);
    setRoutes(RouteStorage.getAll().reverse());
    setDeleteId(null);
  };

  return (
    <IonPage>
      <NavMenu isOpen={showNavMenu} onClose={() => setShowNavMenu(false)} />
      <IonHeader>
        <IonToolbar>
          <IonTitle>루트</IonTitle>
          <div slot="end">
            <IonButton fill="clear" onClick={() => setShowNavMenu(true)} style={{ '--color': '#4a4a4a' }}>
              <IonIcon icon={menuOutline} style={{ fontSize: '24px' }} />
            </IonButton>
          </div>
        </IonToolbar>
      </IonHeader>
      <IonContent style={{ '--background': '#f5f5f5' }}>
        {routes === null ? null : routes.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 12 }}>
            <IonIcon icon={mapOutline} style={{ fontSize: 56, color: '#ccc' }} />
            <p style={{ color: '#999', fontSize: 15, margin: 0 }}>저장된 루트가 없어요</p>
            <p style={{ color: '#bbb', fontSize: 13, margin: 0 }}>지도에서 경로를 그리고 루트 저장을 눌러보세요!</p>
          </div>
        ) : (
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {routes.map(route => (
              <div
                key={route.id}
                onClick={() => handleSelect(route)}
                style={{
                  background: '#fff', borderRadius: 16, padding: '14px 16px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                }}
              >
                <RoutePathPreview path={route.path} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', marginBottom: 3 }}>
                    {route.label || formatDate(route.date)}
                  </div>
                  <div style={{ fontSize: 13, color: '#999' }}>
                    {(route.distanceM / 1000).toFixed(2)} km
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }} onClick={e => e.stopPropagation()}>
                  <IonButton fill="clear" size="small" onClick={() => handleEditLabel(route)}>
                    <IonIcon icon={pencil} />
                  </IonButton>
                  <IonButton fill="clear" size="small" color="danger" onClick={() => setDeleteId(route.id)}>
                    <IonIcon icon={trash} />
                  </IonButton>
                </div>
                <IonIcon icon={chevronForward} style={{ color: '#ccc', fontSize: 18 }} />
              </div>
            ))}
          </div>
        )}

        <IonAlert
          isOpen={deleteId !== null}
          header="루트 삭제"
          message="이 루트를 삭제할까요?"
          buttons={[
            { text: '취소', role: 'cancel', handler: () => setDeleteId(null) },
            { text: '삭제', role: 'destructive', handler: () => { if (deleteId) handleDelete(deleteId); } },
          ]}
        />
      </IonContent>
    </IonPage>
  );
};

export default Routes;
