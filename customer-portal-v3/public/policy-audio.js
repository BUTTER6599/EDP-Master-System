/* EDP Customer Portal V3 — Policy read-aloud enhancement (TEST ONLY)
   Uses the browser's SpeechSynthesis API. No paid AI/audio service required. */
(() => {
  'use strict';

  function getListenButton() {
    return document.querySelector('[data-role="listen"]');
  }

  function getPolicyBody() {
    return document.querySelector('.policy-body');
  }

  function getMessageRegion() {
    return document.querySelector('[data-role="message"]');
  }

  function showMessage(text) {
    const el = getMessageRegion();
    if (!el) return;
    el.textContent = text;
    el.dataset.kind = 'info';
    el.hidden = false;
  }

  function setSpeakingState(button, speaking) {
    if (!button) return;
    button.dataset.speaking = speaking ? 'true' : 'false';
    button.textContent = speaking ? 'Stop Reading' : 'Read Aloud';
    button.setAttribute('aria-pressed', speaking ? 'true' : 'false');
  }

  function cancelReading() {
    try {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    } catch (_) { /* ignore */ }
    setSpeakingState(getListenButton(), false);
  }

  function startReading(button) {
    const body = getPolicyBody();
    const text = body ? body.innerText.trim() : '';
    if (!text) {
      showMessage('Policy text is not available to read yet.');
      return;
    }

    if (!('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') {
      showMessage('Read Aloud is not supported by this browser. Please read the policy on screen.');
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1;
      utterance.volume = 1;

      utterance.onstart = () => {
        setSpeakingState(button, true);
        showMessage('Reading the policy aloud. You can press Stop Reading at any time.');
      };
      utterance.onend = () => {
        setSpeakingState(button, false);
        showMessage('Policy reading finished.');
      };
      utterance.onerror = () => {
        setSpeakingState(button, false);
        showMessage('The browser could not complete Read Aloud. Please read the policy on screen.');
      };

      window.speechSynthesis.speak(utterance);
    } catch (_) {
      setSpeakingState(button, false);
      showMessage('The browser could not start Read Aloud. Please read the policy on screen.');
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target && event.target.closest ? event.target.closest('[data-role="listen"]') : null;
    if (!button) return;

    // Capture this button's behavior here so the older placeholder handler
    // in policy-gate.js does not display its "coming next" message.
    event.preventDefault();
    event.stopImmediatePropagation();

    const speaking = button.dataset.speaking === 'true';
    if (speaking) cancelReading();
    else startReading(button);
  }, true);

  // Stop speech when the policy modal closes or the page is left.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') cancelReading();
  });
  window.addEventListener('pagehide', cancelReading);
})();
