# 아이폰 이동 안내 실시간 현황 (Live Activity)

이동 안내 중에 잠금화면과 다이내믹 아일랜드에 "성산일출봉까지 12분"과 차오르는 게이지를 보여 준다.
코드는 다 들어 있고, **위젯 확장 타깃만 Xcode 에서 한 번 만들어 주면** 된다 (타깃은 손으로 만들기 어려워 Xcode 로 한다).

## 이미 들어 있는 것

| 파일 | 하는 일 |
|---|---|
| `App/LiveActivityPlugin.swift` | 웹에서 부르는 플러그인 `LiveActivity`: 실시간 현황 시작·갱신·종료, 백그라운드 위치(`fix` 이벤트) |
| `App/MainViewController.swift` | 위 플러그인 등록 (Main.storyboard 첫 화면) |
| `App/NavActivityAttributes.swift` | 실시간 현황 데이터 (앱과 위젯이 같이 씀) |
| `App/Info.plist` | `NSSupportsLiveActivities`, `UIBackgroundModes > location` |
| `RunTripWidget/*.swift` | 잠금화면 카드·다이내믹 아일랜드 화면 (아래에서 만들 타깃에 넣는다) |
| `src/native/liveNotice.ts`, `src/native/tracking.ts` | 웹 쪽: 아이폰이면 이 플러그인으로 표시·위치 받기 |

## 맥에서 할 일

1. `npm run build && npx cap sync ios` 후 `ios/App/App.xcworkspace` 를 Xcode 로 연다.
2. **File > New > Target… > Widget Extension**
   - Product Name: `RunTripWidget`
   - **Include Live Activity** 체크, Include Configuration App Intent 는 체크 해제
   - "Activate scheme?" 은 Activate
3. Xcode 가 만든 `RunTripWidget` 폴더의 Swift 파일들을 지우고(Move to Trash),
   이 저장소의 `ios/App/RunTripWidget/RunTripWidgetBundle.swift`, `RunTripWidgetLiveActivity.swift` 를
   그 폴더에 끌어다 넣는다 (Target: **RunTripWidgetExtension** 만 체크).
4. `App/NavActivityAttributes.swift` 를 선택 → 오른쪽 File inspector 의 **Target Membership** 에서
   `App` 과 `RunTripWidgetExtension` **둘 다** 체크.
5. `RunTripWidgetExtension` 타깃의 **Minimum Deployments** 를 iOS 16.2 로, Signing Team 을 앱과 같게.
6. 아이폰에 설치해서 확인:
   - 일정 → 지도 → 이동 안내 시작 → 홈으로 나가 잠금화면/다이내믹 아일랜드에 게이지가 뜨는지
   - 앱을 뒤로 보낸 채 걸으면 게이지가 차는지 (상단에 파란 위치 표시가 보이면 백그라운드 위치가 도는 것)
   - 설정 > 런트립 > 실시간 현황이 켜져 있어야 한다

## 알아 둘 것

- 실시간 현황은 iOS 16.2 이상, 다이내믹 아일랜드는 아이폰 14 Pro 이상. 그 밖의 아이폰은 잠금화면 카드만 나온다.
- 위젯 확장을 아직 안 만들어도 앱은 동작한다: 백그라운드 위치는 받고, 실시간 현황만 안 보인다.
- `UIBackgroundModes > location` 을 쓰므로 앱 심사 때 "이동 안내 중 위치를 계속 받는 이유"를 적어야 할 수 있다.
- 이 코드는 Windows 에서 작성해 아직 빌드·실행해 보지 않았다. 컴파일 오류가 나면 그 메시지로 고치면 된다.
