import React from 'react';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButton,
  IonIcon,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
} from '@ionic/react';
import { pencil, trash } from 'ionicons/icons';
import type { SavedRun } from '../types/run';

interface Props {
  isOpen: boolean;
  runs: SavedRun[];
  onClose(): void;
  onSelect(run: SavedRun): void;
  onEditLabel(id: string, e: React.MouseEvent): void;
  onDelete(id: string, e: React.MouseEvent): void;
  formatDate(dateString: string): string;
}

export const SavedRunsModal: React.FC<Props> = ({
  isOpen,
  runs,
  onClose,
  onSelect,
  onEditLabel,
  onDelete,
  formatDate,
}) => {
  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose}>
      <IonHeader>
        <IonToolbar>
          <IonTitle>저장된 러닝 기록</IonTitle>
          <IonButton slot="end" fill="clear" onClick={onClose}>
            닫기
          </IonButton>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {runs.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
            저장된 러닝 기록이 없습니다.
          </div>
        ) : (
          <IonList>
            {runs.map((run) => (
              <IonItem
                key={run.id}
                button
                onClick={() => onSelect(run)}
                detail={false}
              >
                <IonLabel>
                  <h2>{run.label || formatDate(run.date)}</h2>
                </IonLabel>
                <IonButton
                  slot="end"
                  fill="clear"
                  color="medium"
                  onClick={(e) => onEditLabel(run.id, e)}
                  style={{ marginRight: '8px' }}
                >
                  <IonIcon icon={pencil} />
                </IonButton>
                <IonButton
                  slot="end"
                  fill="clear"
                  color="danger"
                  onClick={(e) => onDelete(run.id, e)}
                >
                  <IonIcon icon={trash} />
                </IonButton>
              </IonItem>
            ))}
          </IonList>
        )}
      </IonContent>
    </IonModal>
  );
};





