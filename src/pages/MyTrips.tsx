import React, { useRef, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { useTrip } from '../context/TripContext';
import { INK, PAPER } from '../theme/palette';
import { backupJson, fmtWon, parseBackup, RETENTION_DAYS, spentOf, tripExpiresAt, tripStatus } from '../utils/trip';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const isNative = Capacitor.isNativePlatform();

// 백업 파일 저장. 앱: 파일을 만든 뒤 공유 창(드라이브·카톡·내 파일 등에 저장),
// 웹: 공유 시트(모바일 브라우저)가 되면 그걸로, 아니면 파일 다운로드.
// (앱의 WebView 는 웹 공유·다운로드를 지원하지 않아 아무 일도 일어나지 않았다)
async function saveBackup(text: string): Promise<void> {
  const d = new Date();
  const name = 'polyrun-backup-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.json';
  if (isNative) {
    const { uri } = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    try {
      await Share.share({ title: '여행 일정 백업', dialogTitle: '백업 파일 저장', files: [uri] });
    } catch (e) {
      // 공유 창을 그냥 닫은 경우
      if (/cancel/i.test((e as Error).message || '')) return;
      throw e;
    }
    return;
  }
  const file = new File([text], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: '여행 일정 백업' });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function dRange(trip: { startDate: number | null; endDate: number | null }): string {
  if (!trip.startDate) return '일정 작성 중';
  const s = new Date(trip.startDate);
  const e = trip.endDate ? new Date(trip.endDate) : null;
  const fmt = (d: Date) => String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
  return e ? fmt(s) + ' – ' + fmt(e) : fmt(s);
}

function nights(trip: { startDate: number | null; endDate: number | null }): number {
  if (!trip.startDate || !trip.endDate) return 0;
  return Math.round((trip.endDate - trip.startDate) / 86400000);
}

const MyTrips: React.FC = () => {
  const history = useHistory();
  const { trips, deleteTrip, setActiveTrip, setKeep, importTrips } = useTrip();
  const [notice, setNotice] = useState(true);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fileRef = useRef<HTMLInputElement>(null);

  const showToast = (text: string) => {
    clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    const parsed = parseBackup(await file.text());
    if (!parsed) {
      showToast('백업 파일을 읽지 못했어요');
      return;
    }
    const n = importTrips(parsed);
    showToast(n ? '일정 ' + n + '개를 불러왔어요' : '새로 불러올 일정이 없어요 (이미 있어요)');
  };

  const target = trips.find((t) => t.id === confirmId);

  const openTrip = (id: string) => {
    setActiveTrip(id);
    history.push('/itinerary');
  };

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 390, height: 'calc(100vh - var(--ad-h, 0px))', maxHeight: 844, margin: '0 auto', boxSizing: 'border-box', background: PAPER, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ background: '#2F3CF0', borderBottom: '2px solid #14162B', padding: '14px 20px 22px', display: 'flex', flexDirection: 'column', gap: 12, color: '#FFFFFF' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: -10 }}>
          <button type="button" aria-label="뒤로" onClick={() => history.push('/main')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, border: 0, background: 'transparent', cursor: 'pointer' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="square" aria-hidden="true">
              <path d="M20 12H4M11 5l-7 7 7 7" />
            </svg>
          </button>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, letterSpacing: '0.12em' }}>MY TRIPS</div>
        </div>
        <h1 style={{ margin: 0, fontFamily: "'Black Han Sans', sans-serif", fontSize: 38, lineHeight: 1.1, fontWeight: 400 }}>내 일정</h1>
      </div>

      <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20, padding: '24px 24px 0 20px' }}>
        {notice && (
          <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 48px 12px 14px', border: '2px solid #14162B', borderRadius: 10, background: '#FFD84A' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#14162B" strokeWidth={2.4} strokeLinecap="square" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            <div style={{ fontSize: 13, lineHeight: 1.5, fontWeight: 500 }}>
              <b>여행이 끝나고 {RETENTION_DAYS}일 뒤 삭제돼요</b>
              <br />
              남기고 싶은 여행은 '보관'하거나 아래에서 백업해 두세요.
            </div>
            <button type="button" aria-label="안내 닫기" onClick={() => setNotice(false)} style={{ position: 'absolute', right: 0, top: 0, width: 44, height: 44, border: 0, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#14162B" strokeWidth={2.6} strokeLinecap="square" aria-hidden="true">
                <path d="M5 5l14 14M19 5L5 19" />
              </svg>
            </button>
          </div>
        )}

        {trips.map((t) => {
          const placeCount = t.days.reduce((s, d) => s + d.length, 0);
          const n = nights(t);
          const status = tripStatus(t);
          const expiresAt = tripExpiresAt(t);
          const daysLeft = Math.max(0, Math.ceil((expiresAt - Date.now()) / 86400000));
          const delDate = new Date(expiresAt);
          const info = t.startDate ? n + '박 ' + (n + 1) + '일 · ' + placeCount + '개 장소' : '장소를 추가해 보세요';
          // 가장 크게: 출발까지 남은 날 / 여행 중 / 다녀옴
          const badge =
            status.kind === 'before' ? { text: 'D-' + status.dDay, bg: '#FFD84A', fg: INK }
            : status.kind === 'during' ? { text: '여행 중 · ' + status.day + '일차', bg: '#2F3CF0', fg: '#FFFFFF' }
            : status.kind === 'after' ? { text: '다녀옴', bg: '#FFFFFF', fg: INK }
            : null;
          // 삭제 안내는 여행이 끝난 뒤에만 작게 (여행 전·중에는 지워지지 않음)
          const delNote = t.keep ? '보관 중 · 자동 삭제 안 함' : status.kind === 'after' ? delDate.getMonth() + 1 + '.' + delDate.getDate() + ' 삭제 예정' + (daysLeft === 0 ? ' · 오늘' : ' · D-' + daysLeft) : null;
          return (
            <div key={t.id} style={{ position: 'relative' }}>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  openTrip(t.id);
                }}
                style={{ display: 'block', textDecoration: 'none', color: INK, position: 'relative', overflow: 'hidden', background: '#FFFFFF', border: '2px solid #14162B', borderRadius: 10, boxShadow: '4px 4px 0 #14162B' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '14px 56px 10px 18px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: '0.12em', color: '#4A4D66' }}>{dRange(t)}</div>
                    <div style={{ fontFamily: "'Black Han Sans', sans-serif", fontSize: 30, lineHeight: 1.15, color: '#2F3CF0' }}>{t.destination}</div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 500, color: spentOf(t) ? INK : '#8A8CA3' }}>총 사용 금액 {fmtWon(spentOf(t))}</div>
                  </div>
                </div>
                <div style={{ position: 'relative', height: 16 }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, width: 16, height: 16, marginLeft: -10, boxSizing: 'border-box', border: '2px solid #14162B', borderRadius: 8, background: PAPER }} />
                  <div style={{ position: 'absolute', right: 0, top: 0, width: 16, height: 16, marginRight: -10, boxSizing: 'border-box', border: '2px solid #14162B', borderRadius: 8, background: PAPER }} />
                  <div style={{ position: 'absolute', left: 14, right: 14, top: 7, borderTop: '2px dashed #14162B' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 14px 12px 18px' }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{info}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                    {badge && <div style={{ padding: '3px 10px', border: '2px solid #14162B', borderRadius: 6, background: badge.bg, color: badge.fg, fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 500, whiteSpace: 'nowrap' }}>{badge.text}</div>}
                    {delNote && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: !t.keep && daysLeft <= 5 ? '#D63A2F' : '#4A4D66', fontWeight: !t.keep && daysLeft <= 5 ? 700 : 400 }}>{delNote}</div>}
                  </div>
                </div>
              </a>
              <button
                type="button"
                aria-label={t.destination + ' 일정 삭제'}
                onClick={() => setConfirmId(t.id)}
                style={{ position: 'absolute', right: 4, top: 4, width: 44, height: 44, border: 0, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#14162B" strokeWidth={2.4} strokeLinecap="square" aria-hidden="true">
                  <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
                </svg>
              </button>
              {(status.kind === 'after' || t.keep) && (
                <button
                  type="button"
                  aria-pressed={!!t.keep}
                  onClick={() => {
                    setKeep(t.id, !t.keep);
                    showToast(t.keep ? '보관을 풀었어요. 끝난 지 ' + RETENTION_DAYS + '일이 지나면 삭제돼요' : "'" + t.destination + "' 일정을 보관했어요");
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, marginTop: 10, padding: '0 12px', border: '2px solid #14162B', borderRadius: 8, background: t.keep ? '#14162B' : '#FFFFFF', color: t.keep ? '#FFD84A' : INK, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="square" aria-hidden="true">
                    <path d="M6 3h12v18l-6-4-6 4z" />
                  </svg>
                  {t.keep ? '보관 중 (누르면 해제)' : '보관하기 · 자동 삭제 안 함'}
                </button>
              )}
            </div>
          );
        })}

        {trips.length === 0 && (
          <div style={{ border: '2px dashed #14162B', borderRadius: 10, padding: '32px 16px', textAlign: 'center', fontSize: 14, color: '#4A4D66' }}>저장된 일정이 없어요</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 20 }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: '0.12em', color: '#4A4D66' }}>BACKUP · 백업</div>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: '#4A4D66' }}>일정은 이 기기(브라우저)에만 저장돼요. 기기를 바꾸거나 앱 데이터를 지우기 전에 파일로 받아 두세요.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            <button
              type="button"
              disabled={trips.length === 0}
              onClick={() => saveBackup(backupJson(trips)).catch(() => showToast('백업 파일을 저장하지 못했어요'))}
              style={{ height: 48, border: '2px dashed #14162B', borderRadius: 8, background: '#FFFFFF', color: INK, fontSize: 14, fontWeight: 700, cursor: trips.length ? 'pointer' : 'default', opacity: trips.length ? 1 : 0.4 }}
            >
              백업 파일 저장
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} style={{ height: 48, border: '2px dashed #14162B', borderRadius: 8, background: '#FFFFFF', color: INK, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              백업 불러오기
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept={isNative ? undefined : 'application/json,.json'}
            aria-label="백업 파일 선택"
            style={{ display: 'none' }}
            onChange={(e) => {
              onImport(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => history.push('/main')}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 56, margin: '0 20px 20px', border: '2px solid #14162B', borderRadius: 10, background: INK, boxShadow: '4px 4px 0 #FFD84A', color: '#FFD84A', fontFamily: "'Black Han Sans', sans-serif", fontSize: 20, cursor: 'pointer' }}
      >
        새 일정 만들기
      </button>

      {toast && (
        <div role="status" style={{ position: 'absolute', left: 20, right: 20, bottom: 92, padding: '12px 16px', border: '2px solid #14162B', borderRadius: 10, background: INK, boxShadow: '4px 4px 0 #FFD84A', color: '#FFFFFF', fontSize: 14, fontWeight: 700 }}>{toast}</div>
      )}

      {target && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, background: 'rgba(20,22,43,0.5)', display: 'flex', alignItems: 'flex-end' }}>
          <div role="dialog" aria-label="일정 삭제" style={{ width: '100%', boxSizing: 'border-box', background: PAPER, borderTop: '2px solid #14162B', padding: '24px 20px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontFamily: "'Black Han Sans', sans-serif", fontSize: 24 }}>{target.destination} 일정을 삭제할까요?</div>
              <div style={{ fontSize: 13, lineHeight: 1.5, color: '#4A4D66' }}>삭제하면 되돌릴 수 없어요.</div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => setConfirmId(null)} style={{ flex: 1, height: 52, border: '2px solid #14162B', borderRadius: 10, background: '#FFFFFF', fontFamily: "'Noto Sans KR', sans-serif", fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>취소</button>
              <button
                type="button"
                onClick={() => {
                  if (confirmId) deleteTrip(confirmId);
                  setConfirmId(null);
                }}
                style={{ flex: 1, height: 52, border: '2px solid #14162B', borderRadius: 10, background: '#FF5A3C', boxShadow: '3px 3px 0 #14162B', fontFamily: "'Noto Sans KR', sans-serif", fontSize: 16, fontWeight: 700, cursor: 'pointer' }}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyTrips;
