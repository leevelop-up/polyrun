import React from 'react';
import type { DayWeather, WeatherKind } from '../api/geo';

const WEATHER_LABEL: Record<WeatherKind, string> = {
  clear: '맑음',
  partly: '구름 조금',
  cloudy: '흐림',
  fog: '안개',
  rain: '비',
  snow: '눈',
  thunder: '뇌우'
};

// 하늘 상태 아이콘 (선 굵기·모서리는 앱의 다른 아이콘과 맞춘다)
export const WeatherIcon: React.FC<{ kind: WeatherKind; size?: number; color?: string }> = ({ kind, size = 18, color = '#14162B' }) => {
  const sun = <><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></>;
  const cloud = <path d="M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.5A3.3 3.3 0 0 0 7 18z" />;
  const smallCloud = <path d="M6 15h9a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 6 9.5 2.8 2.8 0 0 0 6 15z" />;
  const body: Record<WeatherKind, React.ReactNode> = {
    clear: sun,
    partly: (
      <>
        <circle cx="8" cy="8" r="3" />
        <path d="M8 2v1.5M2 8h1.5M3.8 3.8l1 1M12.2 3.8l-1 1" />
        <path d="M9 20h8a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.4 1.3A2.9 2.9 0 0 0 9 20z" />
      </>
    ),
    cloudy: cloud,
    fog: <>{smallCloud}<path d="M4 19h16M7 22h10" /></>,
    rain: <>{smallCloud}<path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3" /></>,
    snow: <>{smallCloud}<path d="M8 19h.01M12 21h.01M16 19h.01" strokeWidth={3.4} /></>,
    thunder: <>{smallCloud}<path d="M12 15l-2 4h4l-2 4" /></>
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {body[kind]}
    </svg>
  );
};

// "맑음 22° / 15°", 비·눈이 오는 날은 "· 비 4mm"
const WeatherBadge: React.FC<{ w: DayWeather; color?: string; size?: number }> = ({ w, color = '#14162B', size = 12 }) => {
  const wet = w.rain >= 1 && (w.kind === 'rain' || w.kind === 'snow' || w.kind === 'thunder');
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color, fontSize: size, fontWeight: 700, whiteSpace: 'nowrap' }}>
      <WeatherIcon kind={w.kind} size={size + 6} color={color} />
      {WEATHER_LABEL[w.kind]}
      <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 500 }}>
        {w.max}° / {w.min}°{wet ? ' · ' + Math.round(w.rain) + 'mm' : ''}
      </span>
    </span>
  );
};

export default WeatherBadge;
