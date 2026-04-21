import { useEffect, useRef, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { IonPage, IonContent, IonIcon } from '@ionic/react';
import { stopCircleOutline, playCircleOutline } from 'ionicons/icons';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import { ForegroundService, ServiceType } from '@capawesome-team/capacitor-android-foreground-service';

import type { LatLng } from '../types/geo';
import { RunStorage } from '../storage/runStorage';
import './RunningScreen.css';

const isAndroid = Capacitor.getPlatform() === 'android';

const startForegroundService = async (title: string, body: string) => {
  if (!isAndroid) return;
  try {
    const perm = await ForegroundService.checkPermissions();
    if (perm.display !== 'granted') {
      await ForegroundService.requestPermissions();
    }
    await ForegroundService.startForegroundService({
      title,
      body,
      id: 1001,
      smallIcon: 'ic_launcher_foreground',
      serviceType: ServiceType.Location,
      silent: true,
    });
  } catch (e) {
    console.warn('Foreground service start failed', e);
  }
};

const updateForegroundNotification = async (title: string, body: string) => {
  if (!isAndroid) return;
  try {
    await ForegroundService.updateForegroundService({
      title,
      body,
      id: 1001,
      smallIcon: 'ic_launcher_foreground',
    });
  } catch {}
};

const stopForegroundService = async () => {
  if (!isAndroid) return;
  try {
    await ForegroundService.stopForegroundService();
  } catch {}
};

const getDistance = (a: LatLng, b: LatLng) => {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const aa = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1-aa));
};

const formatTime = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
};

const formatPace = (distM: number, secs: number) => {
  if (distM < 10 || secs < 1) return "--'--\"";
  const paceSecPerKm = secs / (distM / 1000);
  const m = Math.floor(paceSecPerKm / 60);
  const s = Math.round(paceSecPerKm % 60);
  return `${m}'${String(s).padStart(2,'0')}"`;
};

const pathToSvg = (path: LatLng[], w: number, h: number, pad = 20) => {
  if (path.length < 2) return { points: '', toX: null, toY: null };
  const lats = path.map(p => p.lat);
  const lngs = path.map(p => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const rangeX = maxLng - minLng || 0.001;
  const rangeY = maxLat - minLat || 0.001;
  const scale = Math.min((w - pad*2) / rangeX, (h - pad*2) / rangeY);
  const drawnW = rangeX * scale;
  const drawnH = rangeY * scale;
  const offsetX = (w - drawnW) / 2;
  const offsetY = (h - drawnH) / 2;
  const toX = (lng: number) => offsetX + (lng - minLng) * scale;
  const toY = (lat: number) => h - offsetY - (lat - minLat) * scale;
  const points = path.map(p => `${toX(p.lng)},${toY(p.lat)}`).join(' ');
  return { points, toX, toY };
};

const calcRouteKm = (path: LatLng[]) => {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += getDistance(path[i-1], path[i]);
  return total / 1000;
};

const RunningScreen: React.FC = () => {
  const history = useHistory();
  const [elapsed, setElapsed] = useState(0);
  const [distanceM, setDistanceM] = useState(0);
  const [cadence, setCadence] = useState(0);
  const [currentPos, setCurrentPos] = useState<LatLng | null>(null);
  const [route, setRoute] = useState<LatLng[]>([]);

  const [isPaused, setIsPaused] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pressProgress, setPressProgress] = useState(0);

  const startTimeRef = useRef(Date.now());
  const pausedTimeRef = useRef(0);
  const pauseStartRef = useRef(0);
  const isPausedRef = useRef(false);
  const lastPosRef = useRef<LatLng | null>(null);
  const distRef = useRef(0);
  const stepTimesRef = useRef<number[]>([]);
  const lastStepDistRef = useRef(0);
  const pressStartTimeRef = useRef<number | null>(null);
  const pressRafRef = useRef<number | null>(null);
  const runPathRef = useRef<LatLng[]>([]);

  useEffect(() => {
    const raw = localStorage.getItem('runningRoute');
    if (raw) {
      try { setRoute(JSON.parse(raw)); } catch {}
    }
    startTimeRef.current = Date.now();
    startForegroundService('🏃 런플리', '러닝 시작!');
    return () => { stopForegroundService(); };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!isPaused) {
        const e = Math.floor((Date.now() - startTimeRef.current - pausedTimeRef.current) / 1000);
        setElapsed(e);
        // 알림 업데이트 (5초마다)
        if (e % 5 === 0) {
          const dist = distRef.current;
          const pace = formatPace(dist, e);
          const km = (dist / 1000).toFixed(2);
          const time = formatTime(e);
          updateForegroundNotification(
            `🏃 ${km}km · ${pace}/km`,
            `시간 ${time}`,
          );
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [isPaused]);

  useEffect(() => {
    let watchId: string;
    const start = async () => {
      try {
        watchId = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 10000 },
          (pos) => {
            if (!pos) return;
            const loc: LatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setCurrentPos(loc);
            runPathRef.current.push(loc);
            if (lastPosRef.current && !isPausedRef.current) {
              const d = getDistance(lastPosRef.current, loc);
              if (d > 1) {
                distRef.current += d;
                setDistanceM(distRef.current);
                const stepsNow = Math.floor(distRef.current / 1.5);
                const stepsBefore = Math.floor(lastStepDistRef.current / 1.5);
                if (stepsNow > stepsBefore) {
                  const now = Date.now();
                  stepTimesRef.current.push(now);
                  stepTimesRef.current = stepTimesRef.current.filter(t => now - t < 60000);
                  const rpm = (stepTimesRef.current.length / Math.min((now - startTimeRef.current) / 1000, 60)) * 60;
                  setCadence(Math.round(rpm * 2));
                }
                lastStepDistRef.current = distRef.current;
              }
            }
            lastPosRef.current = loc;
          }
        );
      } catch (e) {
        console.warn('GPS 오류', e);
      }
    };
    start();
    return () => {
      if (watchId) Geolocation.clearWatch({ id: watchId });
    };
  }, []);

  const doStop = async () => {
    if (isSaving) return;
    setIsSaving(true);
    const elapsedSec = elapsed;
    const distM = distRef.current;
    const pace = distM > 10 ? elapsedSec / (distM / 1000) : 0;

    // 실제 GPS 경로가 없으면 그린 경로를 대신 사용
    let savedPath = runPathRef.current;
    if (savedPath.length < 2) {
      try {
        const raw = localStorage.getItem('runningRoute');
        if (raw) savedPath = JSON.parse(raw);
      } catch {}
    }

    // 고도 fetch
    let elevations: number[] | undefined;
    try {
      const maxPoints = 100;
      const sampled: LatLng[] = [];
      if (savedPath.length <= maxPoints) {
        sampled.push(...savedPath);
      } else {
        for (let i = 0; i < maxPoints; i++) {
          sampled.push(savedPath[Math.round(i * (savedPath.length - 1) / (maxPoints - 1))]);
        }
      }
      const res = await fetch('https://api.open-elevation.com/api/v1/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations: sampled.map(p => ({ latitude: p.lat, longitude: p.lng })) }),
      });
      const data = await res.json();
      elevations = data.results.map((r: any) => Math.round(r.elevation ?? 0));
    } catch {
      elevations = undefined;
    }

    RunStorage.save({
      id: `run_${Date.now()}`,
      date: new Date().toISOString(),
      distance: distM,
      time: elapsedSec,
      avgSpeed: pace,
      path: savedPath,
      elevations,
    });
    localStorage.removeItem('runningRoute');
    localStorage.setItem('runningFinished', '1');
    await stopForegroundService();
    history.replace('/tabs/records');
  };

  const handleTap = () => {
    if (isPausedRef.current) {
      // 일시정지 → 재개
      const pauseDuration = Date.now() - pauseStartRef.current;
      pausedTimeRef.current += pauseDuration;
      pauseStartRef.current = 0;
      isPausedRef.current = false;
      setIsPaused(false);
    } else {
      // 실행 중 → 일시정지
      pauseStartRef.current = Date.now();
      isPausedRef.current = true;
      setIsPaused(true);
    }
  };

  const LONG_PRESS_MS = 3000;

  const stopPress = () => {
    pressStartTimeRef.current = null;
    if (pressRafRef.current !== null) {
      cancelAnimationFrame(pressRafRef.current);
      pressRafRef.current = null;
    }
    setPressProgress(0);
  };

  const handlePressStart = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pressRafRef.current !== null) return; // 이미 진행 중
    pressStartTimeRef.current = Date.now();
    const tick = () => {
      if (pressStartTimeRef.current === null) return;
      const progress = Math.min((Date.now() - pressStartTimeRef.current) / LONG_PRESS_MS, 1);
      setPressProgress(progress);
      if (progress >= 1) {
        stopPress();
        setShowStopConfirm(true);
      } else {
        pressRafRef.current = requestAnimationFrame(tick);
      }
    };
    pressRafRef.current = requestAnimationFrame(tick);
  };

  const handlePressEnd = () => {
    stopPress();
  };

  const svgW = 280, svgH = 160;
  const { points, toX, toY } = route.length >= 2
    ? pathToSvg(route, svgW, svgH)
    : { points: '', toX: null, toY: null };

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const rawDotX = currentPos && toX ? toX(currentPos.lng) : null;
  const rawDotY = currentPos && toY ? toY(currentPos.lat) : null;
  const dotX = rawDotX !== null ? clamp(rawDotX, 10, svgW - 10) : null;
  const dotY = rawDotY !== null ? clamp(rawDotY, 10, svgH - 10) : null;
  const dotInBounds = rawDotX !== null && rawDotX >= 0 && rawDotX <= svgW && rawDotY !== null && rawDotY >= 0 && rawDotY <= svgH;

  return (
    <IonPage>
      <IonContent style={{ '--background': '#1a1a2e' }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          minHeight: '100vh',
          background: '#1a1a2e',
          padding: '48px 20px 40px',
          boxSizing: 'border-box',
        }}>

          {/* 미니맵 */}
          {route.length >= 2 && (
            <div style={{ width: '100%', maxWidth: 320, marginBottom: 28 }}>
              <div style={{
                background: 'rgba(255,255,255,0.07)',
                borderRadius: 16,
                overflow: 'hidden',
              }}>
                <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`}>
                  <polyline
                    points={points}
                    fill="none"
                    stroke="rgba(255,255,255,0.5)"
                    strokeWidth="3"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {dotX !== null && dotY !== null && (
                    <>
                      <circle cx={dotX} cy={dotY} r="10" fill={dotInBounds ? "rgba(66,133,244,0.3)" : "rgba(255,255,255,0.1)"} />
                      <circle cx={dotX} cy={dotY} r="6" fill={dotInBounds ? "#4285f4" : "rgba(255,255,255,0.4)"} stroke="#fff" strokeWidth="2" />
                    </>
                  )}
                </svg>
              </div>
              <div style={{ textAlign: 'center', marginTop: 8, color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
                목표 경로 <span style={{ color: '#fff', fontWeight: 600 }}>{calcRouteKm(route).toFixed(2)} km</span>
              </div>
            </div>
          )}

          {/* 타이머 */}
          <div style={{
            fontSize: 72,
            fontWeight: 200,
            color: '#fff',
            letterSpacing: 2,
            marginBottom: 32,
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
          }}>
            {formatTime(elapsed)}
          </div>

          {/* 스탯 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            maxWidth: 360,
            background: 'rgba(255,255,255,0.07)',
            borderRadius: 20,
            padding: '20px 0',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: 4 }}>
              <span style={{ fontSize: 28, fontWeight: 600, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
                {(distanceM / 1000).toFixed(2)}
              </span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>km</span>
            </div>

            <div style={{ width: 1, height: 40, background: 'rgba(255,255,255,0.15)' }} />

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: 4 }}>
              <span style={{ fontSize: 28, fontWeight: 600, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
                {formatPace(distanceM, elapsed)}
              </span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>페이스</span>
            </div>

            <div style={{ width: 1, height: 40, background: 'rgba(255,255,255,0.15)' }} />

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: 4 }}>
              <span style={{ fontSize: 28, fontWeight: 600, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
                {cadence > 0 ? cadence : '--'}
              </span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>케이던스</span>
            </div>
          </div>


          {/* 정지 버튼 */}
          {(() => {
            const R = 44;
            const SIZE = 100;
            const cx = SIZE / 2;
            const cy = SIZE / 2;
            const circumference = 2 * Math.PI * R;
            const dashOffset = circumference * (1 - pressProgress);
            return (
              <div
                onClick={handleTap}
                onPointerDown={handlePressStart}
                onPointerUp={handlePressEnd}
                onPointerLeave={handlePressEnd}
                onPointerCancel={handlePressEnd}
                style={{ position: 'relative', width: SIZE, height: SIZE, marginTop: 48, cursor: 'pointer', userSelect: 'none', touchAction: 'none' }}
              >
                {/* 원형 프로그레스 SVG */}
                <svg
                  width={SIZE} height={SIZE}
                  style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)' }}
                >
                  {/* 배경 트랙 */}
                  <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="4" />
                  {/* 진행 arc */}
                  {pressProgress > 0 && (
                    <circle
                      cx={cx} cy={cy} r={R}
                      fill="none"
                      stroke="#fff"
                      strokeWidth="4"
                      strokeDasharray={circumference}
                      strokeDashoffset={dashOffset}
                      strokeLinecap="round"
                    />
                  )}
                </svg>
                {/* 버튼 원 */}
                <div style={{
                  position: 'absolute',
                  top: '50%', left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 80, height: 80,
                  borderRadius: '50%',
                  background: isPaused ? '#ff9500' : '#ff3b30',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <IonIcon icon={isPaused ? playCircleOutline : stopCircleOutline} style={{ fontSize: 36, color: '#fff' }} />
                </div>
              </div>
            );
          })()}

          {/* 종료 확인 다이얼로그 */}
          {showStopConfirm && (
            <div style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
            }}>
              <div style={{
                background: '#2a2a3e', borderRadius: 20, padding: '32px 28px',
                textAlign: 'center', width: 280,
              }}>
                <div style={{ color: '#fff', fontSize: 18, fontWeight: 600, marginBottom: 8 }}>정지할까요?</div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 28 }}>
                  현재까지의 기록이 저장됩니다
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    onClick={() => setShowStopConfirm(false)}
                    style={{
                      flex: 1, padding: '12px 0', borderRadius: 12, border: 'none',
                      background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 15, cursor: 'pointer',
                    }}
                  >
                    계속하기
                  </button>
                  <button
                    onClick={doStop}
                    disabled={isSaving}
                    style={{
                      flex: 1, padding: '12px 0', borderRadius: 12, border: 'none',
                      background: isSaving ? '#999' : '#ff3b30',
                      color: '#fff', fontSize: 15, fontWeight: 600,
                      cursor: isSaving ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    {isSaving ? (
                      <>
                        <span style={{
                          width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)',
                          borderTopColor: '#fff', borderRadius: '50%',
                          display: 'inline-block', animation: 'spin 0.8s linear infinite',
                        }} />
                        저장 중...
                      </>
                    ) : '정지'}
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </IonContent>
    </IonPage>
  );
};

export default RunningScreen;
