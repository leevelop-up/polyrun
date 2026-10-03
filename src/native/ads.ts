// AdMob 배너 (예전 폴리런과 같은 계정·광고 단위). 안드로이드에서만 띄운다:
// iOS 는 AdMob 앱 ID(Info.plist GADApplicationIdentifier)가 없어 초기화하면 앱이 죽는다.
import { Capacitor } from '@capacitor/core';
import { AdMob, BannerAdPluginEvents, BannerAdPosition, BannerAdSize } from '@capacitor-community/admob';

const BANNER_ID = 'ca-app-pub-8432922669855664/9809968062';
// 개발 서버(vite dev)에서 띄운 앱은 테스트 광고로 (내 광고를 눌러 계정이 정지되는 일 방지)
const TESTING = import.meta.env.DEV;

export const adsAvailable = Capacitor.getPlatform() === 'android';

let ready: Promise<boolean> | null = null;
const init = (): Promise<boolean> =>
  (ready ??= (async () => {
    if (!adsAvailable) return false;
    try {
      await AdMob.initialize({ initializeForTesting: TESTING });
      // 배너가 화면 아래를 덮는 높이를 CSS 변수로 알려 화면이 그만큼 짧아지게 한다 (--ad-h)
      await AdMob.addListener(BannerAdPluginEvents.SizeChanged, (size) => {
        document.documentElement.style.setProperty('--ad-h', Math.max(0, Math.round(size.height)) + 'px');
      });
      return true;
    } catch (e) {
      console.warn('AdMob init failed', e);
      return false;
    }
  })());

let shown = false;
// 화면을 빠르게 오가도 보이기/숨기기가 순서대로 처리되게 줄 세운다
let queue: Promise<void> = Promise.resolve();

// want: 배너를 보여야 하는지
export const setBanner = (want: boolean): Promise<void> =>
  (queue = queue.then(async () => {
    if (want === shown || !(await init())) return;
    if (want) {
      try {
        await AdMob.showBanner({ adId: BANNER_ID, adSize: BannerAdSize.ADAPTIVE_BANNER, position: BannerAdPosition.BOTTOM_CENTER, margin: 0, isTesting: TESTING });
        shown = true;
      } catch (e) {
        console.warn('banner failed', e);
      }
    } else {
      shown = false;
      document.documentElement.style.setProperty('--ad-h', '0px');
      await AdMob.removeBanner().catch(() => undefined);
    }
  }));
