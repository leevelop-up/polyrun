import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';

// 키패드가 올라오면: <body> 에 kb-open 을 붙여 하단 고정 버튼(.hide-on-kb)을 숨기고,
// 입력 중인 칸을 화면 가운데로 스크롤한다 (화면이 키패드 위로 줄어들면서 칸이 가려지지 않게).
// 광고 배너는 AdBanner 가 같은 표시(kb-open)를 보고 숨긴다.
export const KB_EVENT = 'runtrip-keyboard';

const KeyboardAware: React.FC = () => {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const set = (open: boolean) => {
      document.body.classList.toggle('kb-open', open);
      window.dispatchEvent(new CustomEvent(KB_EVENT, { detail: open }));
    };
    const focusIntoView = () => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
    const handles = [
      Keyboard.addListener('keyboardWillShow', () => set(true)),
      // 화면 크기가 바뀐 뒤에 스크롤해야 정확하다
      Keyboard.addListener('keyboardDidShow', () => setTimeout(focusIntoView, 50)),
      Keyboard.addListener('keyboardWillHide', () => set(false))
    ];
    return () => {
      handles.forEach((h) => h.then((x) => x.remove()));
      set(false);
    };
  }, []);
  return null;
};

export default KeyboardAware;
