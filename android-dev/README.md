# RISU CUSTOM DEV

개인용 안드로이드 개발판. 기준은 공식 RisuAI v2026.10.295 (4d87a70ffb325db84dd35cb1b76b31d7074da156)이다. stable 브랜치는 이 기준점을 보관하고 dev 브랜치에서 Android 변경을 검증한다.

## 실행

Android 10 이상에서 RISU-CUSTOM-DEV-v0.3.apk를 설치한다. 앱 ID는 chat.ssom.risucustom.dev이다. 프런트엔드는 APK 안에 들어 있으며 네트워크 없이 초기 화면을 열 수 있다. 모델과 일부 플러그인·온라인 기능은 해당 서비스에 연결한다.

첫 화면의 ‘기존 리수 전체 백업 불러오기’ 또는 설정의 로컬 백업 불러오기를 누른다. 복원마다 새 기기 내 저장 공간을 만들고 데이터베이스 저장이 끝나야 기본 공간을 전환한다. 취소하거나 실패하면 기존 공간을 계속 쓸 수 있다. ‘저장 공간 전환’에서 이전 공간을 열 수 있다. 리수의 계정 암호화 백업은 공식 키 서비스에 연결할 수 있어야 한다.

개별 채팅 내보내기는 대상 캐릭터의 채팅 목록에서 가져온다. 지원하는 JSON 채팅은 확장자가 .bin이어도 읽는다. JS 플러그인은 리수의 플러그인 설정에서 설치한다. JSON 키는 해당 플러그인의 파일 선택 버튼에서 지정한다. 다운로드한 이미지와 앱 백업은 다운로드/RISU CUSTOM 폴더에 저장된다. 채팅 입력칸 옆 읽기 버튼으로 일코모드를 켠다.

## 같은 APK 다시 빌드하기

Node 22.13 이상과 pnpm, JDK, Android SDK Platform 35와 Build Tools 35.0.0을 준비한다. 이 저장소에는 앱 서명 파일이나 사용자 백업을 포함하지 않는다. 개발판 업데이트용 서명은 앱 소유자가 별도 보관한 기존 Pocket New 빌드 서명을 사용한다.

개인용 APK 빌드:
```bash
ONNXRUNTIME_NODE_INSTALL_CUDA=skip pnpm install --frozen-lockfile
VITE_RISU_LEGAL_CONFIGURED=TRUE pnpm run buildsite
pnpm check
pnpm test
export ANDROID_JAR="$ANDROID_SDK_ROOT/platforms/android-35/android.jar"
export BUILD_TOOLS="$ANDROID_SDK_ROOT/build-tools/35.0.0"
export SIGNING_KEYSTORE=/private/keystore.p12
export SIGNING_PASSWORD_FILE=/private/password.txt
android-dev/build.sh
```

JDK 컴파일러 대신 Eclipse ECJ를 사용할 때는 ECJ_JAR에 해당 JAR의 절대 경로를 지정한다. 빌드 결과는 build/RISU-CUSTOM-DEV-v0.3.apk이다. 새 키로 서명하면 이미 설치한 같은 패키지의 업데이트가 되지 않는다.

채팅 입력창 옆 메뉴에서 **장면 기억**을 열어 현재 채팅과 연결한 이전 방들의 원문을 검색하고 답변에 참고할 장면을 고정하거나 해제할 수 있다. 자동 참고는 현재 사용자 메시지와 관련된 이전 장면을 최대 두 개까지 찾아 문맥에 여유가 있을 때 첨부한다. 직전 답변에 첨부된 원문도 같은 메뉴에서 확인할 수 있다.
