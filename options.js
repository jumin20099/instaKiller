/*
  Options 페이지 스크립트 (MV3 CSP 준수: 인라인 스크립트 금지)
  - 동작 원리: chrome.storage.local에서 설정을 불러오고 저장합니다.
  - 매개변수 설명:
    1) DOM 요소들은 모두 파일 로드 시점에 쿼리하여 변수로 보관합니다.
    2) showStatus(messageText, isOk)로 결과 메시지를 표시합니다.
    3) testSend는 백그라운드에 메시지를 보내 실제 전송을 테스트합니다.
*/
(function initOptionsPage() {
  const endpointEl = document.getElementById('endpoint');
  const tokenEl = document.getElementById('token');
  const verifyEl = document.getElementById('verify');
  const statusEl = document.getElementById('status');

  function showStatus(messageText, isOk) {
    statusEl.textContent = messageText || '';
    statusEl.classList.remove('success', 'error');
    statusEl.classList.add(isOk ? 'success' : 'error');
  }

  function load() {
    chrome.storage.local.get(['synology_endpoint', 'synology_token', 'synology_insecure'], (items) => {
      endpointEl.value = items.synology_endpoint || '';
      tokenEl.value = items.synology_token || '';
      verifyEl.checked = Boolean(items.synology_insecure);
    });
  }

  function save() {
    const endpoint = endpointEl.value.trim();
    const token = tokenEl.value.trim();
    const insecure = verifyEl.checked;
    chrome.storage.local.set({ synology_endpoint: endpoint, synology_token: token, synology_insecure: insecure }, () => {
      showStatus('저장되었습니다.', true);
    });
  }

  function testSend() {
    chrome.runtime.sendMessage({ type: 'TEST_SEND_TO_SYNOLOGY' }, (res) => {
      if (chrome.runtime.lastError) {
        showStatus(chrome.runtime.lastError.message, false);
        return;
      }
      if (!res || !res.ok) {
        showStatus(res && res.error ? res.error : '전송 실패', false);
        return;
      }
      showStatus('테스트 전송 성공', true);
    });
  }

  document.getElementById('save').addEventListener('click', save);
  document.getElementById('test').addEventListener('click', testSend);
  document.addEventListener('DOMContentLoaded', load);
  load();
})();


