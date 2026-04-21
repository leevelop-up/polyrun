import React, { useState, useEffect } from 'react';
import { IonButton, IonIcon } from '@ionic/react';
import { pencil, move, arrowBack, refresh, play, closeCircle, close, chevronUp, chevronDown } from 'ionicons/icons';

interface Props {
  isRunning: boolean;
  isDrawingMode: boolean;
  isShowingSavedRoute: boolean;
  canUndo: boolean;
  hasPath: boolean;
  onStartDrawing(): void;
  onStopDrawing(): void;
  onUndoDrawing(): void;
  onClear(): void;
  onConfirm(): void;
  onSaveRoute(): void;
  onEndRun(): void;
  onCloseSavedRoute(): void;
}

export const MapControls: React.FC<Props> = ({
  isRunning,
  isDrawingMode,
  isShowingSavedRoute,
  canUndo,
  hasPath,
  onStartDrawing,
  onStopDrawing,
  onUndoDrawing,
  onClear,
  onConfirm,
  onSaveRoute,
  onEndRun,
  onCloseSavedRoute,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  // 드로잉 모드 진입 시 툴바 펼침
  useEffect(() => {
    if (isDrawingMode) setCollapsed(false);
  }, [isDrawingMode]);

  if (isShowingSavedRoute) {
    return (
      <div className="map-controls">
        <IonButton
          color="danger"
          onClick={onCloseSavedRoute}
          style={{ margin: 0, width: '56px', height: '56px' }}
        >
          <IonIcon icon={close} size="large" />
        </IonButton>
      </div>
    );
  }

  return (
    <>
      {/* 드로잉 모드 상단 툴바 */}
      <div className={`drawing-toolbar ${isDrawingMode ? 'drawing-toolbar--visible' : ''} ${collapsed ? 'drawing-toolbar--collapsed' : ''}`}>
        {/* 접기/펼치기 탭 */}
        <button
          className="drawing-toolbar__toggle"
          onClick={() => setCollapsed(v => !v)}
        >
          <IonIcon icon={collapsed ? chevronDown : chevronUp} />
        </button>

        {/* 버튼들 - 접혔을 때 숨김 */}
        <div className="drawing-toolbar__buttons">
          <button
            className="drawing-toolbar__btn"
            onClick={onStopDrawing}
          >
            <IonIcon icon={move} />
            <span>이동</span>
          </button>

          <button
            className="drawing-toolbar__btn"
            onClick={onUndoDrawing}
            disabled={!canUndo}
          >
            <IonIcon icon={arrowBack} />
            <span>되돌리기</span>
          </button>

          <button
            className="drawing-toolbar__btn"
            onClick={onClear}
          >
            <IonIcon icon={refresh} />
            <span>초기화</span>
          </button>

          <div className="drawing-toolbar__divider" />

          <button
            className="drawing-toolbar__btn drawing-toolbar__btn--save"
            onClick={onSaveRoute}
            disabled={!hasPath}
          >
            <span className="drawing-toolbar__save-icon">★</span>
            <span>루트저장</span>
          </button>

          <button
            className="drawing-toolbar__btn drawing-toolbar__btn--start"
            onClick={onConfirm}
            disabled={!hasPath}
          >
            <IonIcon icon={play} />
            <span>시작</span>
          </button>
        </div>
      </div>

      {/* 오른쪽 플로팅 버튼 */}
      <div className="map-controls">
        {isRunning ? (
          <IonButton
            color="danger"
            onClick={onEndRun}
            style={{ margin: 0, width: '56px', height: '56px' }}
          >
            <IonIcon icon={closeCircle} size="large" />
          </IonButton>
        ) : !isDrawingMode ? (
          <IonButton
            onClick={onStartDrawing}
            style={{ margin: 0, width: '56px', height: '56px' }}
          >
            <IonIcon icon={pencil} size="large" />
          </IonButton>
        ) : null}
      </div>
    </>
  );
};
