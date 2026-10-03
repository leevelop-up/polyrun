// 앱 아이콘·스플래시 원본을 resources/ 에 만든다.
// 실행: node scripts/generate-brand-assets.mjs  →  npx capacitor-assets generate
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const INK = '#14162B';
const PAPER = '#F4F1EA';
const ACCENT = '#FFD84A';
const BLUE = '#2F3CF0';
const CORAL = '#FF5A3C';
const GREEN = '#7BD4A0';

// 1024 좌표계 기준 로고: 캘린더 카드 + 점선 경로 + 핀
function logo(shadow = INK, line = INK) {
  return `
  <rect x="264" y="294" width="560" height="520" rx="48" fill="${shadow}"/>
  <rect x="232" y="262" width="560" height="520" rx="48" fill="${PAPER}"/>
  <path d="M232 412 V310 a48 48 0 0 1 48 -48 H744 a48 48 0 0 1 48 48 V412 Z" fill="${BLUE}"/>
  <rect x="232" y="262" width="560" height="520" rx="48" fill="none" stroke="${line}" stroke-width="28"/>
  <line x1="232" y1="412" x2="792" y2="412" stroke="${INK}" stroke-width="28"/>
  <rect x="326" y="206" width="52" height="120" rx="26" fill="${line}"/>
  <rect x="646" y="206" width="52" height="120" rx="26" fill="${line}"/>
  <circle cx="352" cy="337" r="14" fill="${ACCENT}"/>
  <circle cx="672" cy="337" r="14" fill="${ACCENT}"/>
  <path d="M384 646 C 430 590, 480 680, 548 610" fill="none" stroke="${INK}" stroke-width="22" stroke-linecap="round" stroke-dasharray="1 42"/>
  <circle cx="336" cy="684" r="36" fill="${CORAL}" stroke="${INK}" stroke-width="16"/>
  <path d="M650 720 C 610 672, 556 622, 556 560 A 94 94 0 1 1 744 560 C 744 622, 690 672, 650 720 Z" fill="${INK}"/>
  <circle cx="650" cy="558" r="38" fill="${ACCENT}"/>`;
}

const svg = (w, h, body) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`);

// 로고를 (cx, cy) 중심, scale 배로 배치
const place = (cx, cy, scale, inner) =>
  `<g transform="translate(${cx} ${cy}) scale(${scale}) translate(-512 -520)">${inner}</g>`;

function splash(dark) {
  const S = 2732;
  const bg = dark ? INK : PAPER;
  const dot = dark ? '#2A2D4A' : '#E2DDD0';
  const chipStroke = dark ? PAPER : INK;
  const chips = [CORAL, ACCENT, GREEN, dark ? PAPER : INK, BLUE]
    .map((c, i) => `<rect x="${S / 2 - 290 + i * 120}" y="1880" width="80" height="80" rx="18" fill="${c}" stroke="${chipStroke}" stroke-width="10"/>`)
    .join('');
  return svg(S, S, `
    <defs><pattern id="g" width="64" height="64" patternUnits="userSpaceOnUse"><circle cx="32" cy="32" r="4" fill="${dot}"/></pattern></defs>
    <rect width="${S}" height="${S}" fill="${bg}"/>
    <rect width="${S}" height="${S}" fill="url(#g)"/>
    ${place(S / 2, 1300, 1.25, logo(dark ? ACCENT : INK, dark ? PAPER : INK))}
    ${chips}`);
}

const out = 'resources';
mkdirSync(out, { recursive: true });
const png = (buf, file) => sharp(buf).png().toFile(`${out}/${file}`);

await Promise.all([
  png(svg(1024, 1024, `<rect width="1024" height="1024" fill="${ACCENT}"/>${place(512, 512, 1.12, logo())}`), 'icon-only.png'),
  png(svg(1024, 1024, `<rect width="1024" height="1024" fill="${ACCENT}"/>${place(512, 512, 1.12, logo())}`), 'icon.png'),
  // 안드로이드 adaptive 아이콘: 가운데 66% 안전 영역에 맞춰 축소
  png(svg(1024, 1024, place(512, 512, 0.72, logo())), 'icon-foreground.png'),
  png(svg(1024, 1024, `<rect width="1024" height="1024" fill="${ACCENT}"/>`), 'icon-background.png'),
  png(splash(false), 'splash.png'),
  png(splash(true), 'splash-dark.png')
]);
console.log('resources/ 에 아이콘·스플래시 생성 완료');
