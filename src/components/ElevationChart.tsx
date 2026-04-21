interface ElevationChartProps {
  elevations: number[];
  distanceM: number;
}

const ElevationChart: React.FC<ElevationChartProps> = ({ elevations }) => {
  const width = 120;
  const height = 36;
  const padX = 2;
  const padY = 2;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;

  const minEl = Math.min(...elevations);
  const maxEl = Math.max(...elevations);
  const range = maxEl - minEl || 1;

  const pts = elevations.map((el, i) => [
    padX + (i / (elevations.length - 1)) * chartW,
    padY + chartH - ((el - minEl) / range) * chartH,
  ]);

  // Catmull-Rom → cubic bezier 변환으로 부드러운 곡선
  const tension = 0.4;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];
    const cp1x = p1[0] + (p2[0] - p0[0]) * tension;
    const cp1y = p1[1] + (p2[1] - p0[1]) * tension;
    const cp2x = p2[0] - (p3[0] - p1[0]) * tension;
    const cp2y = p2[1] - (p3[1] - p1[1]) * tension;
    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
  }

  const areaPath = d + ` L${pts[pts.length - 1][0]},${padY + chartH} L${pts[0][0]},${padY + chartH} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <path d={areaPath} fill="#4285f420" />
      <path d={d} fill="none" stroke="#4285f4" strokeWidth="1.5" />
    </svg>
  );
};

export default ElevationChart;
