#!/bin/bash

# AAB (Android App Bundle) 빌드 스크립트
# Google Play Store 업로드용
# 사용법: ./build-aab.sh

set -e  # 오류 발생 시 중단

echo "🚀 AAB 빌드 시작 (Google Play Store용)..."

# 1. 웹 빌드
echo "📦 1/3 웹 빌드 중..."
npm run build

# 2. Capacitor 동기화
echo "🔄 2/3 Capacitor 동기화 중..."
npx cap sync android

# 3. AAB 빌드
echo "🔨 3/3 Release AAB 빌드 중..."
cd android
./gradlew bundleRelease
cd ..

# 빌드 완료
AAB_PATH="android/app/build/outputs/bundle/release/app-release.aab"
if [ -f "$AAB_PATH" ]; then
    AAB_SIZE=$(ls -lh "$AAB_PATH" | awk '{print $5}')
    echo ""
    echo "✅ 빌드 완료!"
    echo "📦 AAB 파일: $AAB_PATH"
    echo "📊 파일 크기: $AAB_SIZE"
    echo ""
    echo "다음 단계:"
    echo "1. Google Play Console (https://play.google.com/console) 접속"
    echo "2. 앱 생성 또는 기존 앱 선택"
    echo "3. 프로덕션 → 새 버전 만들기"
    echo "4. 위 AAB 파일 업로드"
    echo "5. 출시 정보 입력 후 검토 제출"
else
    echo "❌ 빌드 실패: AAB 파일을 찾을 수 없습니다."
    exit 1
fi


