import Foundation
import Capacitor
import CoreLocation
#if canImport(ActivityKit)
import ActivityKit
#endif

// 이동 안내 (아이폰):
// - 잠금화면·다이내믹 아일랜드 실시간 현황(Live Activity)에 목적지까지 온 비율을 게이지로 보여 준다 (iOS 16.2+)
// - 앱이 뒤로 가도 위치를 계속 받아 웹으로 보낸다 ("fix" 이벤트). Info.plist 의 UIBackgroundModes > location 이 있어야 한다.
// 웹 쪽: src/native/liveNotice.ts, src/native/tracking.ts
@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "LiveActivityPlugin"
    public let jsName = "LiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startLocation", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopLocation", returnType: CAPPluginReturnPromise)
    ]

    private var locationManager: CLLocationManager?
    // Activity<NavActivityAttributes> (iOS 16.2 미만에서도 컴파일되도록 Any 로 둔다)
    private var current: Any?

    // MARK: - 실시간 현황

    @objc func start(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            guard ActivityAuthorizationInfo().areActivitiesEnabled else {
                call.resolve()
                return
            }
            let state = Self.state(call)
            Task {
                // 이전 안내가 남아 있으면 지우고 새로 시작
                for a in Activity<NavActivityAttributes>.activities {
                    await a.end(nil, dismissalPolicy: .immediate)
                }
                do {
                    self.current = try Activity.request(attributes: NavActivityAttributes(), content: ActivityContent(state: state, staleDate: nil), pushType: nil)
                    call.resolve()
                } catch {
                    call.reject("실시간 현황을 시작하지 못했어요: \(error.localizedDescription)")
                }
            }
            return
        }
        #endif
        call.resolve()
    }

    @objc func update(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *), let activity = current as? Activity<NavActivityAttributes> {
            let state = Self.state(call)
            Task {
                await activity.update(ActivityContent(state: state, staleDate: nil))
                call.resolve()
            }
            return
        }
        #endif
        call.resolve()
    }

    @objc func end(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            current = nil
            Task {
                for a in Activity<NavActivityAttributes>.activities {
                    await a.end(nil, dismissalPolicy: .immediate)
                }
                call.resolve()
            }
            return
        }
        #endif
        call.resolve()
    }

    #if canImport(ActivityKit)
    @available(iOS 16.1, *)
    private static func state(_ call: CAPPluginCall) -> NavActivityAttributes.ContentState {
        NavActivityAttributes.ContentState(
            title: call.getString("title") ?? "",
            body: call.getString("body") ?? "",
            progress: call.getDouble("progress") ?? -1,
            short: call.getString("short") ?? ""
        )
    }
    #endif

    // MARK: - 백그라운드 위치

    @objc func startLocation(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.locationManager == nil {
                let m = CLLocationManager()
                m.delegate = self
                m.desiredAccuracy = kCLLocationAccuracyBest
                m.distanceFilter = 5
                m.activityType = .otherNavigation
                m.pausesLocationUpdatesAutomatically = false
                // UIBackgroundModes > location 이 없으면 이 줄에서 앱이 멈춘다
                m.allowsBackgroundLocationUpdates = true
                m.showsBackgroundLocationIndicator = true
                self.locationManager = m
            }
            self.locationManager?.startUpdatingLocation()
            call.resolve()
        }
    }

    @objc func stopLocation(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.locationManager?.stopUpdatingLocation()
            self.locationManager = nil
            call.resolve()
        }
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        notifyListeners("fix", data: [
            "lat": loc.coordinate.latitude,
            "lng": loc.coordinate.longitude,
            "accuracy": loc.horizontalAccuracy,
            "at": loc.timestamp.timeIntervalSince1970 * 1000
        ])
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // 잠깐 위치를 못 받는 것(터널 등)은 무시하고 계속 기다린다
    }
}
