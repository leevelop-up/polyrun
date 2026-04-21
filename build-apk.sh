#!/bin/bash

# APK 빌드 스크립트
# 사용법: ./build-apk.sh

set -e  # 오류 발생 시 중단

echo "🚀 APK 빌드 시작..."

# 1. 웹 빌드
echo "📦 1/3 웹 빌드 중..."
npm run build

# 2. Capacitor 동기화
echo "🔄 2/3 Capacitor 동기화 중..."
npx cap sync android

# 3. APK 빌드
echo "🔨 3/3 Release APK 빌드 중..."
cd android
./gradlew assembleRelease
cd ..

# 빌드 완료
APK_PATH="android/app/build/outputs/apk/release/app-release.apk"
if [ -f "$APK_PATH" ]; then
    APK_SIZE=$(ls -lh "$APK_PATH" | awk '{print $5}')
    echo ""
    echo "✅ 빌드 완료!"
    echo "📱 APK 파일: $APK_PATH"
    echo "📊 파일 크기: $APK_SIZE"
    echo ""
    echo "다음 단계:"
    echo "1. APK 파일을 기기에 설치하여 테스트"
    echo "2. Google Play Console에 업로드"
else
    echo "❌ 빌드 실패: APK 파일을 찾을 수 없습니다."
    exit 1
fi





