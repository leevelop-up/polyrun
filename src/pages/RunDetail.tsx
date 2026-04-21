import { useRef, useState, useCallback } from 'react';
import { useHistory } from 'react-router-dom';
import { IonPage, IonContent, IonButton, IonIcon, useIonViewDidEnter } from '@ionic/react';
import { arrowBack, cameraOutline, downloadOutline, closeOutline } from 'ionicons/icons';
import L from 'leaflet';
import type { SavedRun } from '../types/run';
import type { LatLng } from '../types/geo';

const formatTime = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

const formatPace = (distM: number, secs: number) => {
  if (distM < 10 || secs < 1) return "--'--\"";
  const paceSecPerKm = secs / (distM / 1000);
  const m = Math.floor(paceSecPerKm / 60);
  const s = Math.round(paceSecPerKm % 60);
  return `${m}'${String(s).padStart(2, '0')}"`;
};

const pathToSvgPoints = (path: LatLng[], w: number, h: number, pad = 20) => {
  if (path.length < 2) return [] as [number, number][];
  const lats = path.map(p => p.lat);
  const lngs = path.map(p => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const rangeX = maxLng - minLng || 0.001;
  const rangeY = maxLat - minLat || 0.001;
  const scale = Math.min((w - pad * 2) / rangeX, (h - pad * 2) / rangeY);
  const offsetX = (w - rangeX * scale) / 2;
  const offsetY = (h - rangeY * scale) / 2;
  return path.map(p => [
    offsetX + (p.lng - minLng) * scale,
    h - offsetY - (p.lat - minLat) * scale,
  ] as [number, number]);
};

const RunDetail: React.FC = () => {
  const history = useHistory();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const [showCamera, setShowCamera] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [textColor, setTextColor] = useState<'black' | 'white'>('white');
  const [overlayScale, setOverlayScale] = useState(1.0);
  const pinchStartDist = useRef<number | null>(null);
  const pinchStartScale = useRef(1.0);

  // 오버레이 위치 (화면 기준 %, 드래그로 변경)
  const [overlayPos, setOverlayPos] = useState({ x: 0.05, y: 0.55 }); // left 5%, top 55%
  const dragStart = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  const run: SavedRun | null = (() => {
    try { return JSON.parse(localStorage.getItem('selectedRun') || 'null'); } catch { return null; }
  })();

  useIonViewDidEnter(() => {
    if (!mapRef.current || !run || run.path.length < 2) return;
    if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
    const map = L.map(mapRef.current, { zoomControl: false, attributionControl: false });
    mapInstanceRef.current = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    const latlngs = run.path.map(p => [p.lat, p.lng] as [number, number]);
    const polyline = L.polyline(latlngs, { color: '#4285f4', weight: 5, opacity: 0.9 }).addTo(map);
    L.circleMarker(latlngs[0], { radius: 8, fillColor: '#34c759', fillOpacity: 1, color: '#fff', weight: 2 }).addTo(map);
    L.circleMarker(latlngs[latlngs.length - 1], { radius: 8, fillColor: '#ff3b30', fillOpacity: 1, color: '#fff', weight: 2 }).addTo(map);
    map.fitBounds(polyline.getBounds(), { padding: [40, 40] });
  });

  const startStream = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
    streamRef.current = stream;
    setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    }, 80);
  };

  const openCamera = async () => {
    try {
      await startStream();
      setCapturedImage(null);
      setShowCamera(true);
    } catch {
      alert('카메라 권한이 필요합니다.');
    }
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  const closeCamera = () => {
    stopStream();
    setShowCamera(false);
    setCapturedImage(null);
  };

  const retakePhoto = async () => {
    setCapturedImage(null);
    try {
      await startStream();
    } catch {
      alert('카메라 권한이 필요합니다.');
    }
  };

  // 드래그 핸들러
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = {
      px: e.clientX,
      py: e.clientY,
      ox: overlayPos.x,
      oy: overlayPos.y,
    };
  }, [overlayPos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStart.current) return;
    const sw = window.innerWidth;
    const sh = window.innerHeight;
    const dx = (e.clientX - dragStart.current.px) / sw;
    const dy = (e.clientY - dragStart.current.py) / sh;
    setOverlayPos({
      x: Math.max(0, Math.min(0.7, dragStart.current.ox + dx)),
      y: Math.max(0, Math.min(0.85, dragStart.current.oy + dy)),
    });
  }, []);

  const onPointerUp = useCallback(() => {
    dragStart.current = null;
  }, []);

  const capturePhoto = () => {
    if (!videoRef.current || !run) return;
    const video = videoRef.current;
    const vw = video.videoWidth || 1080;
    const vh = video.videoHeight || 1920;

    // 화면에 보이는 영역 계산 (objectFit: cover)
    const sw = window.innerWidth;
    const sh = window.innerHeight;
    const scale = Math.max(sw / vw, sh / vh);
    const srcW = sw / scale;
    const srcH = sh / scale;
    const srcX = (vw - srcW) / 2;
    const srcY = (vh - srcH) / 2;

    // 캔버스를 화면 크기로 설정
    const dpr = window.devicePixelRatio || 1;
    const canvas = document.createElement('canvas');
    canvas.width = sw * dpr;
    canvas.height = sh * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    // 화면에 보이는 영역만 그리기
    ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, sw, sh);

    const isWhiteText = textColor === 'white';
    const mainC = isWhiteText ? '#ffffff' : '#1a1a1a';
    const subC = isWhiteText ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)';

    // 오버레이 origin은 화면 px 그대로
    const ox = overlayPos.x * sw;
    const oy = overlayPos.y * sh;

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(overlayScale, overlayScale);

    let y = 0;

    // 런플리 레이블
    const labelSize = sw * 0.03;
    ctx.font = `400 ${labelSize}px -apple-system, sans-serif`;
    ctx.fillStyle = subC;
    ctx.fillText('런플리', 0, labelSize);
    y += labelSize * 2.2;

    // 거리 (크게)
    const kmFontSize = sw * 0.14;
    ctx.font = `800 ${kmFontSize}px -apple-system, sans-serif`;
    ctx.fillStyle = mainC;
    const km = (run.distance / 1000).toFixed(2);
    ctx.fillText(km, 0, y + kmFontSize);
    const kmW = ctx.measureText(km).width;
    const kmUnitSize = sw * 0.045;
    ctx.font = `400 ${kmUnitSize}px -apple-system, sans-serif`;
    ctx.fillStyle = subC;
    ctx.fillText('km', kmW + sw * 0.012, y + kmFontSize - sw * 0.012);
    y += kmFontSize + sw * 0.03;

    // 페이스 | 완료 시간 (나란히)
    const statSize = sw * 0.048;
    const statLabelSize = sw * 0.026;
    const colGap = sw * 0.2;

    ctx.font = `600 ${statSize}px -apple-system, sans-serif`;
    ctx.fillStyle = mainC;
    ctx.fillText(formatPace(run.distance, run.time), 0, y + statSize);
    ctx.fillText(formatTime(run.time), colGap, y + statSize);
    y += statSize + sw * 0.01;

    ctx.font = `400 ${statLabelSize}px -apple-system, sans-serif`;
    ctx.fillStyle = subC;
    ctx.fillText('페이스 /km', 0, y + statLabelSize);
    ctx.fillText('완료 시간', colGap, y + statLabelSize);
    y += statLabelSize + sw * 0.04;

    // 경로 폴리라인
    const routeW = sw * 0.32;
    const routeH = sw * 0.18;
    const routePts = pathToSvgPoints(run.path, routeW, routeH, 8);
    if (routePts.length >= 2) {
      ctx.strokeStyle = isWhiteText ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.85)';
      ctx.lineWidth = sw * 0.007;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(routePts[0][0], y + routePts[0][1]);
      for (let i = 1; i < routePts.length; i++) ctx.lineTo(routePts[i][0], y + routePts[i][1]);
      ctx.stroke();
    }

    ctx.restore();

    stopStream();
    setCapturedImage(canvas.toDataURL('image/jpeg', 0.92));
  };

  const saveImage = () => {
    if (!capturedImage) return;
    const a = document.createElement('a');
    a.href = capturedImage;
    a.download = `polyrunning_${Date.now()}.jpg`;
    a.click();
  };

  if (!run) return null;

  return (
    <IonPage>
      <IonContent style={{ '--background': '#f5f5f5' }}>
        {/* 헤더 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '52px 16px 16px', background: '#fff', borderBottom: '1px solid #eee',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <IonButton fill="clear" onClick={() => history.goBack()} style={{ '--color': '#333', margin: 0 }}>
              <IonIcon icon={arrowBack} />
            </IonButton>
            <span style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a' }}>
              {new Date(run.date).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })} 러닝
            </span>
          </div>
          <IonButton fill="clear" onClick={openCamera} style={{ '--color': '#4285f4', margin: 0 }}>
            <IonIcon icon={cameraOutline} style={{ fontSize: 24 }} />
          </IonButton>
        </div>

        {/* 통계 카드 */}
        <div style={{ margin: '16px', background: '#fff', borderRadius: 16, padding: '24px 20px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#1a1a1a' }}>{(run.distance / 1000).toFixed(2)}</div>
              <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>km</div>
            </div>
            <div style={{ width: 1, background: '#eee' }} />
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#1a1a1a' }}>{formatPace(run.distance, run.time)}</div>
              <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>페이스 /km</div>
            </div>
            <div style={{ width: 1, background: '#eee' }} />
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a' }}>{formatTime(run.time)}</div>
              <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>완료 시간</div>
            </div>
          </div>
        </div>

        {/* 지도 */}
        {run.path.length >= 2 ? (
          <div style={{ margin: '0 16px 16px', borderRadius: 16, overflow: 'hidden', height: 360, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
          </div>
        ) : (
          <div style={{ margin: '0 16px', padding: 24, textAlign: 'center', color: '#999', background: '#fff', borderRadius: 16 }}>
            GPS 경로 데이터가 없습니다
          </div>
        )}
      </IonContent>

      {/* 카메라 뷰 */}
      {showCamera && !capturedImage && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#000' }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />

          {/* 드래그 가능한 오버레이 */}
          {(() => {
            const tc = textColor === 'white' ? '#fff' : '#1a1a1a';
            const subC = textColor === 'white' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)';
            const bg = textColor === 'white' ? 'rgba(0,0,0,0.72)' : '#ffffff';
            return (
              <div
                ref={overlayRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onTouchStart={e => {
                  if (e.touches.length === 2) {
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    pinchStartDist.current = Math.hypot(dx, dy);
                    pinchStartScale.current = overlayScale;
                  }
                }}
                onTouchMove={e => {
                  if (e.touches.length === 2 && pinchStartDist.current) {
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    const dist = Math.hypot(dx, dy);
                    const next = Math.max(0.5, Math.min(3.0, pinchStartScale.current * (dist / pinchStartDist.current)));
                    setOverlayScale(next);
                  }
                }}
                onTouchEnd={() => { pinchStartDist.current = null; }}
                style={{
                  position: 'absolute',
                  left: `${overlayPos.x * 100}%`,
                  top: `${overlayPos.y * 100}%`,
                  touchAction: 'none',
                  cursor: 'grab',
                  userSelect: 'none',
                  padding: '12px 16px 14px',
                  background: 'transparent',
                  borderRadius: 14,
                  minWidth: 200,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  transformOrigin: 'top left',
                  transform: `scale(${overlayScale})`,
                }}
              >
                <div style={{ fontSize: 10, color: subC, letterSpacing: 2, marginBottom: 4 }}>런플리</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 8 }}>
                  <span style={{ fontSize: 44, fontWeight: 800, color: tc, lineHeight: 1 }}>
                    {(run.distance / 1000).toFixed(2)}
                  </span>
                  <span style={{ fontSize: 14, color: subC }}>km</span>
                </div>
                <div style={{ display: 'flex', gap: 20 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: tc }}>{formatPace(run.distance, run.time)}</div>
                    <div style={{ fontSize: 9, color: subC, marginTop: 1 }}>페이스 /km</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: tc }}>{formatTime(run.time)}</div>
                    <div style={{ fontSize: 9, color: subC, marginTop: 1 }}>완료 시간</div>
                  </div>
                </div>
                {/* 경로 폴리라인 */}
                {run.path.length >= 2 && (() => {
                  const svgW = 200, svgH = 120, pad = 10;
                  const pts = pathToSvgPoints(run.path, svgW, svgH, pad);
                  if (pts.length < 2) return null;
                  const pointsStr = pts.map(p => `${p[0]},${p[1]}`).join(' ');
                  const lineColor = textColor === 'white' ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.85)';
                  return (
                    <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} style={{ display: 'block', marginTop: 12 }}>
                      <polyline points={pointsStr} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                    </svg>
                  );
                })()}
              </div>
            );
          })()}

          {/* 닫기 */}
          <button onClick={closeCamera} style={{
            position: 'absolute', top: 52, right: 20,
            background: 'rgba(0,0,0,0.4)', border: 'none', borderRadius: '50%',
            width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}>
            <IonIcon icon={closeOutline} style={{ color: '#fff', fontSize: 22 }} />
          </button>

          {/* 하단 컨트롤 */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            padding: '0 40px 48px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            {/* 왼쪽: 색상 토글 + 크기 조절 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => setTextColor(c => c === 'white' ? 'black' : 'white')}
                style={{
                  width: 40, height: 40, borderRadius: '50%', cursor: 'pointer',
                  border: '3px solid rgba(255,255,255,0.6)',
                  background: textColor === 'white'
                    ? 'linear-gradient(135deg, #fff 50%, #000 50%)'
                    : 'linear-gradient(135deg, #000 50%, #fff 50%)',
                }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => setOverlayScale(s => Math.max(0.5, s - 0.15))}
                  style={{
                    width: 32, height: 32, borderRadius: '50%', border: 'none',
                    background: 'rgba(255,255,255,0.2)', color: '#fff',
                    fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >−</button>
                <button
                  onClick={() => setOverlayScale(s => Math.min(3.0, s + 0.15))}
                  style={{
                    width: 32, height: 32, borderRadius: '50%', border: 'none',
                    background: 'rgba(255,255,255,0.2)', color: '#fff',
                    fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >+</button>
              </div>
            </div>

            {/* 셔터 */}
            <button onClick={capturePhoto} style={{
              width: 72, height: 72, borderRadius: '50%',
              background: '#fff', border: '5px solid rgba(255,255,255,0.35)',
              cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            }} />

            {/* 균형용 빈 공간 */}
            <div style={{ width: 40 }} />
          </div>
        </div>
      )}

      {/* 캡처 결과 */}
      {capturedImage && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#000', display: 'flex', flexDirection: 'column' }}>
          <img src={capturedImage} style={{ flex: 1, objectFit: 'contain', width: '100%' }} />
          <div style={{ display: 'flex', gap: 12, padding: '16px 24px 40px', background: '#000' }}>
            <button onClick={retakePhoto} style={{
              flex: 1, padding: '14px 0', borderRadius: 14, border: 'none',
              background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 15, cursor: 'pointer',
            }}>
              다시 찍기
            </button>
            <button onClick={saveImage} style={{
              flex: 1, padding: '14px 0', borderRadius: 14, border: 'none',
              background: '#4285f4', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <IonIcon icon={downloadOutline} />
              저장
            </button>
          </div>
        </div>
      )}
    </IonPage>
  );
};

// Canvas 둥근 사각형 헬퍼
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export default RunDetail;
