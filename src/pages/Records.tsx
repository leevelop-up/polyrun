import { useState, useRef } from 'react';
import { useHistory } from 'react-router-dom';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonIcon,
  IonButton,
  IonAlert,
  useIonViewDidEnter,
} from '@ionic/react';
import { trash, pencil, chevronForward, calendarOutline, flagOutline, menuOutline, downloadOutline } from 'ionicons/icons';
import NavMenu from '../components/NavMenu';
import ElevationChart from '../components/ElevationChart';
import { RunStorage } from '../storage/runStorage';
import type { SavedRun } from '../types/run';
import './Records.css';

const Records: React.FC = () => {
  const [runs, setRuns] = useState<SavedRun[] | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showNavMenu, setShowNavMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const history = useHistory();

  const parseGpx = (xmlText: string): { path: { lat: number; lng: number }[]; elevations: number[] } => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');
    const trkpts = Array.from(doc.querySelectorAll('trkpt'));
    const path: { lat: number; lng: number }[] = [];
    const elevations: number[] = [];
    trkpts.forEach(pt => {
      const lat = parseFloat(pt.getAttribute('lat') || '0');
      const lng = parseFloat(pt.getAttribute('lon') || '0');
      const ele = pt.querySelector('ele');
      path.push({ lat, lng });
      elevations.push(ele ? Math.round(parseFloat(ele.textContent || '0')) : 0);
    });
    return { path, elevations };
  };

  const handleGpxImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const { path, elevations } = parseGpx(ev.target?.result as string);
        if (path.length === 0) return;

        let distance = 0;
        for (let i = 1; i < path.length; i++) {
          const R = 6371000;
          const dLat = (path[i].lat - path[i-1].lat) * Math.PI / 180;
          const dLng = (path[i].lng - path[i-1].lng) * Math.PI / 180;
          const a = Math.sin(dLat/2)**2 + Math.cos(path[i-1].lat * Math.PI/180) * Math.cos(path[i].lat * Math.PI/180) * Math.sin(dLng/2)**2;
          distance += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        }

        const run: SavedRun = {
          id: `run_${Date.now()}`,
          date: new Date().toISOString(),
          distance,
          time: 0,
          avgSpeed: 0,
          path,
          label: file.name.replace('.gpx', ''),
          elevations: elevations.some(e => e > 0) ? elevations : undefined,
        };

        localStorage.setItem('selectedRun', JSON.stringify(run));
        history.push('/tabs/map');
      } catch {
        alert('GPX 파일을 읽을 수 없습니다.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  useIonViewDidEnter(() => {
    setRuns(RunStorage.getAll().reverse());
  });

  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  };


  const handleSelect = (run: SavedRun) => {
    localStorage.setItem('selectedRun', JSON.stringify(run));
    history.push('/tabs/record-detail');
  };

  const handleEditLabel = (run: SavedRun) => {
    const newLabel = window.prompt('라벨 이름을 입력하세요:', run.label || '');
    if (newLabel !== null) {
      RunStorage.updateLabel(run.id, newLabel.trim() || undefined);
      setRuns(RunStorage.getAll().reverse());
    }
  };

  const handleDelete = (id: string) => {
    RunStorage.delete(id);
    setRuns(RunStorage.getAll().reverse());
    setDeleteId(null);
  };

  return (
    <IonPage>
      <NavMenu isOpen={showNavMenu} onClose={() => setShowNavMenu(false)} />
      <IonHeader>
        <IonToolbar className="records-toolbar">
          <IonTitle className="records-title">러닝 기록</IonTitle>
          <div slot="end">
            <IonButton fill="clear" onClick={() => setShowNavMenu(true)} style={{ '--color': '#4a4a4a' }}>
              <IonIcon icon={menuOutline} style={{ fontSize: '24px' }} />
            </IonButton>
          </div>
        </IonToolbar>
      </IonHeader>
      <IonContent className="records-content">
        <input
          ref={fileInputRef}
          type="file"
          accept=".gpx"
          style={{ display: 'none' }}
          onChange={handleGpxImport}
        />
        <div style={{ padding: '16px 16px 0' }}>
          <IonButton expand="block" fill="outline" onClick={() => fileInputRef.current?.click()}
            style={{ '--border-color': '#4285f4', '--color': '#4285f4', '--border-radius': '12px' }}>
            <IonIcon icon={downloadOutline} slot="start" />
            경로 가져오기 (GPX)
          </IonButton>
        </div>
        {runs === null ? null : runs.length === 0 ? (
          <div className="records-empty">
            <div className="records-empty-icon">🏃</div>
            <p className="records-empty-title">아직 러닝 기록이 없어요</p>
            <p className="records-empty-sub">지도에서 경로를 그리고 달려보세요!</p>
          </div>
        ) : (
          <div className="records-list">
            {runs.map((run) => (
              <div key={run.id} className="record-card" onClick={() => handleSelect(run)}>
                <div className="record-card-main">
                  <div className="record-date">
                    <IonIcon icon={calendarOutline} />
                    <span>{run.label || formatDate(run.date)}</span>
                  </div>
                  <div className="record-stats" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div className="record-stat">
                      <IonIcon icon={flagOutline} />
                      <span className="stat-value">{(run.distance / 1000).toFixed(2)}</span>
                      <span className="stat-unit">km</span>
                    </div>
                    {run.elevations && run.elevations.length > 0 && (
                      <ElevationChart elevations={run.elevations} distanceM={run.distance} />
                    )}
                  </div>
                </div>
                <div className="record-card-actions" onClick={(e) => e.stopPropagation()}>
                  <IonButton fill="clear" size="small" onClick={() => handleEditLabel(run)}>
                    <IonIcon icon={pencil} />
                  </IonButton>
                  <IonButton fill="clear" size="small" color="danger" onClick={() => setDeleteId(run.id)}>
                    <IonIcon icon={trash} />
                  </IonButton>
                  <IonIcon icon={chevronForward} className="record-arrow" />
                </div>
              </div>
            ))}
          </div>
        )}

        <IonAlert
          isOpen={deleteId !== null}
          header="기록 삭제"
          message="이 러닝 기록을 삭제할까요?"
          buttons={[
            { text: '취소', role: 'cancel', handler: () => setDeleteId(null) },
            { text: '삭제', role: 'destructive', handler: () => { if (deleteId) handleDelete(deleteId); } },
          ]}
        />
      </IonContent>
    </IonPage>
  );
};

export default Records;
