# APK 빌드 가이드 - 단계별 안내

## 📋 사전 준비사항

1. **키스토어 파일 생성** (최초 1회만)
2. **keystore.properties 파일 설정**
3. **웹 빌드**
4. **Capacitor 동기화**
5. **Release APK 빌드**

---

## 1️⃣ 키스토어 파일 생성 (최초 1회만)

키스토어 파일이 없다면 생성해야 합니다:

```bash
cd android/app
keytool -genkeypair -v -storetype PKCS12 -keystore my-release-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
```

**입력 정보:**
- 키스토어 비밀번호: (예: `RunTrip2026!`)
- 이름: (예: `Lee`)
- 조직 단위: (예: `Development`)
- 조직: (예: `RunTrip`)
- 도시: (예: `Seoul`)
- 시/도: (예: `Seoul`)
- 국가 코드: (예: `KR`)
- 키 비밀번호: (키스토어 비밀번호와 동일하게 하거나 별도 설정)

**⚠️ 중요**: 키스토어 파일과 비밀번호는 **반드시 안전하게 보관**하세요. 분실하면 Google Play에 업데이트를 올릴 수 없습니다!

---

## 2️⃣ keystore.properties 파일 설정

`android/keystore.properties` 파일을 열고 실제 비밀번호를 입력하세요:

```properties
storeFile=my-release-key.keystore
storePassword=실제_키스토어_비밀번호
keyAlias=my-key-alias
keyPassword=실제_키_비밀번호
```

**주의**: 
- `storeFile`은 `android/app/` 폴더 기준입니다
- 이 파일은 Git에 커밋하지 마세요 (이미 `.gitignore`에 추가됨)

---

## 3️⃣ 웹 빌드

프로젝트 루트에서 실행:

```bash
npm run build
```

이 명령어는 `dist/` 폴더에 웹 빌드 결과물을 생성합니다.

---

## 4️⃣ Capacitor 동기화

웹 빌드 결과물을 Android 프로젝트에 동기화:

```bash
npx cap sync android
```

---

## 5️⃣ Release APK 빌드

### 방법 A: Gradle 명령어 사용 (권장)

```bash
cd android
./gradlew assembleRelease
```

**빌드된 APK 위치:**
```
android/app/build/outputs/apk/release/app-release.apk
```

### 방법 B: Android Studio 사용

1. Android Studio에서 프로젝트 열기:
   ```bash
   # Android Studio 실행 후
   File → Open → android 폴더 선택
   ```

2. Build → Generate Signed Bundle / APK
3. APK 선택 → Next
4. 키스토어 파일 선택 (`android/app/my-release-key.keystore`)
5. 비밀번호 입력
6. release 빌드 타입 선택
7. Finish 클릭

---

## 6️⃣ AAB (Android App Bundle) 빌드 (Google Play 권장)

Google Play는 AAB 형식을 권장합니다:

```bash
cd android
./gradlew bundleRelease
```

**빌드된 AAB 위치:**
```
android/app/build/outputs/bundle/release/app-release.aab
```

---

## 7️⃣ Google Play Console에 업로드

1. [Google Play Console](https://play.google.com/console) 접속
2. 앱 생성 (최초 1회) 또는 기존 앱 선택
3. 프로덕션 → 새 버전 만들기
4. AAB 또는 APK 파일 업로드
5. 출시 정보 입력 (버전명, 릴리스 노트 등)
6. 검토 제출

---

## 🔄 업데이트 시 주의사항

앱을 업데이트할 때마다:

1. **버전 코드 증가** (`android/app/build.gradle`):
   ```gradle
   versionCode 2  // 1 → 2 → 3 ...
   versionName "1.1"  // 사용자에게 표시되는 버전
   ```

2. 위의 3~5단계 반복

---

## 🐛 문제 해결

### 빌드 오류 발생 시

1. **키스토어 파일 경로 확인**:
   ```bash
   ls -la android/app/my-release-key.keystore
   ```

2. **keystore.properties 파일 확인**:
   ```bash
   cat android/keystore.properties
   ```

3. **Gradle 캐시 정리**:
   ```bash
   cd android
   ./gradlew clean
   ```

4. **다시 빌드**:
   ```bash
   ./gradlew assembleRelease
   ```

### 키스토어 비밀번호 오류

- `keystore.properties` 파일의 비밀번호가 정확한지 확인
- 키스토어 파일 생성 시 입력한 비밀번호와 일치해야 함

---

## 📝 전체 빌드 명령어 (한 번에 실행)

```bash
# 1. 웹 빌드
npm run build

# 2. Capacitor 동기화
npx cap sync android

# 3. APK 빌드
cd android && ./gradlew assembleRelease && cd ..

# 빌드 완료! APK 파일 위치:
# android/app/build/outputs/apk/release/app-release.apk
```

---

## ✅ 빌드 확인

APK 파일이 생성되었는지 확인:

```bash
ls -lh android/app/build/outputs/apk/release/app-release.apk
```

파일 크기와 생성 시간이 표시되면 성공입니다!





