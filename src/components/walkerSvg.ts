import { ACCENT, BLUE, INK } from '../theme/palette';
import '../theme/walker.css';

// 이동 안내에 쓰는 걷는 사람 (배낭을 멘 여행자). 지도 마커(문자열)와 화면(React) 양쪽에서 쓴다.
// mood: walking 걷는 중, idle 서 있음, cheer 도착해서 폴짝
export type WalkerMood = 'walking' | 'idle' | 'cheer';

export const walkerSvg = (size: number): string => `
<svg width="${size}" height="${size * 1.2}" viewBox="0 0 40 48" aria-hidden="true">
  <ellipse cx="20" cy="45" rx="9" ry="2.5" fill="${INK}" opacity="0.22"/>
  <g class="w-body">
    <line class="w-leg-b" x1="19" y1="30" x2="19" y2="42" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>
    <line class="w-arm-b" x1="20" y1="19" x2="20" y2="27" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
    <rect x="9.5" y="17.5" width="7" height="11" rx="2.5" fill="#FF5A3C" stroke="${INK}" stroke-width="2"/>
    <rect x="14" y="15.5" width="12" height="16" rx="5" fill="${BLUE}" stroke="${INK}" stroke-width="2"/>
    <line class="w-leg-a" x1="21" y1="30" x2="21" y2="42" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>
    <line class="w-arm-a" x1="20" y1="19" x2="20" y2="27" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
    <circle cx="20" cy="9" r="7" fill="${ACCENT}" stroke="${INK}" stroke-width="2"/>
    <circle cx="23.2" cy="8.3" r="1.3" fill="${INK}"/>
  </g>
</svg>`;

export const walkerClass = (mood: WalkerMood, west = false) => 'walker ' + mood + (west ? ' west' : '');
