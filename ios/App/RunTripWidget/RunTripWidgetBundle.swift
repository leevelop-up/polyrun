import SwiftUI
import WidgetKit

// 위젯 확장의 시작점: 이동 안내 실시간 현황만 있다
@main
struct RunTripWidgetBundle: WidgetBundle {
    var body: some Widget {
        RunTripWidgetLiveActivity()
    }
}
