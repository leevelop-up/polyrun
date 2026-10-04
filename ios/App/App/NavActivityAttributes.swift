import Foundation
#if canImport(ActivityKit)
import ActivityKit

// 이동 안내 실시간 현황(Live Activity)의 데이터. 앱(LiveActivityPlugin)과 위젯 확장(RunTripWidget) 둘 다 이 파일을 쓴다.
// Xcode 에서 이 파일의 Target Membership 에 App 과 RunTripWidgetExtension 을 모두 체크해야 한다 (ios/LIVE_ACTIVITY.md).
@available(iOS 16.1, *)
struct NavActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        // "🚶 성산일출봉까지 12분"
        var title: String
        // "800m 남음 · 도보"
        var body: String
        // 이번 구간에서 온 비율 0~1. 모르면(길 찾는 중) -1
        var progress: Double
        // 다이내믹 아일랜드에 넣을 짧은 글 ("12분", "도착")
        var short: String
    }
}
#endif
