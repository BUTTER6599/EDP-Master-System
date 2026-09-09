/**
 * EDP Customer Portal V3 — Policy Acknowledgment Gate (TEST ONLY)
 *
 * Frontend mechanics for the first customer policy review + acknowledgment.
 * The gate is opened when a customer chooses to shop appliances; once
 * acknowledged in the active browser tab (sessionStorage), subsequent card
 * views in the same session do not re-prompt.
 *
 * This build ships an OBVIOUS TEST placeholder for the policy body. The
 * authoritative customer-safe wording lives in the EDP Customer Policy
 * Service — Master Policy Library (Doc 1P_LAH9QfJ8pxg89rg6QOWt8H-tAV1c_1fKCW8E8k50M).
 * The Docs API was disabled on the clasp GCP project at build time, so the
 * verified sections could not be fetched from the build sandbox. Taylor
 * pastes the approved wording into POLICY_TEXT (and updates POLICY_VERSION)
 * in a follow-up commit; no other code needs to change.
 *
 * There is no server write in this slice. Ack records live in
 * sessionStorage only, clearly marked environment:'TEST'. The proposed
 * schema for the permanent destination is documented in the delivery
 * report.
 */
(() => {
  'use strict';

  // ---- Config -------------------------------------------------
  const STORAGE_KEY  = 'edp.portal.v3.policyAck';
  const SESSION_KEY  = 'edp.portal.v3.sessionId';
  const POLICY_ID    = 'EDP-CUSTOMER-POLICY-V3-TEST';
  const POLICY_VERSION = 'TEST-PLACEHOLDER-v1';
  const POLICY_LABEL = 'EDP Customer Policies';

  // Deliberately obvious TEST placeholder. Long enough to require
  // scrolling on realistic viewports. Contains no policy statements.
  const POLICY_TEXT = [
    '=== TEST PLACEHOLDER — awaiting approved wording from EDP Customer Policy Service — Master Policy Library ===',
    'This TEST build shows the mechanics of the acknowledgment gate only. It does not display customer-facing policy language.',
    'The authoritative customer-safe sections will replace this placeholder before any LIVE deployment. Until then, nothing in this container should be relied on as a policy statement.',
    'Section marker — placeholder 1 of 6. The paragraph is intentionally short. It exists only to give the gate enough vertical content to be scrollable on typical viewports.',
    'Section marker — placeholder 2 of 6. Scroll continues below.',
    'Section marker — placeholder 3 of 6. The customer-facing terms will address (per Taylor) subjects such as delivery, warranty, service, returns, and hold expiration. None of those terms appear here.',
    'Section marker — placeholder 4 of 6. Scroll continues below.',
    'Section marker — placeholder 5 of 6. Scroll continues below.',
    'Section marker — placeholder 6 of 6. This is the end of the placeholder body. The acknowledgment controls unlock only after this line is reached.',
    '=== END OF TEST PLACEHOLDER ==='
  ];

  // ---- Small utilities ----------------------------------------
  const now = () => new Date().toISOString();
  const uuid = () => {
    try {
      if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    } catch (_) { /* ignore */ }
    return 'x' + Date.now().toString(16) + Math.random().toString(16).slice(2);
  };

  function ensureSessionId() {
    try {
      let s = sessionStorage.getItem(SESSION_KEY);
      if (!s) { s = 'SESS-' + uuid(); sessionStorage.setItem(SESSION_KEY, s); }
      return s;
    } catch (_) { return 'SESS-nostorage'; }
  }

  function loadAck() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }
  function saveAck(ack) {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ack)); return true; }
    catch (_) { return false; }
  }
  function isAcknowledgedForCurrentPolicy() {
    const a = loadAck();
    return !!(a && a.policy_id === POLICY_ID && a.policy_version === POLICY_VERSION && a.method && a.customer_name);
  }
  async function sha256Hex(text) {
    try {
      const enc = new TextEncoder().encode(text);
      const buf = await crypto.subtle.digest('SHA-256', enc);
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (_) { return null; }
  }

  // ---- Gate DOM -----------------------------------------------
  const gate = createGate();
  document.body.appendChild(gate.root);

  function createGate() {
    const root = document.createElement('div');
    root.className = 'policy-gate';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'policy-gate-title');
    root.hidden = true;

    const panel = document.createElement('div');
    panel.className = 'policy-panel';

    // Header
    const header = document.createElement('div');
    header.className = 'policy-header';
    const headerText = document.createElement('div');
    headerText.className = 'policy-header-text';
    headerText.innerHTML =
      '<p class="eyebrow">EDP CUSTOMER PORTAL — POLICY REVIEW (TEST)</p>' +
      '<h2 id="policy-gate-title" class="policy-title"></h2>' +
      '<div class="policy-version"></div>';
    header.appendChild(headerText);
    const headerActions = document.createElement('div');
    headerActions.className = 'policy-header-actions';
    const listenBtn = document.createElement('button');
    listenBtn.type = 'button';
    listenBtn.className = 'button secondary';
    listenBtn.dataset.role = 'listen';
    listenBtn.textContent = 'Read Aloud';
    headerActions.appendChild(listenBtn);
    header.appendChild(headerActions);
    panel.appendChild(header);

    // Policy body (scrollable)
    const body = document.createElement('div');
    body.className = 'policy-body';
    body.setAttribute('role', 'document');
    body.setAttribute('tabindex', '0');
    panel.appendChild(body);

    const scrollHint = document.createElement('div');
    scrollHint.className = 'policy-scroll-hint';
    scrollHint.textContent = 'Scroll to the bottom to enable the acknowledgment controls.';
    panel.appendChild(scrollHint);

    // Acknowledgment method
    const choiceFs = document.createElement('fieldset');
    choiceFs.className = 'policy-choice';
    choiceFs.dataset.role = 'choice';
    const choiceLegend = document.createElement('legend');
    choiceLegend.className = 'visually-hidden';
    choiceLegend.textContent = 'Acknowledgment method';
    choiceFs.appendChild(choiceLegend);
    const choiceRow1 = document.createElement('label');
    choiceRow1.className = 'policy-choice-row';
    choiceRow1.innerHTML =
      '<input type="radio" name="policyMethod" value="READ_SELF" disabled>' +
      '<span>I acknowledge that I have <strong>read the policies</strong> shown above.</span>';
    const choiceRow2 = document.createElement('label');
    choiceRow2.className = 'policy-choice-row';
    choiceRow2.innerHTML =
      '<input type="radio" name="policyMethod" value="READ_TO_ME" disabled>' +
      '<span>I acknowledge that the policies shown above were <strong>read to me</strong>.</span>';
    choiceFs.appendChild(choiceRow1);
    choiceFs.appendChild(choiceRow2);
    panel.appendChild(choiceFs);

    // Name
    const nameField = document.createElement('label');
    nameField.className = 'policy-field';
    nameField.innerHTML =
      '<span>Full name (required)</span>' +
      '<input type="text" data-role="name" autocomplete="name" maxlength="120" disabled>';
    panel.appendChild(nameField);

    // Signature
    const sigField = document.createElement('div');
    sigField.className = 'policy-field';
    const sigLabel = document.createElement('span');
    sigLabel.textContent = 'Signature (draw with mouse, pen, or finger)';
    const sigWrap = document.createElement('div');
    sigWrap.className = 'policy-sig-wrap';
    const sigCanvas = document.createElement('canvas');
    sigCanvas.dataset.role = 'sig';
    sigCanvas.width = 600;
    sigCanvas.height = 160;
    sigCanvas.setAttribute('aria-label', 'Signature pad');
    const sigClearBtn = document.createElement('button');
    sigClearBtn.type = 'button';
    sigClearBtn.className = 'button secondary';
    sigClearBtn.dataset.role = 'sig-clear';
    sigClearBtn.textContent = 'Clear signature';
    sigClearBtn.disabled = true;
    sigWrap.appendChild(sigCanvas);
    sigWrap.appendChild(sigClearBtn);
    sigField.appendChild(sigLabel);
    sigField.appendChild(sigWrap);
    panel.appendChild(sigField);

    // Final language
    const finalP = document.createElement('p');
    finalP.className = 'policy-final';
    finalP.textContent =
      'I acknowledge that I have read, or had read to me, the policies and terms ' +
      'displayed above. I acknowledge that I had the opportunity to review them and ' +
      'agree to the applicable terms before continuing.';
    panel.appendChild(finalP);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'policy-actions';
    const declineBtn = document.createElement('button');
    declineBtn.type = 'button';
    declineBtn.className = 'button ghost';
    declineBtn.dataset.role = 'decline';
    declineBtn.textContent = 'I do not agree';
    const agreeBtn = document.createElement('button');
    agreeBtn.type = 'button';
    agreeBtn.className = 'button policy-agree';
    agreeBtn.dataset.role = 'agree';
    agreeBtn.textContent = 'Acknowledge & Continue';
    agreeBtn.disabled = true;
    actions.appendChild(declineBtn);
    actions.appendChild(agreeBtn);
    panel.appendChild(actions);

    // Inline status/message region
    const message = document.createElement('div');
    message.className = 'policy-message';
    message.dataset.role = 'message';
    message.hidden = true;
    panel.appendChild(message);

    root.appendChild(panel);
    // Set title / version now that DOM exists
    root.querySelector('.policy-title').textContent = POLICY_LABEL;
    root.querySelector('.policy-version').textContent =
      'Policy: ' + POLICY_ID + ' · Version: ' + POLICY_VERSION;

    return { root, panel, body, scrollHint,
      choiceInputs: () => Array.from(root.querySelectorAll('input[name="policyMethod"]')),
      nameInput: root.querySelector('[data-role="name"]'),
      sigCanvas: sigCanvas,
      sigClearBtn: sigClearBtn,
      agreeBtn: agreeBtn,
      declineBtn: declineBtn,
      listenBtn: listenBtn,
      message: message };
  }

  // ---- Policy body render -------------------------------------
  function renderPolicyText() {
    gate.body.innerHTML = '';
    const frag = document.createDocumentFragment();
    POLICY_TEXT.forEach((para) => {
      const p = document.createElement('p');
      p.textContent = para;
      frag.appendChild(p);
    });
    gate.body.appendChild(frag);
    gate.body.scrollTop = 0;
  }

  // ---- Scroll-to-bottom detection -----------------------------
  let scrolledToBottom = false;
  function checkScroll() {
    const b = gate.body;
    const fits = b.scrollHeight <= b.clientHeight + 4;
    const atBottom = b.scrollTop + b.clientHeight >= b.scrollHeight - 4;
    // Require content to have SOMETHING scrollable OR fits without scrolling
    if (fits || atBottom) {
      if (!scrolledToBottom) {
        scrolledToBottom = true;
        enableInputsAfterScroll();
      }
    }
  }
  function enableInputsAfterScroll() {
    gate.scrollHint.textContent = 'Ready to acknowledge.';
    gate.scrollHint.classList.add('ready');
    gate.choiceInputs().forEach((r) => { r.disabled = false; });
    gate.nameInput.disabled = false;
    gate.sigClearBtn.disabled = false;
    updateValidity();
  }

  // ---- Signature pad ------------------------------------------
  let sigCtx = null;
  let sigDrew = false;
  function initSignaturePad() {
    const c = gate.sigCanvas;
    c.style.touchAction = 'none';
    try { sigCtx = c.getContext('2d'); } catch (_) { sigCtx = null; }
    if (sigCtx) {
      sigCtx.strokeStyle = '#0f172a';
      sigCtx.lineWidth = 2;
      sigCtx.lineCap = 'round';
      sigCtx.lineJoin = 'round';
    }
    let drawing = false;
    function pos(evt) {
      const rect = c.getBoundingClientRect();
      const w = rect.width || c.width;
      const h = rect.height || c.height;
      const x = ((evt.clientX || 0) - rect.left) * (c.width / (w || 1));
      const y = ((evt.clientY || 0) - rect.top) * (c.height / (h || 1));
      return { x: x, y: y };
    }
    function start(evt) {
      // Only allow after inputs are unlocked (which happens after scroll)
      if (gate.nameInput.disabled) return;
      if (typeof evt.preventDefault === 'function') evt.preventDefault();
      try { if (typeof c.setPointerCapture === 'function' && evt.pointerId != null) c.setPointerCapture(evt.pointerId); } catch (_) {}
      drawing = true;
      const p = pos(evt);
      if (sigCtx) {
        sigCtx.beginPath();
        sigCtx.moveTo(p.x, p.y);
        sigCtx.lineTo(p.x + 0.01, p.y + 0.01);
        sigCtx.stroke();
      }
      sigDrew = true;
      updateValidity();
    }
    function move(evt) {
      if (!drawing) return;
      if (typeof evt.preventDefault === 'function') evt.preventDefault();
      const p = pos(evt);
      if (sigCtx) { sigCtx.lineTo(p.x, p.y); sigCtx.stroke(); }
    }
    function end(evt) {
      if (!drawing) return;
      drawing = false;
      try { if (typeof c.releasePointerCapture === 'function' && evt && evt.pointerId != null) c.releasePointerCapture(evt.pointerId); } catch (_) {}
    }
    c.addEventListener('pointerdown', start);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', end);
    gate.sigClearBtn.addEventListener('click', clearSignature);
  }
  function clearSignature() {
    if (sigCtx) sigCtx.clearRect(0, 0, gate.sigCanvas.width, gate.sigCanvas.height);
    sigDrew = false;
    updateValidity();
  }

  // ---- Validity -----------------------------------------------
  function currentMethod() {
    const inputs = gate.choiceInputs();
    for (let i = 0; i < inputs.length; i += 1) if (inputs[i].checked) return inputs[i].value;
    return null;
  }
  function updateValidity() {
    const ok = scrolledToBottom
      && !!currentMethod()
      && gate.nameInput.value.trim().length > 0
      && sigDrew;
    gate.agreeBtn.disabled = !ok;
    if (ok) gate.agreeBtn.classList.add('ready');
    else gate.agreeBtn.classList.remove('ready');
  }

  // ---- Actions ------------------------------------------------
  function showMessage(text, kind) {
    gate.message.textContent = text;
    gate.message.dataset.kind = kind || 'info';
    gate.message.hidden = false;
  }
  function hideMessage() {
    gate.message.hidden = true;
    gate.message.textContent = '';
  }

  gate.listenBtn.addEventListener('click', () => {
    showMessage('Audio policy reading coming next — read on screen.', 'info');
  });

  gate.declineBtn.addEventListener('click', () => {
    showMessage(
      'No worries. To speak with EDP about the policies, please call 504-732-1233 ' +
      'or visit The Electronics Depot at 7333 Airline Drive, Metairie, LA. ' +
      'Appliance shopping stays locked until acknowledgment is complete.',
      'info'
    );
  });

  gate.agreeBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (gate.agreeBtn.disabled) return;
    const method = currentMethod();
    const name = gate.nameInput.value.trim();
    if (!method || !name || !sigDrew) return;

    let sigDataUrl = '';
    try { sigDataUrl = gate.sigCanvas.toDataURL('image/png'); } catch (_) { sigDataUrl = ''; }
    const policyHash = await sha256Hex(POLICY_TEXT.join('\n'));

    const ack = {
      ack_id: 'ACK-' + uuid(),
      policy_id: POLICY_ID,
      policy_version: POLICY_VERSION,
      policy_label: POLICY_LABEL,
      policy_text_hash: policyHash,
      timestamp_iso: now(),
      timezone_hint: 'America/Chicago',
      method: method,
      customer_name: name,
      signature_data_url: sigDataUrl,
      session_id: ensureSessionId(),
      environment: 'TEST',
      audit_target: 'session-only (no server write; awaiting approved permanent destination)'
    };
    saveAck(ack);
    closeGate();
    onAcknowledged(ack);
  });

  gate.root.addEventListener('click', (e) => {
    if (e.target === gate.root) closeGate();
  });

  document.addEventListener('keydown', (e) => {
    if (gate.root.hidden) return;
    if (e.key === 'Escape') { closeGate(); e.preventDefault(); }
  });

  // ---- Open / close -------------------------------------------
  function openGate() {
    scrolledToBottom = false;
    gate.scrollHint.textContent = 'Scroll to the bottom to enable the acknowledgment controls.';
    gate.scrollHint.classList.remove('ready');
    gate.choiceInputs().forEach((r) => { r.disabled = true; r.checked = false; });
    gate.nameInput.disabled = true;
    gate.nameInput.value = '';
    gate.sigClearBtn.disabled = true;
    clearSignature();
    hideMessage();
    updateValidity();

    renderPolicyText();
    gate.root.hidden = false;
    document.body.classList.add('policy-gate-open');
    // Recheck once, in case content already fits in view
    setTimeout(() => {
      checkScroll();
      try { gate.body.focus(); } catch (_) {}
    }, 0);
  }

  function closeGate() {
    gate.root.hidden = true;
    document.body.classList.remove('policy-gate-open');
  }

  gate.body.addEventListener('scroll', checkScroll);
  gate.nameInput.addEventListener('input', updateValidity);
  gate.choiceInputs().forEach((r) => r.addEventListener('change', updateValidity));
  initSignaturePad();

  // ---- Public wiring: CTA + acknowledgment event --------------
  function onAcknowledged(ack) {
    const grid = document.getElementById('appliance-grid');
    const cta  = document.getElementById('shop-gate-cta');
    if (cta)  cta.hidden = true;
    if (grid) grid.hidden = false;
    document.dispatchEvent(new CustomEvent('edp:policy-acknowledged', { detail: ack }));
  }

  const openBtn = document.getElementById('open-policy-gate');
  if (openBtn) openBtn.addEventListener('click', openGate);

  if (isAcknowledgedForCurrentPolicy()) {
    onAcknowledged(loadAck());
  }
})();
