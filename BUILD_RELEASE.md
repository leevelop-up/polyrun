# Google Play 배포용 서명된 APK 빌드 가이드

## 1. 키스토어 파일 생성

키스토어 파일이 없다면 다음 명령어로 생성하세요:

```bash
cd android/app
keytool -genkeypair -v -storetype PKCS12 -keystore my-release-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
```

명령어 실행 시 다음 정보를 입력하세요:
- 키스토어 비밀번호: (안전한 비밀번호 입력)
- 이름, 조직 단위, 조직, 도시, 시/도, 국가 코드 등
- 키 비밀번호: (키스토어 비밀번호와 동일하게 하거나 별도로 설정)

**중요**: 키스토어 파일과 비밀번호는 안전하게 보관하세요. 분실하면 Google Play에 업데이트를 올릴 수 없습니다!

## 2. keystore.properties 파일 생성

`android/keystore.properties` 파일을 생성하고 다음 내용을 입력하세요:

```properties
storeFile=app/my-release-key.keystore
storePassword=여기에_키스토어_비밀번호_입력
keyAlias=my-key-alias
keyPassword=여기에_키_비밀번호_입력
```

**참고**: `storeFile` 경로는 `android/` 폴더 기준입니다. 키스토어 파일이 `android/app/` 폴더에 있다면 `app/my-release-key.keystore`로 설정하세요.

**주의**: `keystore.properties` 파일은 `.gitignore`에 추가하여 Git에 커밋하지 마세요!

## 3. 웹 빌드

```bash
npm run build
```

## 4. Capacitor 동기화

```bash
npx cap sync android
```

## 5. Release APK 빌드

### 방법 1: Gradle 명령어 사용

```bash
cd android
./gradlew assembleRelease
```

빌드된 APK 파일 위치:
`android/app/build/outputs/apk/release/app-release.apk`

### 방법 2: Android Studio 사용

1. Android Studio에서 프로젝트 열기
2. Build → Generate Signed Bundle / APK
3. APK 선택
4. 키스토어 파일 선택 및 비밀번호 입력
5. release 빌드 타입 선택
6. Finish 클릭

## 6. AAB (Android App Bundle) 빌드 (권장)

Google Play는 AAB 형식을 권장합니다:

```bash
cd android
./gradlew bundleRelease
```

빌드된 AAB 파일 위치:
`android/app/build/outputs/bundle/release/app-release.aab`

## 7. Google Play Console에 업로드

1. [Google Play Console](https://play.google.com/console) 접속
2. 앱 생성 또는 기존 앱 선택
3. 프로덕션 → 새 버전 만들기
4. AAB 또는 APK 파일 업로드
5. 출시 정보 입력 후 검토 제출

## 주의사항

- 키스토어 파일과 비밀번호는 반드시 안전하게 보관하세요
- `keystore.properties` 파일은 Git에 커밋하지 마세요
- 버전 코드(`versionCode`)는 업데이트할 때마다 증가해야 합니다
- 버전 이름(`versionName`)은 사용자에게 표시되는 버전입니다

