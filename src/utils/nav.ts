// 이동 중 화면의 위치 계산: GPS 위치를 실제 길 선 위에 올려 얼마나 왔는지 구한다.

export type LatLng = { lat: number; lng: number };
type Pt = [number, number]; // [lat, lng]

// 두 지점 사이 거리(m)
export const distM = (a: LatLng, b: LatLng): number => {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
};

// 남은 거리 표시: 380 -> "380m", 1240 -> "1.2km"
export const fmtKm = (m: number): string => (m < 1000 ? Math.round(m / 10) * 10 + 'm' : (m / 1000).toFixed(1) + 'km');

const ll = (p: Pt): LatLng => ({ lat: p[0], lng: p[1] });

// 선의 시작점부터 각 꼭짓점까지 누적 거리(m)
export const cumulative = (path: Pt[]): number[] => {
  const out = [0];
  for (let i = 1; i < path.length; i++) out.push(out[i - 1] + distM(ll(path[i - 1]), ll(path[i])));
  return out;
};

// p 에서 가장 가까운 선 위 지점: along = 시작점부터 그 지점까지 거리(m), off = p 와 선 사이 거리(m)
export const project = (path: Pt[], cum: number[], p: LatLng): { along: number; off: number } => {
  if (path.length < 2) return { along: 0, off: path.length ? distM(p, ll(path[0])) : Infinity };
  // p 주변을 평면으로 보고 계산 (구간이 짧아 오차가 작다)
  const kx = 111320 * Math.cos((p.lat * Math.PI) / 180);
  const ky = 110540;
  let best = { along: 0, off: Infinity };
  for (let i = 1; i < path.length; i++) {
    const ax = (path[i - 1][1] - p.lng) * kx;
    const ay = (path[i - 1][0] - p.lat) * ky;
    const bx = (path[i][1] - p.lng) * kx;
    const by = (path[i][0] - p.lat) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const off = Math.hypot(ax + dx * t, ay + dy * t);
    if (off < best.off) best = { along: cum[i - 1] + (cum[i] - cum[i - 1]) * t, off };
  }
  return best;
};

// 시작점부터 along(m) 만큼 간 선 위 지점. east: 그 구간이 동쪽(오른쪽)으로 가는지 (사람 아이콘 방향)
export const pointAt = (path: Pt[], cum: number[], along: number): LatLng & { east: boolean } => {
  if (path.length === 1) return { ...ll(path[0]), east: true };
  let i = 1;
  while (i < path.length - 1 && cum[i] < along) i++;
  const seg = cum[i] - cum[i - 1];
  const t = seg > 0 ? Math.max(0, Math.min(1, (along - cum[i - 1]) / seg)) : 0;
  const a = path[i - 1];
  const b = path[i];
  return { lat: a[0] + (b[0] - a[0]) * t, lng: a[1] + (b[1] - a[1]) * t, east: b[1] >= a[1] };
};
