import { useEffect, useRef, useState } from 'react';
import { useHistory } from 'react-router-dom';
import {
  IonContent,
  IonPage,
  IonButton,
  IonSpinner,
  IonToast,
  IonAlert,
  IonModal,
  IonIcon,
  IonHeader,
  IonToolbar,
  IonTitle,
  useIonViewDidEnter,
} from '@ionic/react';
import { refresh, playForward, locate, menuOutline } from 'ionicons/icons';
import { Geolocation } from '@capacitor/geolocation';
import { App } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { AdMob } from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './Map.css';
import type { LatLng } from '../types/geo';
import type { SavedRun } from '../types/run';
import { RunStorage } from '../storage/runStorage';
import { RouteStorage } from '../storage/routeStorage';
import { MapControls } from '../components/MapControls';
import { SavedRunsModal } from '../components/SavedRunsModal';
import NavMenu from '../components/NavMenu';

interface DeviceOrientationEventiOS extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
}

// 🔧 배너 광고 (화면 하단) 제어
const ENABLE_BANNER_AD = true;
// 🔧 전면 광고 (정지 버튼 누를 때) 제어
const ENABLE_INTERSTITIAL_AD = false;
// 🔧 전면 광고 표시 주기 (N번마다 광고 표시)
const INTERSTITIAL_AD_FREQUENCY = 3;

const Map: React.FC = () => {
  const history = useHistory();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const polylinesRef = useRef<L.Polyline[]>([]);
  const polylineIndexMapRef = useRef<{ [key: string]: number }>({});
  const nextPolylineIndexRef = useRef<number>(0);
  const currentPolylineRef = useRef<L.Polyline | null>(null);
  const routePolylineRef = useRef<L.Polyline | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const directionMarkerRef = useRef<L.Marker | null>(null);
  const drawingPathRef = useRef<LatLng[]>([]);
  const allPathsRef = useRef<LatLng[][]>([]);
  const isDrawingRef = useRef(false);
  const currentLocationRef = useRef<LatLng | null>(null);
  const currentHeadingRef = useRef<number>(0);
  const [hasPath, setHasPath] = useState(false);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [routeTotalKm, setRouteTotalKm] = useState<number | null>(null);
  const [pathCount, setPathCount] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);
  const [locationError, setLocationError] = useState<string>('');
  const [currentHeading, setCurrentHeading] = useState<number>(0);
  const routePathRef = useRef<LatLng[]>([]);
  const lastNotificationTimeRef = useRef<number>(0);
  const isRunningRef = useRef<boolean>(false);
  const runningPathRef = useRef<LatLng[]>([]);
  const runningPolylineRef = useRef<L.Polyline | null>(null);
  const runningStartTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);
  const pauseStartTimeRef = useRef<number>(0);
  const runningDistanceRef = useRef<number>(0);
  const lastLocationRef = useRef<LatLng | null>(null);
  const [runningTime, setRunningTime] = useState<number>(0);
  const [runningDistance, setRunningDistance] = useState<number>(0);
  const [showExitAdModal, setShowExitAdModal] = useState<boolean>(false);
  const admobInitializedRef = useRef<boolean>(false);
  const [showMapControls, setShowMapControls] = useState<boolean>(false);
  const [showSavedRunsModal, setShowSavedRunsModal] = useState<boolean>(false);
  const [savedRuns, setSavedRuns] = useState<SavedRun[]>([]);
  const savedRoutePolylineRef = useRef<L.Polyline | null>(null);
  const [isShowingSavedRoute, setIsShowingSavedRoute] = useState<boolean>(false);
  const [showSaveConfirmAlert, setShowSaveConfirmAlert] = useState<boolean>(false);
  const [showNoPathAlert, setShowNoPathAlert] = useState<boolean>(false);
  const [showNavMenu, setShowNavMenu] = useState<boolean>(false);

  // 폴리라인을 키로 사용하기 위한 헬퍼 함수
  const getPolylineKey = (polyline: L.Polyline): string => {
    // Leaflet의 내부 ID 사용
    const leafletId = (polyline as any)._leaflet_id;
    if (leafletId !== undefined && leafletId !== null) {
      return `polyline_${leafletId}`;
    }
    // ID가 없으면 타임스탬프 기반 키 생성
    return `polyline_${Date.now()}_${Math.random()}`;
  };

  const createDirectionIcon = (heading: number) => {
    const svgIcon = `
      <svg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
        <g transform="rotate(${heading} 30 30)">
          <circle cx="30" cy="30" r="28" fill="rgba(66, 133, 244, 0.2)" stroke="#4285f4" stroke-width="2"/>
          <circle cx="30" cy="30" r="4" fill="white" stroke="#4285f4" stroke-width="2"/>
        </g>
      </svg>
    `;
    
    return L.divIcon({
      html: svgIcon,
      className: 'direction-marker',
      iconSize: [60, 60],
      iconAnchor: [30, 30]
    });
  };

  const createMarkerIcon = () => {
    return L.icon({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });
  };

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const defaultLocation: [number, number] = [37.5665, 126.9780];

    const map = L.map(mapRef.current, {
      center: defaultLocation,
      zoom: 15,
      zoomControl: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

    mapInstanceRef.current = map;

    map.whenReady(() => {
      setTimeout(() => {
        try {
          if (map && map.getContainer() && mapRef.current) {
            map.invalidateSize();
          }
        } catch (error) {
          console.warn('지도 크기 조정 오류:', error);
        }
      }, 200);
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let orientationHandler: ((event: DeviceOrientationEvent) => void) | null = null;

    const setupOrientation = () => {
      if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        (DeviceOrientationEvent as any).requestPermission()
          .then((permissionState: string) => {
            if (permissionState === 'granted') {
              startOrientationTracking();
            }
          })
          .catch((error: Error) => {
            console.error('나침반 권한 요청 오류:', error);
          });
      } else {
        startOrientationTracking();
      }
    };

    const startOrientationTracking = () => {
      orientationHandler = (event: DeviceOrientationEvent) => {
        let heading = 0;
        const iosEvent = event as DeviceOrientationEventiOS;

        if (iosEvent.webkitCompassHeading !== undefined) {
          heading = iosEvent.webkitCompassHeading;
        } else if (event.alpha !== null) {
          heading = 360 - event.alpha;
        }

        currentHeadingRef.current = heading;
        setCurrentHeading(heading);
        updateDirectionMarker(currentLocationRef.current, heading);
      };

      window.addEventListener('deviceorientation', orientationHandler);
    };

    setupOrientation();

    return () => {
      if (orientationHandler) {
        window.removeEventListener('deviceorientation', orientationHandler);
      }
    };
  }, []);

  const updateDirectionMarker = (location: LatLng | null, heading: number) => {
    if (!location || !mapInstanceRef.current) return;

    const position: [number, number] = [location.lat, location.lng];
    const icon = createDirectionIcon(heading);

    if (directionMarkerRef.current) {
      directionMarkerRef.current.setLatLng(position);
      directionMarkerRef.current.setIcon(icon);
    } else {
      directionMarkerRef.current = L.marker(position, { 
        icon,
        zIndexOffset: 1000
      }).addTo(mapInstanceRef.current);
    }
  };

  const updateCurrentLocationMarker = (location: LatLng) => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const position: [number, number] = [location.lat, location.lng];
    updateDirectionMarker(location, currentHeadingRef.current);
    map.setView(position, 15);
  };

  // 상태바 배경색 설정 (헤더와 동일하게)
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

  // AdMob 초기화 및 배너 광고 표시
  useEffect(() => {
    // 🔧 배너 광고 비활성화 모드 : 그냥 버튼만 조금 딜레이 후 노출
    if (!ENABLE_BANNER_AD) {
      const timer = setTimeout(() => {
        setShowMapControls(true);
      }, 300);
      return () => clearTimeout(timer);
    }

    // 웹 환경에서는 네이티브 AdMob 대신 회색 placeholder만 사용
    if (!Capacitor.isNativePlatform()) {
      const timer = setTimeout(() => {
        setShowMapControls(true);
      }, 500);
      return () => clearTimeout(timer);
    }
    
    let timer: NodeJS.Timeout | null = null;
    let bannerTimer: NodeJS.Timeout | null = null;
    
    timer = setTimeout(async () => {
      try {
        await AdMob.initialize({
          testingDevices: [],
          initializeForTesting: false,
        });
        
        admobInitializedRef.current = true;
        
        // 배너 광고
        bannerTimer = setTimeout(async () => {
          try {
            try {
              await AdMob.removeBanner();
            } catch (e) {
              // 이미 없으면 무시
            }

            await AdMob.showBanner({
              adId: 'ca-app-pub-8432922669855664/9809968062',
              adSize: 'ADAPTIVE_BANNER' as any,
              position: 'BOTTOM_CENTER' as any,
              margin: 0,
              isTesting: false
            });

            // 배너가 자리 잡았다고 보고 버튼 노출
            setTimeout(() => {
              setShowMapControls(true);
            }, 800);
          } catch (bannerError) {
            console.error('배너 광고 표시 오류:', bannerError);
            setShowMapControls(true);
          }
        }, 500);
      } catch (error) {
        console.error('AdMob 초기화 오류:', error);
        admobInitializedRef.current = false;
        setShowMapControls(true);
      }
    }, 400);
    
    return () => {
      if (timer) clearTimeout(timer);
      if (bannerTimer) clearTimeout(bannerTimer);
      if (Capacitor.isNativePlatform()) {
        AdMob.removeBanner().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    let watchId: string | null = null;

    const setupLocation = async () => {
      try {
        const permission = await Geolocation.checkPermissions();

        if (permission.location === 'prompt' || permission.location === 'prompt-with-rationale') {
          const requestResult = await Geolocation.requestPermissions();
          if (requestResult.location === 'denied') {
            setLocationError('위치 권한이 거부되었습니다.');
            setIsLoadingLocation(false);
            return;
          }
        } else if (permission.location === 'denied') {
          setLocationError('위치 권한이 거부되었습니다.');
          setIsLoadingLocation(false);
          return;
        }

        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });

        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };

        currentLocationRef.current = location;
        setIsLoadingLocation(false);
        setLocationError('');

        if (mapInstanceRef.current) {
          updateCurrentLocationMarker(location);
        }

        watchId = await Geolocation.watchPosition(
          {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
          },
          (position, err) => {
            if (err) {
              console.error('위치 추적 오류:', err);
              return;
            }

            if (position) {
              const location = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
              };

              currentLocationRef.current = location;

              if (directionMarkerRef.current && mapInstanceRef.current) {
                directionMarkerRef.current.setLatLng([location.lat, location.lng]);
              }

              if (isRunningRef.current && !isPaused) {
                if (routePathRef.current.length > 0) {
                  const distanceToRoute = getDistanceToRoute(location, routePathRef.current);
                  if (distanceToRoute >= 200) {
                    showDeviationNotification(distanceToRoute);
                  }
                }

                runningPathRef.current.push(location);
                
                if (lastLocationRef.current) {
                  const segmentDistance = getDistance(lastLocationRef.current, location);
                  runningDistanceRef.current += segmentDistance;
                  setRunningDistance(runningDistanceRef.current);
                }
                lastLocationRef.current = location;

                if (runningPathRef.current.length > 1 && mapInstanceRef.current) {
                  if (runningPolylineRef.current) {
                    mapInstanceRef.current.removeLayer(runningPolylineRef.current);
                  }
                  
                  const runningPath = runningPathRef.current.map(
                    (point) => [point.lat, point.lng] as [number, number]
                  );
                  
                  runningPolylineRef.current = L.polyline(runningPath, {
                    color: '#2dd36f',
                    weight: 4,
                    opacity: 0.8
                  }).addTo(mapInstanceRef.current);
                }
              }
            }
          }
        );
      } catch (error: any) {
        console.error('위치 정보 오류:', error);
        setIsLoadingLocation(false);
        setLocationError('위치 정보를 가져올 수 없습니다.');
      }
    };

    setupLocation();

    return () => {
      if (watchId) {
        Geolocation.clearWatch({ id: watchId });
      }
    };
  }, []);

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    
    if (isRunning && !isPaused) {
      timer = setInterval(() => {
        if (runningStartTimeRef.current > 0) {
          const elapsed = Math.floor((Date.now() - runningStartTimeRef.current) / 1000) - pausedTimeRef.current;
          setRunningTime(elapsed);
        }
      }, 1000);
    }
    
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isRunning, isPaused]);

  useEffect(() => {
    let backButtonHandler: any;
    
    App.addListener('backButton', ({ canGoBack }) => {
      if (!canGoBack) {
        // 광고 팝업이 열려있으면 앱 종료
        if (showExitAdModal) {
          App.exitApp();
        } else {
          // 광고 팝업 표시
          setShowExitAdModal(true);
        }
      } else {
        window.history.back();
      }
    }).then(handler => {
      backButtonHandler = handler;
    });

    return () => {
      if (backButtonHandler) {
        backButtonHandler.remove();
      }
    };
  }, [showExitAdModal]);

  const getDistance = (point1: LatLng, point2: LatLng): number => {
    const R = 6371000;
    const dLat = (point2.lat - point1.lat) * Math.PI / 180;
    const dLng = (point2.lng - point1.lng) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const distanceToLineSegment = (point: LatLng, lineStart: LatLng, lineEnd: LatLng): number => {
    const distToStart = getDistance(point, lineStart);
    const distToEnd = getDistance(point, lineEnd);
    const segmentLength = getDistance(lineStart, lineEnd);
    
    if (segmentLength < 1) {
      return distToStart;
    }
    
    const lat1 = lineStart.lat * Math.PI / 180;
    const lon1 = lineStart.lng * Math.PI / 180;
    const lat2 = lineEnd.lat * Math.PI / 180;
    const lon2 = lineEnd.lng * Math.PI / 180;
    const latP = point.lat * Math.PI / 180;
    const lonP = point.lng * Math.PI / 180;
    
    const dLat = lat2 - lat1;
    const dLon = lon2 - lon1;
    const vLat = latP - lat1;
    const vLon = lonP - lon1;
    
    const t = Math.max(0, Math.min(1, (vLat * dLat + vLon * dLon) / (dLat * dLat + dLon * dLon)));
    
    const closestLat = lat1 + t * dLat;
    const closestLon = lon1 + t * dLon;
    
    const closestPoint: LatLng = {
      lat: closestLat * 180 / Math.PI,
      lng: closestLon * 180 / Math.PI
    };
    
    return getDistance(point, closestPoint);
  };

  const getDistanceToRoute = (point: LatLng, route: LatLng[]): number => {
    if (route.length === 0) return Infinity;
    if (route.length === 1) return getDistance(point, route[0]);

    let minDistance = Infinity;
    for (let i = 0; i < route.length - 1; i++) {
      const distance = distanceToLineSegment(point, route[i], route[i + 1]);
      minDistance = Math.min(minDistance, distance);
    }
    return minDistance;
  };

  const showDeviationNotification = async (distance: number) => {
    const now = Date.now();
    if (now - lastNotificationTimeRef.current < 60000) {
      return;
    }
    lastNotificationTimeRef.current = now;

    const distanceInMeters = Math.round(distance);
    
    try {
      const permissionStatus = await LocalNotifications.checkPermissions();
      if (permissionStatus.display !== 'granted') {
        const requestResult = await LocalNotifications.requestPermissions();
        if (requestResult.display !== 'granted') {
          console.log(`동선에서 ${distanceInMeters}미터 벗어남 (알림 권한 없음)`);
          return;
        }
      }

      await LocalNotifications.schedule({
        notifications: [
          {
            title: '경로 이탈 알림',
            body: `동선에서 ${distanceInMeters}미터 벗어났어요`,
            id: Date.now(),
            sound: 'default'
          }
        ]
      });
    } catch (error) {
      console.error('알림 표시 오류:', error);
    }
  };

  const getLatLngFromPixel = (x: number, y: number, map: L.Map): LatLng | null => {
    if (!map || !mapRef.current) return null;

    try {
      const rect = mapRef.current.getBoundingClientRect();
      const point = L.point(x - rect.left, y - rect.top);
      const latlng = map.containerPointToLatLng(point);
      return { lat: latlng.lat, lng: latlng.lng };
    } catch (error) {
      console.error('좌표 변환 오류:', error);
      return null;
    }
  };

  const updateCurrentPolyline = (map: L.Map) => {
    if (drawingPathRef.current.length < 2) return;

    const path = drawingPathRef.current.map(
      (point) => [point.lat, point.lng] as [number, number]
    );

    if (currentPolylineRef.current) {
      currentPolylineRef.current.setLatLngs(path);
    } else {
      currentPolylineRef.current = L.polyline(path, {
        color: '#FF0000',
        weight: 4,
        opacity: 1
      }).addTo(map);
      polylinesRef.current.push(currentPolylineRef.current);
    }
  };

  const setupDrawing = (map: L.Map) => {
    const addPointToPath = (latlng: LatLng, minDistance = 0.5) => {
      const path = drawingPathRef.current;
      const lastPoint = path[path.length - 1];

      if (!lastPoint || getDistance(lastPoint, latlng) > minDistance) {
        path.push(latlng);
        setHasPath(allPathsRef.current.length > 0 || path.length >= 2);
        updateCurrentPolyline(map);
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (isDrawingMode && e.touches.length === 1) {
        isDrawingRef.current = true;
        drawingPathRef.current = [];
        currentPolylineRef.current = null;
        const touch = e.touches[0];
        const latlng = getLatLngFromPixel(touch.clientX, touch.clientY, map);
        if (latlng) {
          addPointToPath(latlng, 0);
          map.dragging.disable();
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (isDrawingMode && isDrawingRef.current && e.touches.length === 1) {
        e.preventDefault();
        const touch = e.touches[0];
        const latlng = getLatLngFromPixel(touch.clientX, touch.clientY, map);
        if (latlng && drawingPathRef.current.length > 0) {
          addPointToPath(latlng, 3);
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (isDrawingMode && e.touches.length === 0) {
        if (isDrawingRef.current && drawingPathRef.current.length > 0) {
          if (drawingPathRef.current.length >= 2) {
            allPathsRef.current.push([...drawingPathRef.current]);
            // currentPolylineRef에 인덱스 부여
            if (currentPolylineRef.current) {
              const idx = nextPolylineIndexRef.current++;
              const key = getPolylineKey(currentPolylineRef.current);
              polylineIndexMapRef.current[key] = idx;
              console.log('폴리라인 그리기 완료 - 키:', key, '인덱스:', idx, '전체 경로 수:', allPathsRef.current.length);
            }
            setPathCount(allPathsRef.current.length);
          }
          setHasPath(allPathsRef.current.length > 0);
        }
        isDrawingRef.current = false;
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (isDrawingMode && e.button === 0) {
        isDrawingRef.current = true;
        drawingPathRef.current = [];
        currentPolylineRef.current = null;
        const latlng = getLatLngFromPixel(e.clientX, e.clientY, map);
        if (latlng) {
          addPointToPath(latlng, 0);
          map.dragging.disable();
        }
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isDrawingMode && isDrawingRef.current && e.buttons === 1) {
        const latlng = getLatLngFromPixel(e.clientX, e.clientY, map);
        if (latlng && drawingPathRef.current.length > 0) {
          addPointToPath(latlng, 3);
        }
      }
    };

    const handleMouseUp = () => {
      if (isDrawingMode && isDrawingRef.current && drawingPathRef.current.length > 0) {
        if (drawingPathRef.current.length >= 2) {
          allPathsRef.current.push([...drawingPathRef.current]);
          // currentPolylineRef에 인덱스 부여
          if (currentPolylineRef.current) {
            const idx = nextPolylineIndexRef.current++;
            const key = getPolylineKey(currentPolylineRef.current);
            polylineIndexMapRef.current[key] = idx;
            console.log('폴리라인 그리기 완료 - 키:', key, '인덱스:', idx, '전체 경로 수:', allPathsRef.current.length);
          }
          setPathCount(allPathsRef.current.length);
        }
        setHasPath(allPathsRef.current.length > 0);
      }
      isDrawingRef.current = false;
    };

    const mapDiv = mapRef.current;
    if (!mapDiv) {
      return () => {};
    }

    mapDiv.addEventListener('touchstart', handleTouchStart, { passive: false });
    mapDiv.addEventListener('touchmove', handleTouchMove, { passive: false });
    mapDiv.addEventListener('touchend', handleTouchEnd);
    mapDiv.addEventListener('mousedown', handleMouseDown);
    mapDiv.addEventListener('mousemove', handleMouseMove);
    mapDiv.addEventListener('mouseup', handleMouseUp);
    mapDiv.addEventListener('mouseleave', handleMouseUp);

    return () => {
      if (mapDiv) {
        mapDiv.removeEventListener('touchstart', handleTouchStart);
        mapDiv.removeEventListener('touchmove', handleTouchMove);
        mapDiv.removeEventListener('touchend', handleTouchEnd);
        mapDiv.removeEventListener('mousedown', handleMouseDown);
        mapDiv.removeEventListener('mousemove', handleMouseMove);
        mapDiv.removeEventListener('mouseup', handleMouseUp);
        mapDiv.removeEventListener('mouseleave', handleMouseUp);
      }

      isDrawingRef.current = false;

      if (map && !isDrawingMode) {
        try {
          const container = map.getContainer();
          if (container && container.parentElement && container.offsetParent) {
            map.dragging.enable();
          }
        } catch (error) {
          console.warn('지도 드래그 활성화 오류:', error);
        }
      }
    };
  };

  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const cleanup = setupDrawing(mapInstanceRef.current);
    return () => {
      if (cleanup) cleanup();
    };
  }, [isDrawingMode]);

  const handleConfirm = () => {
    if (allPathsRef.current.length === 0) {
      alert('경로를 그려주세요.');
      return;
    }

    const allCoordinates = allPathsRef.current.flat();
    localStorage.setItem('runningRoute', JSON.stringify(allCoordinates));
    history.push('/tabs/running');
  };

  const handleStartDrawing = () => {
    setIsDrawingMode(true);
    isDrawingRef.current = false;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.dragging.disable();

      // 기존 폴리라인 정리 (중복 방지)
      // 제거되는 폴리라인의 인덱스 맵도 정리
      polylinesRef.current.forEach(polyline => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.removeLayer(polyline);
        }
        // 인덱스 맵에서도 제거
        const key = getPolylineKey(polyline);
        delete polylineIndexMapRef.current[key];
      });
      polylinesRef.current = [];

      // 기존 경로 다시 그리기 (인덱스 부여)
      if (allPathsRef.current.length > 0) {
        // 기존 인덱스 맵에서 최대값 찾기 (인덱스 연속성 유지)
        const existingIndices = Object.values(polylineIndexMapRef.current);
        const maxExistingIndex = existingIndices.length > 0 ? Math.max(...existingIndices) : -1;
        // nextPolylineIndexRef를 기존 경로 수로 설정 (기존 경로는 0부터 시작)
        nextPolylineIndexRef.current = Math.max(allPathsRef.current.length, maxExistingIndex + 1);
        
        allPathsRef.current.forEach((path, index) => {
          const leafletPath = path.map(
            (point) => [point.lat, point.lng] as [number, number]
          );
          const polyline = L.polyline(leafletPath, {
            color: '#FF0000',
            weight: 4,
            opacity: 1
          }).addTo(mapInstanceRef.current!);
          polylinesRef.current.push(polyline);
          // 인덱스 부여: allPathsRef의 인덱스와 동기화 (0, 1, 2, ...)
          const key = getPolylineKey(polyline);
          polylineIndexMapRef.current[key] = index;
          console.log('기존 경로 다시 그리기 - 키:', key, '인덱스:', index, '전체 경로 수:', allPathsRef.current.length);
        });
        // 다음 인덱스는 기존 경로 수로 설정
        nextPolylineIndexRef.current = allPathsRef.current.length;
        // pathCount 동기화
        setPathCount(allPathsRef.current.length);
      } else {
        // 경로가 없으면 인덱스도 0으로 초기화
        nextPolylineIndexRef.current = 0;
        setPathCount(0);
      }
    }

    setHasPath(allPathsRef.current.length > 0);
  };

  const handleStopDrawing = () => {
    setIsDrawingMode(false);

    if (isDrawingRef.current && drawingPathRef.current.length >= 2) {
      allPathsRef.current.push([...drawingPathRef.current]);
      // currentPolylineRef에 인덱스 부여
      if (currentPolylineRef.current) {
        const idx = nextPolylineIndexRef.current++;
        const key = getPolylineKey(currentPolylineRef.current);
        polylineIndexMapRef.current[key] = idx;
      }
      setPathCount(allPathsRef.current.length);
    }
    isDrawingRef.current = false;
    drawingPathRef.current = [];
    currentPolylineRef.current = null;
    
    setHasPath(allPathsRef.current.length > 0);

    setTimeout(() => {
      if (mapInstanceRef.current) {
        try {
          const container = mapInstanceRef.current.getContainer();
          if (container && container.parentElement && container.offsetParent) {
            mapInstanceRef.current.dragging.enable();
          }
        } catch (error) {
          console.warn('지도 드래그 활성화 오류:', error);
        }
      }
    }, 100);
  };

  const handleUndoDrawing = () => {
    if (allPathsRef.current.length === 0) {
      return;
    }

    // allPathsRef의 마지막 항목 인덱스 (가장 최근에 그린 경로)
    const targetIndex = allPathsRef.current.length - 1;

    // 지도에서 해당 인덱스를 가진 폴리라인 찾기 (pop 전에)
    if (polylinesRef.current.length > 0 && mapInstanceRef.current) {
      // 디버깅: 인덱스 맵 상태 확인
      console.log('인덱스 맵:', polylineIndexMapRef.current);
      console.log('전체 polylinesRef 길이:', polylinesRef.current.length);
      console.log('allPathsRef 길이 (pop 전):', allPathsRef.current.length);
      console.log('제거할 타겟 인덱스:', targetIndex);
      
      // 타겟 인덱스와 일치하는 폴리라인 찾기
      let targetPolyline: L.Polyline | null = null;
      let targetPosition = -1;

      polylinesRef.current.forEach((polyline, index) => {
        const key = getPolylineKey(polyline);
        const idx = polylineIndexMapRef.current[key];
        console.log('폴리라인 키:', key, '인덱스:', idx);
        if (idx === targetIndex) {
          targetPolyline = polyline;
          targetPosition = index;
        }
      });

      // 타겟 인덱스를 가진 폴리라인 제거
      if (targetPolyline && targetPosition >= 0) {
        mapInstanceRef.current.removeLayer(targetPolyline);
        polylinesRef.current.splice(targetPosition, 1);
        const key = getPolylineKey(targetPolyline);
        delete polylineIndexMapRef.current[key];
        console.log('폴리라인 제거됨:', key, '인덱스:', targetIndex);
      } else {
        // 타겟 인덱스를 찾을 수 없는 경우: 가장 큰 인덱스를 가진 폴리라인 제거 (fallback)
        console.warn('타겟 인덱스를 가진 폴리라인을 찾을 수 없어 가장 큰 인덱스를 가진 폴리라인을 제거합니다.');
        let maxIndex = -1;
        let maxIndexPolyline: L.Polyline | null = null;
        let maxIndexPosition = -1;

        polylinesRef.current.forEach((polyline, index) => {
          const key = getPolylineKey(polyline);
          const idx = polylineIndexMapRef.current[key];
          if (idx !== undefined && idx > maxIndex) {
            maxIndex = idx;
            maxIndexPolyline = polyline;
            maxIndexPosition = index;
          }
        });

        if (maxIndexPolyline && maxIndexPosition >= 0) {
          mapInstanceRef.current.removeLayer(maxIndexPolyline);
          polylinesRef.current.splice(maxIndexPosition, 1);
          const key = getPolylineKey(maxIndexPolyline);
          delete polylineIndexMapRef.current[key];
          console.log('폴리라인 제거됨 (fallback):', key, '인덱스:', maxIndex);
        }
      }
    }

    // 완료된 경로 중 가장 최근에 그린 경로 제거 (최신 순서)
    allPathsRef.current.pop();
    // 현재 그리는 중인 경로도 초기화 (남은 데이터가 재사용되는 버그 방지)
    drawingPathRef.current = [];
    isDrawingRef.current = false;

    const newPathCount = allPathsRef.current.length;
    setPathCount(newPathCount);
    // hasPath는 그대로 유지 (버튼이 사라지지 않도록)
    // setHasPath는 호출하지 않음
  };

  // 러닝 종료 처리 (기존 길게 누르던 종료 버튼 기능을 단일 클릭으로 수행)
  const handleEndRun = async () => {
    // 종료 버튼 누른 횟수에 따라 광고 노출 여부 결정
      const endButtonCount = parseInt(localStorage.getItem('endButtonCount') || '0');
    const shouldShowAd = (endButtonCount + 1) % INTERSTITIAL_AD_FREQUENCY === 0;
      localStorage.setItem('endButtonCount', String(endButtonCount + 1));
      
    if (shouldShowAd && ENABLE_INTERSTITIAL_AD && Capacitor.isNativePlatform() && admobInitializedRef.current) {
        try {
          await AdMob.prepareInterstitial({
            adId: 'ca-app-pub-8432922669855664/9908264312',
            isTesting: false
          });
          
          const listener = await AdMob.addListener('interstitialAdDismissed' as any, () => {
            listener.remove();
            finishRun();
          });
          
          await AdMob.showInterstitial();
        } catch (error) {
          console.error('광고 표시 오류:', error);
          finishRun();
        }
      } else {
        finishRun();
      }
  };

  const fetchElevations = async (path: LatLng[]): Promise<number[]> => {
    // 최대 100개 샘플링 (OpenTopoData 배치 제한)
    const maxPoints = 100;
    const sampled: LatLng[] = [];
    if (path.length <= maxPoints) {
      sampled.push(...path);
    } else {
      const step = (path.length - 1) / (maxPoints - 1);
      for (let i = 0; i < maxPoints; i++) {
        sampled.push(path[Math.round(i * step)]);
      }
    }

    const locations = sampled.map(c => ({ latitude: c.lat, longitude: c.lng }));
    const res = await fetch('https://api.open-elevation.com/api/v1/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations }),
    });
    const data = await res.json();
    if (!data.results) throw new Error('고도 데이터 없음');
    return data.results.map((r: any) => Math.round(r.elevation ?? 0));
  };

  const saveRun = async (pathToSave?: LatLng[], label?: string) => {
    // 저장할 경로 결정: 실제 러닝 경로가 있으면 그것을, 없으면 그려진 폴리라인 사용
    const path = pathToSave || (runningPathRef.current.length > 0 ? runningPathRef.current : routePathRef.current);
    
    if (path.length === 0) {
      return;
    }

    // 거리 계산
    let distance = runningDistanceRef.current;
    if (distance === 0 && path.length > 1) {
      // 실제 러닝 거리가 없으면 경로 좌표로부터 거리 계산
      distance = 0;
      for (let i = 1; i < path.length; i++) {
        distance += getDistance(path[i - 1], path[i]);
      }
    }

    const totalTime = runningStartTimeRef.current > 0 
      ? Math.floor((Date.now() - runningStartTimeRef.current) / 1000) - pausedTimeRef.current
      : 0;
    const avgSpeed = totalTime > 0 ? (distance / 1000) / (totalTime / 3600) : 0;

    let elevations: number[] | undefined;
    try {
      elevations = await fetchElevations(path);
    } catch {
      elevations = undefined;
    }

    const savedRun: SavedRun = {
      id: `run_${Date.now()}`,
      date: new Date().toISOString(),
      distance: distance,
      time: totalTime,
      avgSpeed: avgSpeed,
      path: [...path],
      label: label && label.trim() ? label.trim() : undefined,
      elevations,
    };

    // localStorage에서 기존 기록 가져오기
    const savedRunsJson = localStorage.getItem('savedRuns');
    const savedRuns: SavedRun[] = savedRunsJson ? JSON.parse(savedRunsJson) : [];
    
    // 새 기록 추가
    savedRuns.push(savedRun);
    
    // localStorage에 저장
    localStorage.setItem('savedRuns', JSON.stringify(savedRuns));
  };

  const resetAfterFinish = () => {
    // 그린 폴리라인 전체 삭제
    polylinesRef.current.forEach(p => {
      if (mapInstanceRef.current) mapInstanceRef.current.removeLayer(p);
    });
    polylinesRef.current = [];
    polylineIndexMapRef.current = {};
    nextPolylineIndexRef.current = 0;
    currentPolylineRef.current = null;
    drawingPathRef.current = [];

    if (routePolylineRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(routePolylineRef.current);
      routePolylineRef.current = null;
    }
    if (runningPolylineRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(runningPolylineRef.current);
      runningPolylineRef.current = null;
    }
    routePathRef.current = [];
    runningPathRef.current = [];
    runningDistanceRef.current = 0;
    setRunningTime(0);
    setRunningDistance(0);
    setIsDrawingMode(false);
    allPathsRef.current = [];
    setPathCount(0);
    setHasPath(false);

    // 지도 드래그 복구
    setTimeout(() => {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.dragging.enable();
          mapInstanceRef.current.invalidateSize();
        } catch {}
      }
    }, 100);
  };

  const finishRun = () => {
    setIsRunning(false);
    isRunningRef.current = false;
    setIsPaused(false);
    
    // 위치 저장 확인 팝업 (실제 러닝 경로 또는 그려진 폴리라인이 있으면 저장 가능)
    const hasRunningPath = runningPathRef.current.length > 0;
    const hasRoutePath = routePathRef.current.length > 0;
    
    if (hasRunningPath || hasRoutePath) {
      setShowSaveConfirmAlert(true);
    } else {
      // 경로가 없어도 팝업 표시 (사용자에게 알림)
      setShowNoPathAlert(true);
    }
  };

  const handleSaveRoute = () => {
    const path = allPathsRef.current.flat();
    if (path.length < 2) return;
    let distanceM = 0;
    for (let i = 1; i < path.length; i++) distanceM += getDistance(path[i-1], path[i]);
    const label = window.prompt('루트 이름을 입력하세요 (선택):', '') ?? undefined;
    RouteStorage.save({
      id: `route_${Date.now()}`,
      date: new Date().toISOString(),
      label: label && label.trim() ? label.trim() : undefined,
      distanceM,
      path,
    });
    alert('루트가 저장되었습니다!');
  };

  const handleClear = () => {
    polylinesRef.current.forEach(polyline => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(polyline);
      }
    });
    polylinesRef.current = [];
    polylineIndexMapRef.current = {};
    nextPolylineIndexRef.current = 0;
    currentPolylineRef.current = null;
    drawingPathRef.current = [];
    allPathsRef.current = [];
    setPathCount(0);
    setHasPath(false);
  };

  const handleReset = () => {
    polylinesRef.current.forEach(polyline => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(polyline);
      }
    });
    polylinesRef.current = [];
    polylineIndexMapRef.current = {};
    nextPolylineIndexRef.current = 0;
    currentPolylineRef.current = null;
    
    if (routePolylineRef.current) {
      mapInstanceRef.current?.removeLayer(routePolylineRef.current);
      routePolylineRef.current = null;
    }
    drawingPathRef.current = [];
    allPathsRef.current = [];
    setPathCount(0);
    setHasPath(false);
    setIsRunning(false);
    isRunningRef.current = false;
    setIsPaused(false);
    routePathRef.current = [];
    
    runningDistanceRef.current = 0;
    runningPathRef.current = [];
    lastLocationRef.current = null;
    pausedTimeRef.current = 0;
    pauseStartTimeRef.current = 0;
    setRunningTime(0);
    setRunningDistance(0);
    
    if (runningPolylineRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(runningPolylineRef.current);
      runningPolylineRef.current = null;
    }
  };

  const handleGoToCurrentLocation = async () => {
    if (currentLocationRef.current && mapInstanceRef.current) {
      updateCurrentLocationMarker(currentLocationRef.current);
    } else {
      try {
        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 10000
        });

        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };

        currentLocationRef.current = location;
        updateCurrentLocationMarker(location);
      } catch {
        alert('현재 위치를 가져올 수 없습니다.');
      }
    }
  };

  const requestCompassPermission = async () => {
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const permissionState = await (DeviceOrientationEvent as any).requestPermission();
        if (permissionState === 'granted') {
          alert('나침반 권한이 허용되었습니다!');
        } else {
          alert('나침반 권한이 거부되었습니다.');
        }
      } catch (error) {
        console.error('나침반 권한 요청 오류:', error);
      }
    } else {
      alert('이 기기는 나침반 권한 요청이 필요하지 않습니다.');
    }
  };

  const handleSelectSavedRun = (run: SavedRun) => {
    if (!mapInstanceRef.current) return;

    // 기존에 표시된 경로 제거
    if (savedRoutePolylineRef.current) {
      mapInstanceRef.current.removeLayer(savedRoutePolylineRef.current);
      savedRoutePolylineRef.current = null;
    }

    // 기존 폴리라인들 모두 제거 (파란색 폴리라인 포함)
    if (routePolylineRef.current) {
      mapInstanceRef.current.removeLayer(routePolylineRef.current);
      routePolylineRef.current = null;
    }
    if (runningPolylineRef.current) {
      mapInstanceRef.current.removeLayer(runningPolylineRef.current);
      runningPolylineRef.current = null;
    }
    if (currentPolylineRef.current) {
      mapInstanceRef.current.removeLayer(currentPolylineRef.current);
      currentPolylineRef.current = null;
    }
    polylinesRef.current.forEach(polyline => {
      mapInstanceRef.current?.removeLayer(polyline);
    });
    polylinesRef.current = [];

    // 새 경로 표시
    if (run.path && run.path.length > 0) {
      const routePath = run.path.map(
        (point) => [point.lat, point.lng] as [number, number]
      );

      savedRoutePolylineRef.current = L.polyline(routePath, {
        color: '#ff6b6b',
        weight: 6,
        opacity: 0.8
      }).addTo(mapInstanceRef.current);

      // 지도 범위 조정
      try {
        mapInstanceRef.current.fitBounds(savedRoutePolylineRef.current.getBounds(), {
          padding: [50, 50]
        });
      } catch (error) {
        console.warn('지도 범위 조정 오류:', error);
      }
    }

    // 저장된 거리 표시 (상태 초기화 후 재설정으로 리렌더 보장)
    setIsShowingSavedRoute(false);
    setRouteTotalKm(null);

    setTimeout(() => {
      if (run.distance > 0) {
        setRouteTotalKm(run.distance / 1000);
      }
      setIsShowingSavedRoute(true);
    }, 0);

    setShowSavedRunsModal(false);
  };

  // Records 탭에서 선택한 경로 감지 (탭 전환 시마다 실행)
  useIonViewDidEnter(() => {
    // 러닝 종료 후 돌아왔을 때 지도 초기화
    if (localStorage.getItem('runningFinished')) {
      localStorage.removeItem('runningFinished');
      setIsRunning(false);
      isRunningRef.current = false;
      setIsPaused(false);
      setShowSaveConfirmAlert(false);
      setShowNoPathAlert(false);
      resetAfterFinish();
    }

    const raw = localStorage.getItem('selectedRun');
    if (raw) {
      localStorage.removeItem('selectedRun');
      try {
        const run: SavedRun = JSON.parse(raw);
        handleSelectSavedRun(run);
      } catch {}
    }

    const rawRoute = localStorage.getItem('selectedRoute');
    if (rawRoute) {
      localStorage.removeItem('selectedRoute');
      try {
        const route = JSON.parse(rawRoute);
        handleSelectSavedRun({ ...route, time: 0, avgSpeed: 0, distance: route.distanceM });
      } catch {}
    }
  });

  const handleEditLabel = (runId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // IonItem의 onClick 이벤트 전파 방지
    
    try {
      const runs = RunStorage.getAll();
      const run = runs.find((r) => r.id === runId);
      if (run) {
        const newLabel = window.prompt('라벨 이름을 입력하세요:', run.label || '');
        if (newLabel !== null) {
          RunStorage.updateLabel(runId, newLabel.trim() || undefined);
          setSavedRuns(RunStorage.getAll());
        }
      }
    } catch (error) {
      console.error('라벨 편집 오류:', error);
      alert('라벨 편집 중 오류가 발생했습니다.');
    }
  };

  const handleDeleteSavedRun = (runId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // IonItem의 onClick 이벤트 전파 방지
    
    if (window.confirm('이 러닝 기록을 삭제하시겠습니까?')) {
      try {
        RunStorage.delete(runId);
        setSavedRuns(RunStorage.getAll());
        
        // 만약 삭제된 항목이 현재 표시 중인 경로라면 제거
        if (savedRoutePolylineRef.current && mapInstanceRef.current) {
          mapInstanceRef.current.removeLayer(savedRoutePolylineRef.current);
          savedRoutePolylineRef.current = null;
          setIsShowingSavedRoute(false);
        }
      } catch (error) {
        console.error('러닝 기록 삭제 오류:', error);
        alert('삭제 중 오류가 발생했습니다.');
      }
    }
  };

  const handleCloseSavedRoute = () => {
    if (savedRoutePolylineRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(savedRoutePolylineRef.current);
      savedRoutePolylineRef.current = null;
    }
    setRouteTotalKm(null);
    setIsShowingSavedRoute(false);
    
    // 초기 상태로 복귀
    setIsDrawingMode(false);
    setHasPath(false);
    setPathCount(0);
    setIsRunning(false);
    setIsPaused(false);
    
    // 현재 위치로 지도 이동 (첫 화면과 동일한 줌 레벨 15)
    if (currentLocationRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.setView(
        [currentLocationRef.current.lat, currentLocationRef.current.lng],
        15
      );
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}시간 ${minutes}분 ${secs}초`;
    }
    return `${minutes}분 ${secs}초`;
  };

  // 🔽 배너 광고 on/off 에 따라 padding-bottom 조정
  const contentBottomPadding = ENABLE_BANNER_AD
    ? 'calc(50px + 60px + env(safe-area-inset-bottom))' // 광고(50) + 버튼(60)
    : 'calc(60px + env(safe-area-inset-bottom))';       // 버튼(60)만

  return (
    <IonPage>
      <NavMenu isOpen={showNavMenu} onClose={() => setShowNavMenu(false)} />
      <IonHeader
        translucent
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
          '--background': '#ffffff',
          '--border-width': '0px',
          height: 'auto',
          minHeight: 'auto',
          paddingTop: 'env(safe-area-inset-top)',
          backgroundColor: '#ffffff'
        } as React.CSSProperties}
      >
        <IonToolbar
          style={{
            '--background': '#ffffff',
            '--border-width': '0px',
            '--min-height': 'auto',
            '--height': 'auto',
            '--padding-top': '0px',
            '--padding-bottom': '0px',
            padding: '0px',
            height: 'auto',
            minHeight: 'auto',
            backgroundColor: '#ffffff'
          } as React.CSSProperties}
        >
          <div style={{ paddingLeft: 16, fontWeight: 700, fontSize: 18, color: '#1a1a1a' }}>
            러닝
          </div>
          <div slot="end">
            <IonButton fill="clear" onClick={() => setShowNavMenu(true)} style={{ '--color': '#4a4a4a' }}>
              <IonIcon icon={menuOutline} style={{ fontSize: '24px' }} />
            </IonButton>
          </div>
        </IonToolbar>
      </IonHeader>
      <IonContent 
        fullscreen
        style={{
          '--padding-top': '0px',
          '--padding-bottom': contentBottomPadding,
          '--padding-start': 'env(safe-area-inset-left)',
          '--padding-end': 'env(safe-area-inset-right)',
          '--background': '#ffffff',
          backgroundColor: '#ffffff',
          '--ion-background-color': '#ffffff'
        } as React.CSSProperties}
      >
        {/* 뒤로가기 광고 팝업 - 메인 페이지 위 오버레이 */}
        {showExitAdModal && (
          <>
            {/* 반투명 배경 */}
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                zIndex: 9999,
              }}
              onClick={() => setShowExitAdModal(false)}
            />
            {/* 팝업 컨텐츠 */}
            <div style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '40%',
              height: '40%',
              maxWidth: '400px',
              maxHeight: '400px',
              minWidth: '300px',
              minHeight: '300px',
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
              zIndex: 10000,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}>
              {/* 헤더 */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 20px',
                borderBottom: '1px solid #e0e0e0',
                flexShrink: 0
              }}>
              
              </div>
              {/* 본문 */}
              <div style={{ 
                padding: '20px', 
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                flex: 1,
                overflow: 'auto'
              }}>
                {ENABLE_INTERSTITIAL_AD && Capacitor.isNativePlatform() && admobInitializedRef.current ? (
                  <div style={{ width: '100%', height: '150px' }}>
                    {/* 실제 광고는 여기에 표시됩니다 */}
                    <p style={{ marginBottom: '20px' }}>광고 영역</p>
                  </div>
                ) : (
                  <div style={{ 
                    width: '100%', 
                    height: '150px', 
                    backgroundColor: '#f0f0f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '8px',
                    marginBottom: '20px'
                  }}>
                    <p style={{ color: '#666' }}>광고 영역 (Placeholder)</p>
                  </div>
                )}
                <p style={{ color: '#666', fontSize: '14px', marginTop: '10px' }}>
                  다시 한번 뒤로가기를 누르면 앱이 종료됩니다.
                </p>
                <IonButton
                  fill="clear"
                  onClick={() => setShowExitAdModal(false)}
                  style={{ '--padding-start': '8px', '--padding-end': '8px' } as React.CSSProperties}
                >
                  닫기
                </IonButton>
              </div>
            </div>
          </>
        )}



        <IonAlert
          isOpen={showSaveConfirmAlert}
          header="위치를 저장할까요?"
          message="현재 경로를 기록에 저장합니다."
          buttons={[
            {
              text: '취소',
              role: 'cancel',
              handler: () => {
                setShowSaveConfirmAlert(false);
                resetAfterFinish();
              },
            },
            {
              text: '저장',
              handler: async () => {
                setShowSaveConfirmAlert(false);
                await saveRun(undefined, undefined);
                resetAfterFinish();
              },
            },
          ]}
        />

        <IonAlert
          isOpen={showNoPathAlert}
          header="저장할 경로가 없습니다."
          message="지도에서 경로를 그리거나 러닝을 시작한 후에 다시 시도해주세요."
          buttons={[
            {
              text: '확인',
              role: 'cancel',
              handler: () => {
                setShowNoPathAlert(false);
                resetAfterFinish();
              },
            },
          ]}
          onDidDismiss={() => {
            if (showNoPathAlert) {
              setShowNoPathAlert(false);
              resetAfterFinish();
            }
          }}
        />
        <div ref={mapRef} className="map-container" />
        
        {isLoadingLocation && (
          <div className="location-loading">
            <IonSpinner name="crescent" />
            <span>위치 정보 가져오는 중...</span>
          </div>
        )}

        {locationError && (
          <div className="location-error">
            {locationError}
          </div>
        )}

        {(isRunning || isShowingSavedRoute) && routeTotalKm !== null && (
          <div style={{
            position: 'fixed',
            bottom: 'calc(80px + env(safe-area-inset-bottom) + 56px + 8px)',
            right: '16px',
            backgroundColor: 'rgba(0,0,0,0.65)',
            color: '#fff',
            padding: '6px 12px',
            borderRadius: '20px',
            fontSize: '13px',
            fontWeight: 'bold',
            zIndex: 8000,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}>
            🏃 {routeTotalKm.toFixed(2)} km
          </div>
        )}

        {isRunning && isPaused && (
          <div className="pause-indicator">
            ⏸ 일시정지 중
          </div>
        )}

        {!isLoadingLocation && !locationError && (
          <div className="map-fab-controls">
            <IonButton
              onClick={handleGoToCurrentLocation}
              style={{
                '--padding-start': '12px',
                '--padding-end': '12px'
              }}
            >
              📍
            </IonButton>
            {typeof (DeviceOrientationEvent as any).requestPermission === 'function' && (
              <IonButton
                onClick={requestCompassPermission}
                size="small"
                style={{
                  '--padding-start': '8px',
                  '--padding-end': '8px',
                  fontSize: '12px'
                }}
              >
                🧭
              </IonButton>
            )}
          </div>
        )}
      </IonContent>
      
      {/* 하단 버튼 바 - 현재위치 / 시작 / (오른쪽 컨트롤) */}
      <div style={{
        position: 'fixed',
        bottom: 'calc(80px + env(safe-area-inset-bottom))',
        left: 0,
        right: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        zIndex: 10000,
        pointerEvents: 'none',
      }}>
        {/* 현재위치 버튼 */}
        <IonButton
          onClick={handleGoToCurrentLocation}
          style={{ margin: 0, width: '56px', height: '56px', pointerEvents: 'auto' }}
        >
          <IonIcon icon={locate} size="large" />
        </IonButton>

        {/* 가운데 시작 버튼 - 기본 상태에서만 표시 */}
        {!isDrawingMode && !isRunning && !isShowingSavedRoute && (
          <IonButton
            onClick={() => {
              const route = allPathsRef.current.flat();
              localStorage.setItem('runningRoute', JSON.stringify(route));
              history.push('/tabs/running');
            }}
            style={{
              margin: 0,
              width: '72px',
              height: '72px',
              '--border-radius': '50%',
              '--background': '#4285f4',
              '--box-shadow': '0 4px 16px rgba(66,133,244,0.5)',
              pointerEvents: 'auto',
            }}
          >
            <IonIcon icon={locate} style={{ display: 'none' }} />
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>시작</span>
          </IonButton>
        )}

        {/* 오른쪽 여백 (MapControls와 균형) */}
        <div style={{ width: '56px' }} />
      </div>

      {/* 광고 영역 - 화면 최하단 고정 (ENABLE_BANNER_AD & 웹일 때만 placeholder)
          키보드가 올라와도 따라 올라가지 않도록 safe-area 기준 fixed 배치 */}
      {ENABLE_BANNER_AD && (
        <div
          className="ad-controls"
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 'env(safe-area-inset-bottom)',
            zIndex: 9000,
            pointerEvents: 'auto',
          }}
        >
          {!Capacitor.isNativePlatform() && (
            <div className="ad-placeholder">
              광고 영역
            </div>
          )}
        </div>
      )}
      
      {/* 버튼 영역 - 오른쪽에 고정 */}
      {showMapControls && (
        <MapControls
          isRunning={isRunning}
          isDrawingMode={isDrawingMode}
          isShowingSavedRoute={isShowingSavedRoute}
          canUndo={pathCount > 0}
          hasPath={hasPath}
          onStartDrawing={handleStartDrawing}
          onStopDrawing={handleStopDrawing}
          onUndoDrawing={handleUndoDrawing}
          onClear={handleClear}
          onConfirm={handleConfirm}
          onSaveRoute={handleSaveRoute}
          onEndRun={handleEndRun}
          onCloseSavedRoute={handleCloseSavedRoute}
        />
      )}

      {/* 저장된 러닝 기록 모달 */}
      <SavedRunsModal
        isOpen={showSavedRunsModal}
        runs={savedRuns}
        onClose={() => setShowSavedRunsModal(false)}
        onSelect={handleSelectSavedRun}
        onEditLabel={handleEditLabel}
        onDelete={handleDeleteSavedRun}
        formatDate={formatDate}
      />
    </IonPage>
  );
};

export default Map;

