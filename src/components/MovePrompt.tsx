import React, { useState } from 'react';
import { useHistory } from 'react-router-dom';
import { useNav } from '../context/NavContext';
import { INK } from '../theme/palette';
import Walker from './Walker';

// 이동을 감지했을 때 어느 화면에서든 아래에서 올라오는 "이동을 기록할까요?" 안내
const MovePrompt: React.FC = () => {
  const history = useHistory();
  const { movePrompt, acceptMove, declineMove } = useNav();
  const [error, setError] = useState<string | null>(null);
  if (!movePrompt && !error) return null;

  const accept = async () => {
    try {
      const p = await acceptMove();
      if (p) history.push('/map?day=' + p.day);
    } catch {
      setError('위치 권한을 허용해야 이동을 기록할 수 있어요');
      setTimeout(() => setError(null), 4000);
    }
  };

  return (
    <div role="dialog" aria-label="이동 기록" style={{ position: 'fixed', left: 0, right: 0, bottom: 'var(--ad-h, 0px)', zIndex: 3000, display: 'flex', justifyContent: 'center', padding: '0 12px calc(12px + env(safe-area-inset-bottom))', pointerEvents: 'none' }}>
      <div style={{ width: '100%', maxWidth: 366, boxSizing: 'border-box', border: '2px solid #14162B', borderRadius: 12, background: '#FFFFFF', boxShadow: '4px 4px 0 #14162B', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12, pointerEvents: 'auto' }}>
        {error ? (
          <div style={{ fontSize: 14, fontWeight: 700, color: '#FF5A3C' }}>{error}</div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Walker size={30} mood="walking" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontFamily: "'Black Han Sans', sans-serif", fontSize: 18 }}>이동 중이신가요?</div>
                <div style={{ fontSize: 13, color: '#4A4D66' }}>이동을 기록하고 다음 장소까지 안내할까요?</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={accept} style={{ flexGrow: 1, height: 46, border: '2px solid #14162B', borderRadius: 8, background: INK, boxShadow: '3px 3px 0 #FFD84A', color: '#FFD84A', fontFamily: "'Black Han Sans', sans-serif", fontSize: 16, cursor: 'pointer' }}>
                기록 시작
              </button>
              <button type="button" onClick={declineMove} style={{ height: 46, padding: '0 18px', border: '2px solid #14162B', borderRadius: 8, background: '#FFFFFF', color: INK, fontFamily: "'Black Han Sans', sans-serif", fontSize: 16, cursor: 'pointer' }}>
                아니요
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default MovePrompt;
