/*
  requestInstagramSessionId 함수
  - 동작 원리: 백그라운드 서비스워커에 'GET_INSTAGRAM_SESSIONID' 타입 메시지를 보내고, 응답으로 전달된 sessionid 값을 Promise로 반환합니다.
  - 매개변수: 이 함수는 매개변수를 받지 않습니다. 버튼 클릭 등 사용자 상호작용 시 호출됩니다.
  - 사용 요령: await 키워드로 값을 받아 입력창에 표시하거나, 실패 시 사용자에게 상태 메시지로 안내합니다.
*/
function requestInstagramSessionId() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "GET_INSTAGRAM_SESSIONID" }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!response || !response.ok) {
        reject(new Error(response && response.error ? response.error : "알 수 없는 오류"));
        return;
      }

      resolve(response.sessionid);
    });
  });
}

/*
  updateStatus 함수
  - 동작 원리: 상태 텍스트 블록의 내용을 갱신하고, 성공/오류 타입에 따라 CSS 클래스를 적용합니다.
  - 매개변수 설명:
    1) messageText: 사용자에게 보여줄 상태 메시지의 문자열입니다. 빈 문자열이면 메시지를 지웁니다.
    2) statusType: 'success' 또는 'error' 중 하나로 전달되며, 색상 등 스타일을 구분하는 데 사용됩니다.
    3) targetElement: 상태를 표시할 DOM 요소입니다. 일반적으로 id가 'status'인 요소를 전달합니다.
*/
function updateStatus(messageText, statusType, targetElement) {
  targetElement.textContent = messageText || "";
  targetElement.classList.remove("success", "error");
  if (statusType === "success") targetElement.classList.add("success");
  if (statusType === "error") targetElement.classList.add("error");
}

/*
  copyToClipboard 함수
  - 동작 원리: 브라우저의 Clipboard API를 사용해 전달된 텍스트를 클립보드로 복사합니다. 사용자 제스처(버튼 클릭) 컨텍스트 내에서 실행되어야 합니다.
  - 매개변수 설명:
    1) textToCopy: 복사할 순수 문자열 데이터입니다. 비어있으면 복사하지 않습니다.
    2) onSuccess: 복사 성공 시 호출되는 콜백으로, 추가 UI 반응을 넣을 수 있습니다.
    3) onFailure: 복사 실패 시 호출되는 콜백으로, 오류 메시지 표시 등에 사용합니다.
*/
function copyToClipboard(textToCopy, onSuccess, onFailure) {
  if (!textToCopy) {
    onFailure && onFailure(new Error("복사할 내용이 없습니다."));
    return;
  }

  navigator.clipboard
    .writeText(textToCopy)
    .then(() => {
      onSuccess && onSuccess();
    })
    .catch((error) => {
      onFailure && onFailure(error);
    });
}

document.addEventListener("DOMContentLoaded", () => {
  const fetchButton = document.getElementById("fetchButton");
  const copyButton = document.getElementById("copyButton");
  const cookieValueInput = document.getElementById("cookieValue");
  const statusText = document.getElementById("status");

  fetchButton.addEventListener("click", async () => {
    updateStatus("가져오는 중...", null, statusText);
    cookieValueInput.value = "";
    try {
      const sessionId = await requestInstagramSessionId();
      cookieValueInput.value = sessionId;
      updateStatus("성공적으로 가져왔습니다.", "success", statusText);
    } catch (error) {
      updateStatus(error.message || String(error), "error", statusText);
    }
  });

  copyButton.addEventListener("click", () => {
    copyToClipboard(
      cookieValueInput.value,
      () => updateStatus("클립보드에 복사되었습니다.", "success", statusText),
      (err) => updateStatus(err.message || String(err), "error", statusText)
    );
  });
});


