/*
  getInstagramSessionId 함수
  - 동작 원리: 크롬의 cookies API를 사용하여 인스타그램 도메인(https://www.instagram.com/)에서 이름이 'sessionid'인 쿠키를 조회합니다. 이 쿠키는 로그인 성공 시 서버가 내려주는 세션 식별자입니다.
  - 반환 값: Promise<string> 형태로 sessionid 값을 반환합니다. 쿠키가 없거나 권한 문제가 있으면 reject됩니다.
  - 사용 방법: 메시지 리스너 등에서 await 또는 then으로 결과를 받아 UI에 표시하거나 복사 기능에 연결합니다.
*/
const INSTAGRAM_URL = "https://www.instagram.com/";
let cachedInstagramSessionId = null;

/*
  cacheSessionId 함수
  - 동작 원리: 메모리 변수와 chrome.storage.local에 sessionid 값을 저장합니다. 이후 팝업이나 다른 컨텍스트에서 빠르게 접근할 수 있습니다.
  - 매개변수 설명:
    1) sessionIdValue: 저장할 sessionid 순수 문자열입니다. null/빈문자열은 저장하지 않습니다.
    2) persistToStorage: true면 chrome.storage.local에도 영구 저장합니다.
    3) onComplete: 저장 작업 완료 후 호출되는 콜백입니다.
*/
function cacheSessionId(sessionIdValue, persistToStorage = true, onComplete) {
  if (!sessionIdValue) {
    onComplete && onComplete();
    return;
  }
  cachedInstagramSessionId = sessionIdValue;
  if (persistToStorage && chrome?.storage?.local) {
    chrome.storage.local.set({ instagram_sessionid: sessionIdValue }, () => {
      onComplete && onComplete();
    });
  } else {
    onComplete && onComplete();
  }
}

function getInstagramSessionId() {
  return new Promise((resolve, reject) => {
    chrome.cookies.get({ url: INSTAGRAM_URL, name: "sessionid" }, (cookie) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!cookie || !cookie.value) {
        reject(new Error("sessionid 쿠키를 찾을 수 없습니다. 인스타그램에 로그인했는지 확인하세요."));
        return;
      }

      resolve(cookie.value);
    });
  });
}

/*
  ensureSessionIdCached 함수
  - 동작 원리: 메모리/스토리지에 캐시가 없을 때 쿠키에서 가져와 캐싱합니다. 이미 캐시가 있으면 즉시 반환합니다.
  - 반환 값: Promise<string|null>로, 가져오기에 실패하면 null을 반환합니다.
  - 사용 요령: 익스텐션 시작/설치 시 호출하거나, 메시지 처리 전에 보조로 호출합니다.
*/
function ensureSessionIdCached() {
  return new Promise((resolve) => {
    if (cachedInstagramSessionId) {
      resolve(cachedInstagramSessionId);
      return;
    }

    // storage에서 복구 시도
    if (chrome?.storage?.local) {
      chrome.storage.local.get(["instagram_sessionid"], (items) => {
        const stored = items?.instagram_sessionid || null;
        if (stored) {
          cachedInstagramSessionId = stored;
          resolve(stored);
          return;
        }
        // 쿠키에서 최종 조회
        getInstagramSessionId()
          .then((sid) => {
            cacheSessionId(sid, true, () => resolve(sid));
          })
          .catch(() => resolve(null));
      });
    } else {
      getInstagramSessionId()
        .then((sid) => {
          cachedInstagramSessionId = sid;
          resolve(sid);
        })
        .catch(() => resolve(null));
    }
  });
}

/*
  onMessage 리스너
  - 동작 원리: popup 스크립트가 전송하는 'GET_INSTAGRAM_SESSIONID' 타입의 메시지를 수신하면, getInstagramSessionId를 호출해 결과를 응답합니다.
  - 매개변수 설명:
    1) message: 발신자가 보낸 데이터 객체입니다. 여기서는 type 필드를 기준으로 분기합니다.
    2) sender: 메시지를 보낸 주체(페이지/팝업/서비스워커)의 메타데이터입니다. 본 로직에서는 사용하지 않습니다.
    3) sendResponse: 비동기 결과를 응답하기 위해 호출하는 콜백입니다. Promise를 사용하는 경우 true를 반환해 채널을 유지합니다.
*/
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "GET_INSTAGRAM_SESSIONID") {
    // 캐시 우선 사용, 없으면 쿠키 조회
    ensureSessionIdCached()
      .then((sid) => {
        if (sid) {
          sendResponse({ ok: true, sessionid: sid });
        } else {
          return getInstagramSessionId()
            .then((fresh) => {
              cacheSessionId(fresh, true, () => {});
              sendResponse({ ok: true, sessionid: fresh });
            })
            .catch((error) => {
              sendResponse({ ok: false, error: error.message || String(error) });
            });
        }
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error.message || String(error) });
      });

    // 비동기 응답을 위해 true 반환
    return true;
  }
});

/*
  자동 초기화: 설치/업데이트/시작 시 세션 자동 캐시
  - onInstalled: 확장 설치/업데이트 직후 한 번 실행되어 세션을 캐시합니다.
  - onStartup: 브라우저 시작 시 서비스 워커 기동 때 세션을 캐시합니다.
*/
if (chrome?.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener(() => {
    ensureSessionIdCached();
  });
}

if (chrome?.runtime?.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    ensureSessionIdCached();
  });
}

/*
  쿠키 변경 감지: 인스타그램 sessionid 변경 시 캐시 갱신
  - 동작 원리: chrome.cookies.onChanged 이벤트에서 대상 쿠키가 instagram.com의 'sessionid'인지 판단 후 캐시를 갱신합니다.
*/
if (chrome?.cookies?.onChanged) {
  chrome.cookies.onChanged.addListener((changeInfo) => {
    try {
      const { cookie } = changeInfo || {};
      if (!cookie) return;
      if (!cookie.domain || !cookie.name) return;
      // 도메인은 .instagram.com 또는 instagram.com 형태 가능
      const isInstagram = /(^|\.)instagram\.com$/.test(cookie.domain.replace(/^\./, ""));
      const isSessionId = cookie.name === "sessionid";
      if (isInstagram && isSessionId) {
        const value = cookie?.value || null;
        if (value) {
          cacheSessionId(value, true, () => {
            // 세션이 바뀌면 즉시 외부로 전송 시도
            sendSessionToSynology(value).catch(() => {});
          });
        }
      }
    } catch (_) {
      // 무시
    }
  });
}

/*
  sendSessionToSynology 함수
  - 동작 원리: 옵션에 저장된 Synology 엔드포인트/토큰을 읽고, HTTPS POST로 sessionid를 전송합니다.
  - 매개변수 설명:
    1) sessionIdValue: 전송할 sessionid 문자열입니다. 없으면 함수가 종료됩니다.
    2) testMode: true일 때 네트워크 결과를 반환하지만 실패해도 조용히 처리합니다.
    3) returns: Promise<void>
*/
async function sendSessionToSynology(sessionIdValue, testMode = false) {
  if (!sessionIdValue) return;
  const settings = await new Promise((resolve) => {
    chrome.storage.local.get(["synology_endpoint", "synology_token", "synology_insecure"], (items) => resolve(items || {}));
  });
  const endpoint = (settings.synology_endpoint || "").trim();
  if (!endpoint) return;
  const token = (settings.synology_token || "").trim();

  const headers = { "Content-Type": "application/json" };
  if (token) {
    // 사용자가 순수 토큰만 입력한 경우 자동으로 Bearer 접두어를 부여합니다.
    const looksPrefixed = /^\s*\w+\s+\S+/.test(token) || /^\s*Bearer\s+/i.test(token);
    headers["Authorization"] = looksPrefixed ? token : `Bearer ${token}`;
  }

  const body = { service: "instagram", key: "sessionid", value: sessionIdValue, ts: Date.now() };

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      // 주: MV3 fetch는 자체적으로 CORS 제약이 완화되어 있음. SSL 검증 비활성화 옵션은 브라우저에서 무시됩니다.
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    if (testMode) throw err;
  }
}

// 시작 시 캐시된 값이 있으면 전송 시도
ensureSessionIdCached().then((sid) => {
  if (sid) sendSessionToSynology(sid).catch(() => {});
});

// 옵션 페이지에서 테스트 전송 요청
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "TEST_SEND_TO_SYNOLOGY") {
    ensureSessionIdCached()
      .then((sid) => sendSessionToSynology(sid, true))
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
});


