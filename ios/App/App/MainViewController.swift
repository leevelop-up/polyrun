import UIKit
import Capacitor

// 앱 안에 둔 플러그인을 등록한다 (Main.storyboard 의 첫 화면이 이 클래스)
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        // 이동 안내 실시간 현황(Live Activity)과 백그라운드 위치
        bridge?.registerPluginInstance(LiveActivityPlugin())
    }
}
