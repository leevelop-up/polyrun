import ActivityKit
import SwiftUI
import WidgetKit

// 이동 안내 실시간 현황: 잠금화면 카드와 다이내믹 아일랜드.
// 데이터(NavActivityAttributes)는 앱의 ios/App/App/NavActivityAttributes.swift 를 같이 쓴다.
private let runBlue = Color(red: 0x2F / 255, green: 0x3C / 255, blue: 0xF0 / 255)
private let runYellow = Color(red: 0xFF / 255, green: 0xD8 / 255, blue: 0x4A / 255)
private let ink = Color(red: 0x14 / 255, green: 0x16 / 255, blue: 0x2B / 255)

struct RunTripWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: NavActivityAttributes.self) { context in
            // 잠금화면 / 알림 배너
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Image(systemName: "figure.walk")
                        .font(.headline)
                        .foregroundColor(runBlue)
                    Text(context.state.title)
                        .font(.headline)
                        .foregroundColor(ink)
                        .lineLimit(1)
                    Spacer(minLength: 4)
                    Text(context.state.short)
                        .font(.headline.monospacedDigit())
                        .foregroundColor(runBlue)
                }
                Gauge(progress: context.state.progress)
                if !context.state.body.isEmpty {
                    Text(context.state.body)
                        .font(.subheadline)
                        .foregroundColor(ink.opacity(0.7))
                        .lineLimit(1)
                }
            }
            .padding(16)
            .activityBackgroundTint(Color(red: 0xF4 / 255, green: 0xF1 / 255, blue: 0xEA / 255))
            .activitySystemActionForegroundColor(ink)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "figure.walk")
                        .font(.title2)
                        .foregroundColor(runYellow)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.state.short)
                        .font(.title3.monospacedDigit())
                        .foregroundColor(runYellow)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.state.title)
                        .font(.headline)
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        Gauge(progress: context.state.progress)
                        if !context.state.body.isEmpty {
                            Text(context.state.body)
                                .font(.caption)
                                .foregroundColor(.white.opacity(0.75))
                                .lineLimit(1)
                        }
                    }
                }
            } compactLeading: {
                Image(systemName: "figure.walk")
                    .foregroundColor(runYellow)
            } compactTrailing: {
                Text(context.state.short)
                    .font(.caption.monospacedDigit())
                    .foregroundColor(runYellow)
            } minimal: {
                // 다른 실시간 현황과 같이 뜰 때: 동그란 게이지
                if context.state.progress >= 0 {
                    ProgressView(value: context.state.progress)
                        .progressViewStyle(.circular)
                        .tint(runYellow)
                } else {
                    Image(systemName: "figure.walk")
                        .foregroundColor(runYellow)
                }
            }
            .keylineTint(runYellow)
        }
    }
}

// 목적지까지 온 만큼 차오르는 막대 (모르면 빈 막대)
private struct Gauge: View {
    let progress: Double

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.gray.opacity(0.25))
                Capsule()
                    .fill(runBlue)
                    .frame(width: geo.size.width * CGFloat(max(0, min(1, progress))))
            }
        }
        .frame(height: 8)
    }
}
