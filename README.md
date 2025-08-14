# Instagram sessionid Extractor (Chrome Extension)

인스타그램에 로그인한 브라우저에서 `sessionid` 쿠키를 손쉽게 확인하고 복사하는 크롬 익스텐션입니다.

## 설치 방법 (개발자 모드)

1. 크롬 주소창에 `chrome://extensions/` 입력 후 이동
2. 우측 상단의 "개발자 모드" 활성화
3. "압축해제된 확장 프로그램을 로드" 클릭
4. 이 폴더(`/Users/jumin-mac/instaKiller`)를 선택

## 사용 방법

- 인스타그램 계정으로 로그인한 상태에서 익스텐션 아이콘을 클릭합니다.
- 팝업에서 "sessionid 가져오기" 버튼을 누르면 값이 표시됩니다.
- "복사하기"를 눌러 클립보드로 복사할 수 있습니다.

## 권한 설명

- `cookies`: 인스타그램 도메인의 쿠키를 읽어오기 위해 필요합니다.
- `host_permissions (https://*.instagram.com/*)`: 인스타그램 도메인 접근 권한입니다.
- `activeTab`, `scripting`: 일반적인 팝업/탭 상호작용을 위한 권한입니다.

## 주의사항

- `sessionid`는 민감한 인증 정보입니다. 제3자에게 공유하지 마세요.
- 로그아웃하거나 세션이 만료되면 값이 변경/삭제될 수 있습니다.
