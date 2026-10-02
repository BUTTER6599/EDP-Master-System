/* EDP Customer Portal V3 — Hold + Options draft flow (TEST ONLY)
 *
 * Session-only draft; no backend write. See HOLD-REQUEST-STOP-REPORT.md
 * in scratchpad for the architecture status. Policy wording is pulled
 * from window.EDPPolicyLibrary; do not duplicate policy text here.
 */
(() => {
  const HOLD_DRAFT_KEY = 'edp.portal.v3.holdDraft';
  const POLICY_ACK_KEY = 'edp.portal.v3.policyAck';

  const CONFIRMATION_SENTENCE =
    'THIS IS A HOLD REQUEST ONLY. This is NOT a completed purchase. ' +
    'An Electronics Depot representative will contact you to confirm ' +
    'availability and complete the sale.';

  const US_STATES = [
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN',
    'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV',
    'NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN',
    'TX','UT','VT','VA','WA','WV','WI','WY','DC'
  ];

  const DELIVERY_QUESTIONS = [
    { key: 'front_door', label: 'Will the appliance come in through the front door?' },
    { key: 'garage',     label: 'Will the appliance come in through a garage?' },
    { key: 'steps',      label: 'Are there steps on the delivery path?' },
    { key: 'narrow',     label: 'Is there a narrow hallway on the delivery path?' },
    { key: 'obstacles',  label: 'Are there other obstacles on the delivery path (tight turns, railings, low ceilings)?' }
  ];

  const PHOTO_PLACEHOLDERS = [
    { key: 'front_of_property', label: 'Front of the property' },
    { key: 'delivery_path',     label: 'Delivery path (walkway / driveway)' },
    { key: 'doorway',           label: 'Main doorway the appliance will come through' },
    { key: 'hallway',           label: 'Hallway or passage to the install location' },
    { key: 'appliance_location',label: 'Appliance location (where it will be placed)' }
  ];

  let inventory = [];
  let wired = false;

  const safeText = (value) => String(value == null ? '' : value);
  const formatPrice = (value) => {
    const num = Number(value);
    return Number.isFinite(num) && num > 0
      ? '$' + num.toLocaleString('en-US', { maximumFractionDigits: 0 })
      : '';
  };
  const cleanWarranty = (value) => {
    const text = safeText(value).trim();
    if (!text || /needs verification|unapproved|placeholder|test/i.test(text)) return '';
    return text;
  };
  const titleFor = (item) => `${safeText(item.brand)} ${safeText(item.model)}`.trim() || 'Appliance';

  const style = document.createElement('style');
  style.textContent = `
    .hold-button{width:100%;margin-top:14px;border:0;border-radius:10px;padding:12px 16px;font:inherit;font-weight:800;cursor:pointer;background:#0b5ed7;color:#fff}
    .hold-button:hover,.hold-button:focus{filter:brightness(.94)}
    .hold-overlay[hidden]{display:none!important}.hold-overlay{position:fixed;inset:0;z-index:1200;background:rgba(0,0,0,.62);display:grid;place-items:center;padding:18px}
    .hold-panel{width:min(760px,100%);max-height:92vh;overflow:auto;background:#fff;color:#152033;border-radius:16px;padding:22px;box-shadow:0 24px 70px rgba(0,0,0,.35)}
    .hold-panel h2{margin:0 0 6px}.hold-panel h3{margin:22px 0 8px}.hold-close{float:right;border:1px solid #c8d0db;background:#fff;border-radius:8px;padding:8px 12px;cursor:pointer;font:inherit;font-weight:700}
    .hold-notice{background:#eef5ff;border:2px solid #0b5ed7;border-radius:12px;padding:14px;margin:14px 0;font-weight:700;line-height:1.5}
    .hold-item{background:#f7f8fa;border-radius:10px;padding:12px;margin:12px 0}.hold-item-id{font-weight:800}
    .hold-choice{display:block;border:1px solid #d7dce3;border-radius:10px;padding:11px 12px;margin:8px 0}.hold-choice input{margin-right:8px}
    .hold-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .hold-grid-3{display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px}
    .hold-field label{display:block;font-weight:700;margin-bottom:5px}
    .hold-field input,.hold-field select{box-sizing:border-box;width:100%;padding:11px;border:1px solid #aeb7c2;border-radius:8px;font:inherit;background:#fff}
    .hold-disclosure{font-size:.95rem;line-height:1.55;background:#fff8e8;border:1px solid #e5c469;border-radius:10px;padding:12px;margin:12px 0}
    .hold-disclosure .edp-pollib-link{margin-left:4px}
    .hold-submit{width:100%;margin-top:15px;border:0;border-radius:10px;padding:13px 16px;background:#0b5ed7;color:#fff;font:inherit;font-weight:800;cursor:pointer}.hold-submit:disabled{background:#9aa4b2;cursor:not-allowed}
    .hold-result{margin-top:12px;border-radius:10px;padding:12px;background:#eef8ef;border:1px solid #8abd91;font-weight:700}
    .hold-delivery-panel[hidden]{display:none!important}
    .hold-delivery-panel{margin-top:10px;padding:14px;border:1.5px solid #0b5ed7;border-radius:12px;background:#f6f9ff}
    .hold-delivery-panel h4{margin:0 0 8px;font-size:1.02rem}
    .hold-question-row{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;border-top:1px solid #d7e0ef;padding:10px 2px}
    .hold-question-row:first-of-type{border-top:0}
    .hold-question-row .yesno{display:inline-flex;gap:14px}
    .hold-question-row label{font-weight:700}
    .hold-question-row .ynlabel{font-weight:600;font-size:.95rem}
    .hold-photo-row{display:flex;flex-direction:column;gap:4px;padding:8px 0;border-top:1px solid #d7e0ef}
    .hold-photo-row:first-of-type{border-top:0}
    .hold-photo-row label{font-weight:700}
    .hold-photo-row input{font:inherit}
    .hold-photo-row .photo-note{font-size:.82rem;color:#4a5568;font-weight:600}
    .hold-policy-ref{font-size:.9rem;line-height:1.5;margin-top:8px}
    .hold-confirmation[hidden]{display:none!important}
    .hold-confirmation{background:#eef8ef;border:2px solid #0b5ed7;border-radius:12px;padding:18px;margin:16px 0;line-height:1.55}
    .hold-confirmation h3{margin:0 0 10px;color:#0b5ed7;font-size:1.08rem}
    .hold-confirmation .verbatim{font-size:1rem;font-weight:800;background:#fff;border:1.5px solid #0b5ed7;border-radius:10px;padding:14px;margin:0 0 12px}
    .hold-confirmation .refs{margin-top:12px;font-size:.95rem}
    .hold-confirmation .refs ul{margin:6px 0 0;padding-left:18px}
    .hold-confirmation .refs li{margin:4px 0}
    .hold-form[hidden]{display:none!important}
    @media(max-width:620px){.hold-grid,.hold-grid-3{grid-template-columns:1fr}.hold-panel{padding:17px}.hold-question-row{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  const modal = buildModal();
  document.body.appendChild(modal.root);
  let currentItem = null;
  let opener = null;

  function buildModal() {
    const root = document.createElement('div');
    root.className = 'hold-overlay';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'hold-title');

    const stateHtml = US_STATES.map((s) => `<option value="${s}">${s}</option>`).join('');
    const questionsHtml = DELIVERY_QUESTIONS.map((q) => `
      <div class="hold-question-row" data-question-key="${q.key}">
        <label class="ynlabel">${q.label}</label>
        <span class="yesno">
          <label><input type="radio" name="hold-q-${q.key}" value="yes"> Yes</label>
          <label><input type="radio" name="hold-q-${q.key}" value="no"> No</label>
        </span>
      </div>`).join('');
    const photosHtml = PHOTO_PLACEHOLDERS.map((p) => `
      <div class="hold-photo-row" data-photo-key="${p.key}">
        <label for="hold-photo-${p.key}">${p.label}</label>
        <input type="file" accept="image/*" id="hold-photo-${p.key}" data-photo-key="${p.key}">
        <span class="photo-note">TEST placeholder — photos are not uploaded in this TEST flow.</span>
      </div>`).join('');

    root.innerHTML = `
      <div class="hold-panel">
        <button type="button" class="hold-close" aria-label="Close hold request">Close</button>

        <div class="hold-form">
          <h2 id="hold-title">Hold This Appliance — TEST</h2>
          <p class="hold-subtitle"></p>
          <div class="hold-notice"></div>
          <div class="hold-item"></div>

          <h3>Pickup or delivery</h3>
          <label class="hold-choice"><input type="radio" name="hold-fulfillment" value="pickup"> Pickup at The Electronics Depot</label>
          <label class="hold-choice"><input type="radio" name="hold-fulfillment" value="delivery"> Request delivery quote / access review</label>
          <div class="hold-disclosure hold-delivery-ref"></div>

          <div class="hold-delivery-panel" hidden>
            <h4>Delivery address</h4>
            <div class="hold-grid-3">
              <div class="hold-field"><label for="hold-addr">Street address</label><input id="hold-addr" maxlength="120" autocomplete="street-address"></div>
              <div class="hold-field"><label for="hold-apt">Apt / Unit</label><input id="hold-apt" maxlength="30"></div>
              <div class="hold-field"><label for="hold-city">City</label><input id="hold-city" maxlength="60" autocomplete="address-level2"></div>
            </div>
            <div class="hold-grid">
              <div class="hold-field"><label for="hold-state">State</label><select id="hold-state" autocomplete="address-level1"><option value="">—</option>${stateHtml}</select></div>
              <div class="hold-field"><label for="hold-zip">ZIP</label><input id="hold-zip" maxlength="10" inputmode="numeric" autocomplete="postal-code"></div>
            </div>

            <h4>Delivery questions</h4>
            ${questionsHtml}

            <h4>Required photo placeholders</h4>
            ${photosHtml}
          </div>

          <h3>Accessories / connection items</h3>
          <div class="hold-accessories"></div>
          <div class="hold-disclosure hold-included"></div>

          <h3>Warranty for this item</h3>
          <div class="hold-disclosure hold-warranty"></div>

          <h3>Your contact information</h3>
          <div class="hold-grid">
            <div class="hold-field"><label for="hold-name">Full name</label><input id="hold-name" maxlength="120" autocomplete="name"></div>
            <div class="hold-field"><label for="hold-phone">Phone</label><input id="hold-phone" maxlength="24" inputmode="tel" autocomplete="tel"></div>
          </div>

          <label class="hold-choice"><input type="checkbox" class="hold-ack"> I understand this is only a request for EDP to review and confirm. It is not a sale, payment, or guaranteed reservation.</label>
          <button type="button" class="hold-submit" disabled>Save TEST Hold Draft</button>
          <div class="hold-result" hidden></div>
        </div>

        <div class="hold-confirmation" hidden aria-live="polite">
          <h3>Hold request draft saved — TEST</h3>
          <p class="verbatim"></p>
          <p class="context"></p>
          <div class="refs"></div>
        </div>
      </div>`;

    const q = (sel) => root.querySelector(sel);
    const api = {
      root,
      panel: q('.hold-panel'),
      formView: q('.hold-form'),
      confirmation: q('.hold-confirmation'),
      confirmationVerbatim: q('.hold-confirmation .verbatim'),
      confirmationContext: q('.hold-confirmation .context'),
      confirmationRefs: q('.hold-confirmation .refs'),
      close: q('.hold-close'),
      subtitle: q('.hold-subtitle'),
      notice: q('.hold-notice'),
      item: q('.hold-item'),
      deliveryRef: q('.hold-delivery-ref'),
      deliveryPanel: q('.hold-delivery-panel'),
      addr: q('#hold-addr'),
      apt: q('#hold-apt'),
      city: q('#hold-city'),
      state: q('#hold-state'),
      zip: q('#hold-zip'),
      accessories: q('.hold-accessories'),
      included: q('.hold-included'),
      warranty: q('.hold-warranty'),
      name: q('#hold-name'),
      phone: q('#hold-phone'),
      ack: q('.hold-ack'),
      submit: q('.hold-submit'),
      result: q('.hold-result')
    };
    return api;
  }

  function pollibLink(key, linkText) {
    const lib = window.EDPPolicyLibrary;
    if (lib && typeof lib.createLink === 'function') {
      const el = lib.createLink(key, linkText);
      if (el) return el;
    }
    // Fallback: inert span so the modal remains usable if the library
    // did not load for any reason. Never duplicate policy text here.
    const span = document.createElement('span');
    span.textContent = linkText || `See ${key} policy`;
    return span;
  }

  function fillTopNotice() {
    modal.notice.textContent = '';
    const lead = document.createElement('span');
    lead.textContent = CONFIRMATION_SENTENCE + ' ';
    modal.notice.append(lead, pollibLink('customer_agreement', 'See the Customer Agreement policy.'));
  }

  function fillDeliveryRef() {
    modal.deliveryRef.textContent = '';
    const lead = document.createElement('span');
    lead.textContent =
      'Delivery is a separate service and may require access review and an ' +
      'approved quote. No delivery price is being promised in this TEST step. ';
    modal.deliveryRef.append(lead, pollibLink('delivery', 'See the Delivery policy.'));
  }

  function accessoryChoices(item) {
    const category = safeText(item.category).toLowerCase();
    const fuel = safeText(item.fuel_type).toLowerCase();
    const choices = [];
    if (category.includes('washer')) choices.push('Washer hoses / connection items');
    if (category.includes('dryer')) {
      choices.push('Dryer vent / venting item');
      if (!fuel.includes('gas')) choices.push('Electric dryer power cord / outlet compatibility review');
    }
    if ((category.includes('stove') || category.includes('range')) && !fuel.includes('gas')) {
      choices.push('Electric stove/range power cord / outlet compatibility review');
    }
    choices.push('Other accessory or connection-item question');
    return choices;
  }

  function renderAccessories(item) {
    modal.accessories.innerHTML = '';
    accessoryChoices(item).forEach((label, index) => {
      const row = document.createElement('label');
      row.className = 'hold-choice';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = label;
      input.dataset.accessoryIndex = String(index);
      row.appendChild(input);
      row.appendChild(document.createTextNode(` Ask EDP about: ${label}`));
      modal.accessories.appendChild(row);
    });
  }

  function inclusionMessage(item) {
    const category = safeText(item.category).toLowerCase();
    const fuel = safeText(item.fuel_type).toLowerCase();
    const price = Number(item.list_price);
    if ((category.includes('dryer') || category.includes('stove') || category.includes('range')) && !fuel.includes('gas')) {
      if (Number.isFinite(price) && price < 200) {
        return 'Power-cord disclosure: for an electric dryer or stove/range sold under $200, the power cord is not included. Other hoses, vents, cords, and accessories are not assumed included unless the approved item/sale record specifically says so.';
      }
      return 'Power-cord disclosure: a cord is not assumed included. At $200 or more, only a safe existing attached cord may be included when the approved sale/item record expressly says so. Outlet compatibility is not guaranteed. Other accessories also require confirmation.';
    }
    return 'Included accessories are not fully represented in the current public appliance feed. Hoses, vents, cords, hookup items, and other accessories are not assumed included; EDP must confirm what applies to this specific item before sale.';
  }

  function fillInclusion(item) {
    modal.included.textContent = '';
    const lead = document.createElement('span');
    lead.textContent = inclusionMessage(item) + ' ';
    modal.included.append(lead, pollibLink('service_options', 'See the Service Options policy.'));
  }

  function fillWarranty(item) {
    const warranty = cleanWarranty(item.warranty_tier);
    modal.warranty.textContent = '';
    const lead = document.createElement('span');
    lead.textContent = warranty
      ? `Current item-specific public record: ${warranty}. Final written sale record controls the warranty for this appliance. `
      : 'No approved item-specific warranty text is available in the current public record. EDP must confirm the applicable warranty before sale; this TEST flow does not infer a warranty from price. ';
    modal.warranty.append(lead, pollibLink('warranty', 'See the Warranty policy.'));
  }

  function openHold(item, sourceButton) {
    currentItem = item;
    opener = sourceButton || null;
    modal.subtitle.textContent = `${titleFor(item)}${item.item_id ? ` · Item ${safeText(item.item_id)}` : ''}`;
    modal.item.innerHTML = '';
    const id = document.createElement('div');
    id.className = 'hold-item-id';
    id.textContent = `Item ID: ${safeText(item.item_id) || 'Not available'}`;
    const details = document.createElement('div');
    details.textContent = [titleFor(item), formatPrice(item.list_price)].filter(Boolean).join(' · ');
    modal.item.append(id, details);
    fillTopNotice();
    fillDeliveryRef();
    renderAccessories(item);
    fillInclusion(item);
    fillWarranty(item);

    modal.root.querySelectorAll('input[type="radio"],input[type="checkbox"]').forEach((input) => { input.checked = false; });
    modal.root.querySelectorAll('input[type="text"],input[type="file"],input[inputmode],#hold-name,#hold-phone,#hold-addr,#hold-apt,#hold-city,#hold-zip').forEach((input) => {
      try { input.value = ''; } catch (_) { /* file inputs may refuse programmatic clear */ }
    });
    if (modal.state) modal.state.value = '';

    modal.deliveryPanel.hidden = true;
    modal.formView.hidden = false;
    modal.confirmation.hidden = true;
    modal.submit.disabled = true;
    modal.result.hidden = true;
    modal.result.textContent = '';
    modal.root.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => modal.close.focus(), 0);
  }

  function closeHold() {
    modal.root.hidden = true;
    document.body.style.overflow = '';
    currentItem = null;
    if (opener && typeof opener.focus === 'function') opener.focus();
    opener = null;
  }

  function normalizePhone(value) {
    let digits = safeText(value).replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
    return digits.length === 10 ? digits : '';
  }

  function selectedFulfillment() {
    const el = modal.root.querySelector('input[name="hold-fulfillment"]:checked');
    return el ? el.value : '';
  }

  function syncDeliveryPanel() {
    const isDelivery = selectedFulfillment() === 'delivery';
    modal.deliveryPanel.hidden = !isDelivery;
  }

  function allQuestionsAnswered() {
    return DELIVERY_QUESTIONS.every((q) => modal.root.querySelector(`input[name="hold-q-${q.key}"]:checked`));
  }

  function deliveryAddressComplete() {
    const zip = safeText(modal.zip && modal.zip.value).replace(/\D/g, '');
    return Boolean(
      safeText(modal.addr && modal.addr.value).trim().length >= 3 &&
      safeText(modal.city && modal.city.value).trim().length >= 2 &&
      modal.state && modal.state.value &&
      (zip.length === 5 || zip.length === 9)
    );
  }

  function validate() {
    const fulfillment = selectedFulfillment();
    const baseOk = Boolean(
      currentItem && currentItem.item_id &&
      modal.name.value.trim().length >= 2 &&
      normalizePhone(modal.phone.value) &&
      fulfillment && modal.ack.checked
    );
    const deliveryOk = fulfillment !== 'delivery' || (deliveryAddressComplete() && allQuestionsAnswered());
    modal.submit.disabled = !(baseOk && deliveryOk);
  }

  function collectQuestionAnswers() {
    const out = {};
    DELIVERY_QUESTIONS.forEach((q) => {
      const el = modal.root.querySelector(`input[name="hold-q-${q.key}"]:checked`);
      out[q.key] = el ? el.value : '';
    });
    return out;
  }

  function collectPhotoPlaceholders() {
    return PHOTO_PLACEHOLDERS.map((p) => {
      const input = modal.root.querySelector(`input[data-photo-key="${p.key}"]`);
      const file = input && input.files && input.files[0] ? input.files[0] : null;
      return {
        key: p.key,
        label: p.label,
        filename: file ? String(file.name).slice(0, 160) : '',
        size: file ? Number(file.size) || 0 : 0,
        uploaded: false
      };
    });
  }

  function renderConfirmationRefs(fulfillment) {
    modal.confirmationRefs.innerHTML = '';
    const title = document.createElement('div');
    title.innerHTML = '<strong>Policies that apply to this request</strong>';
    const list = document.createElement('ul');
    const keys = ['customer_agreement', 'warranty'];
    if (fulfillment === 'delivery') keys.push('delivery');
    keys.push('service_options');
    keys.push('forms');
    keys.forEach((key) => {
      const li = document.createElement('li');
      li.appendChild(pollibLink(key));
      list.appendChild(li);
    });
    modal.confirmationRefs.append(title, list);
  }

  function showConfirmation(draft, serverInfo) {
    modal.formView.hidden = true;
    modal.confirmation.hidden = false;
    modal.confirmationVerbatim.textContent = CONFIRMATION_SENTENCE;

    const parts = [];
    if (serverInfo && serverInfo.ok) {
      parts.push(`Your Hold Request ID is ${serverInfo.hold_id}.`);
      parts.push(`Recorded at ${serverInfo.hold_time}.`);
      parts.push(`Item ${draft.item_id}.`);
      if (draft.fulfillment === 'delivery') {
        parts.push('Delivery was selected; the delivery questionnaire and photo placeholders stayed in this browser only for the TEST build and were not sent to EDP in this request.');
      } else {
        parts.push('Pickup was selected.');
      }
    } else {
      parts.push(`Draft saved in this browser session only (TEST). Item ${draft.item_id}.`);
      if (serverInfo && serverInfo.error) {
        parts.push(`EDP could not record this request right now (${serverInfo.error}); the local draft is still in your browser. An Electronics Depot representative can be reached at 504-732-1233.`);
      } else {
        parts.push('EDP could not record this request right now; the local draft is still in your browser.');
      }
      if (draft.fulfillment === 'delivery') {
        parts.push('Delivery was selected; the delivery questionnaire and photo placeholders have been recorded in the draft only.');
      } else {
        parts.push('Pickup was selected.');
      }
    }
    modal.confirmationContext.textContent = parts.join(' ');
    renderConfirmationRefs(draft.fulfillment);
    modal.panel.scrollTop = 0;
  }

  async function submitDraftToServer(draft) {
    try {
      const response = await fetch('/api/hold-request', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'accept': 'application/json' },
        body: JSON.stringify({
          item_id: draft.item_id,
          customer_name: draft.customer_name,
          phone: draft.phone
        })
      });
      const result = await response.json().catch(() => null);
      if (response.ok && result && result.ok) {
        return { ok: true, hold_id: result.hold_id, hold_time: result.hold_time, status: result.status };
      }
      const safeError = result && result.error ? String(result.error).slice(0, 64) : 'unavailable';
      return { ok: false, error: safeError };
    } catch (_err) {
      return { ok: false, error: 'network' };
    }
  }

  async function saveDraft() {
    if (modal.submit.disabled || !currentItem) return;
    const fulfillment = selectedFulfillment();
    const accessories = Array.from(modal.accessories.querySelectorAll('input:checked')).map((input) => input.value);
    const deliveryBlock = fulfillment === 'delivery'
      ? {
          address: {
            street: safeText(modal.addr.value).trim().slice(0, 120),
            apt: safeText(modal.apt.value).trim().slice(0, 30),
            city: safeText(modal.city.value).trim().slice(0, 60),
            state: safeText(modal.state.value).trim().slice(0, 2),
            zip: safeText(modal.zip.value).replace(/\D/g, '').slice(0, 9)
          },
          questions: collectQuestionAnswers(),
          photo_placeholders: collectPhotoPlaceholders()
        }
      : null;

    const draft = {
      environment: 'TEST',
      state: 'SESSION_DRAFT_ONLY',
      item_id: safeText(currentItem.item_id),
      customer_name: modal.name.value.trim().slice(0, 120),
      phone: normalizePhone(modal.phone.value),
      fulfillment,
      accessory_questions: accessories,
      warranty_displayed: cleanWarranty(currentItem.warranty_tier),
      delivery: deliveryBlock,
      policy_library_revision: (window.EDPPolicyLibrary && window.EDPPolicyLibrary.revision) || '',
      created_at: new Date().toISOString()
    };
    try { sessionStorage.setItem(HOLD_DRAFT_KEY, JSON.stringify(draft)); } catch (_) { /* TEST draft may fail closed */ }

    // Preserve the frontend flow: the server call runs asynchronously
    // and the confirmation screen is shown immediately on error so the
    // customer always reaches the verbatim notice. The hold_id is
    // filled in once the server responds (or an error is displayed).
    modal.submit.disabled = true;
    showConfirmation(draft, { ok: false, pending: true });
    const serverInfo = await submitDraftToServer(draft);
    if (serverInfo && serverInfo.ok) {
      try {
        const updated = JSON.parse(sessionStorage.getItem(HOLD_DRAFT_KEY) || '{}');
        updated.state = 'SUBMITTED_TO_GATEWAY';
        updated.hold_id = serverInfo.hold_id;
        updated.hold_time = serverInfo.hold_time;
        updated.hold_status = serverInfo.status;
        sessionStorage.setItem(HOLD_DRAFT_KEY, JSON.stringify(updated));
      } catch (_) { /* best effort */ }
    }
    showConfirmation(draft, serverInfo);
  }

  function wireButtons() {
    if (!inventory.length) return;
    const cards = Array.from(document.querySelectorAll('#appliance-grid .appliance-card'));
    if (!cards.length) return;
    cards.forEach((card, index) => {
      if (card.querySelector('.hold-button')) return;
      const item = inventory[index];
      if (!item || !item.item_id) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hold-button';
      button.textContent = 'Hold This Appliance';
      button.setAttribute('aria-label', `Hold ${titleFor(item)} for EDP review`);
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openHold(item, button);
      });
      const body = card.querySelector('.appliance-body') || card;
      body.appendChild(button);
    });
    wired = cards.some((card) => card.querySelector('.hold-button'));
  }

  async function loadInventoryForHold() {
    try {
      const response = await fetch('/api/appliances', { headers: { accept: 'application/json' } });
      const result = await response.json();
      if (!result || !result.ok || !Array.isArray(result.data)) return;
      inventory = result.data;
      wireButtons();
      if (!wired) {
        const grid = document.getElementById('appliance-grid');
        if (grid) {
          const observer = new MutationObserver(() => {
            wireButtons();
            if (wired) observer.disconnect();
          });
          observer.observe(grid, { childList: true });
        }
      }
    } catch (_) { /* Fail closed: browse remains usable without hold draft. */ }
  }

  modal.close.addEventListener('click', closeHold);
  modal.root.addEventListener('click', (event) => { if (event.target === modal.root) closeHold(); });
  modal.panel.addEventListener('input', validate);
  modal.panel.addEventListener('change', (event) => {
    if (event.target && event.target.name === 'hold-fulfillment') syncDeliveryPanel();
    validate();
  });
  modal.submit.addEventListener('click', saveDraft);
  document.addEventListener('keydown', (event) => {
    if (!modal.root.hidden && event.key === 'Escape') {
      event.preventDefault();
      closeHold();
    }
  });

  // Test hook: expose a small introspection surface so JSDOM harnesses
  // can open the modal with a synthetic item. Never used by UI code.
  window.__EDPHoldInternals = {
    open: (item) => openHold(item, null),
    close: closeHold,
    validate,
    syncDeliveryPanel,
    saveDraft,
    submitDraftToServer,
    showConfirmation,
    DELIVERY_QUESTIONS,
    PHOTO_PLACEHOLDERS,
    CONFIRMATION_SENTENCE
  };

  let acknowledged = false;
  try { acknowledged = Boolean(sessionStorage.getItem(POLICY_ACK_KEY)); } catch (_) { acknowledged = false; }
  if (acknowledged) loadInventoryForHold();
  else document.addEventListener('edp:policy-acknowledged', loadInventoryForHold, { once: true });
})();
