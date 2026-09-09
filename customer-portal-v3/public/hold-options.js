(() => {
  const HOLD_DRAFT_KEY = 'edp.portal.v3.holdDraft';
  const POLICY_ACK_KEY = 'edp.portal.v3.policyAck';
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
    .hold-panel{width:min(720px,100%);max-height:92vh;overflow:auto;background:#fff;color:#152033;border-radius:16px;padding:22px;box-shadow:0 24px 70px rgba(0,0,0,.35)}
    .hold-panel h2{margin:0 0 6px}.hold-panel h3{margin:22px 0 8px}.hold-close{float:right;border:1px solid #c8d0db;background:#fff;border-radius:8px;padding:8px 12px;cursor:pointer}
    .hold-notice{background:#eef5ff;border:2px solid #0b5ed7;border-radius:12px;padding:14px;margin:14px 0;font-weight:700}
    .hold-item{background:#f7f8fa;border-radius:10px;padding:12px;margin:12px 0}.hold-item-id{font-weight:800}
    .hold-choice{display:block;border:1px solid #d7dce3;border-radius:10px;padding:11px 12px;margin:8px 0}.hold-choice input{margin-right:8px}
    .hold-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.hold-field label{display:block;font-weight:700;margin-bottom:5px}.hold-field input{box-sizing:border-box;width:100%;padding:11px;border:1px solid #aeb7c2;border-radius:8px;font:inherit}
    .hold-disclosure{font-size:.95rem;line-height:1.5;background:#fff8e8;border:1px solid #e5c469;border-radius:10px;padding:12px;margin:12px 0}
    .hold-submit{width:100%;margin-top:15px;border:0;border-radius:10px;padding:13px 16px;background:#0b5ed7;color:#fff;font:inherit;font-weight:800;cursor:pointer}.hold-submit:disabled{background:#9aa4b2;cursor:not-allowed}
    .hold-result{margin-top:12px;border-radius:10px;padding:12px;background:#eef8ef;border:1px solid #8abd91;font-weight:700}
    @media(max-width:620px){.hold-grid{grid-template-columns:1fr}.hold-panel{padding:17px}}
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
    root.innerHTML = `
      <div class="hold-panel">
        <button type="button" class="hold-close" aria-label="Close hold request">Close</button>
        <h2 id="hold-title">Hold This Appliance — TEST</h2>
        <p class="hold-subtitle"></p>
        <div class="hold-notice">This is a hold request only. It is not a completed purchase, does not take payment, and does not guarantee the appliance is reserved until EDP confirms it.</div>
        <div class="hold-item"></div>
        <h3>Pickup or delivery</h3>
        <label class="hold-choice"><input type="radio" name="hold-fulfillment" value="pickup"> Pickup at The Electronics Depot</label>
        <label class="hold-choice"><input type="radio" name="hold-fulfillment" value="delivery"> Request delivery quote / access review</label>
        <div class="hold-disclosure">Delivery is a separate service and may require access review and an approved quote. No delivery price is being promised in this TEST step.</div>
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
      </div>`;
    return {
      root,
      panel: root.querySelector('.hold-panel'),
      close: root.querySelector('.hold-close'),
      subtitle: root.querySelector('.hold-subtitle'),
      item: root.querySelector('.hold-item'),
      accessories: root.querySelector('.hold-accessories'),
      included: root.querySelector('.hold-included'),
      warranty: root.querySelector('.hold-warranty'),
      name: root.querySelector('#hold-name'),
      phone: root.querySelector('#hold-phone'),
      ack: root.querySelector('.hold-ack'),
      submit: root.querySelector('.hold-submit'),
      result: root.querySelector('.hold-result')
    };
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

  function openHold(item, sourceButton) {
    currentItem = item;
    opener = sourceButton || null;
    const warranty = cleanWarranty(item.warranty_tier);
    modal.subtitle.textContent = `${titleFor(item)}${item.item_id ? ` · Item ${safeText(item.item_id)}` : ''}`;
    modal.item.innerHTML = '';
    const id = document.createElement('div');
    id.className = 'hold-item-id';
    id.textContent = `Item ID: ${safeText(item.item_id) || 'Not available'}`;
    const details = document.createElement('div');
    details.textContent = [titleFor(item), formatPrice(item.list_price)].filter(Boolean).join(' · ');
    modal.item.append(id, details);
    renderAccessories(item);
    modal.included.textContent = inclusionMessage(item);
    modal.warranty.textContent = warranty
      ? `Current item-specific public record: ${warranty}. Final written sale record controls the warranty for this appliance.`
      : 'No approved item-specific warranty text is available in the current public record. EDP must confirm the applicable warranty before sale; this TEST flow does not infer a warranty from price.';
    modal.root.querySelectorAll('input[type="radio"],input[type="checkbox"]').forEach((input) => { input.checked = false; });
    modal.name.value = '';
    modal.phone.value = '';
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

  function validate() {
    const fulfillment = modal.root.querySelector('input[name="hold-fulfillment"]:checked');
    const ok = Boolean(
      currentItem && currentItem.item_id &&
      modal.name.value.trim().length >= 2 &&
      normalizePhone(modal.phone.value) &&
      fulfillment && modal.ack.checked
    );
    modal.submit.disabled = !ok;
  }

  function saveDraft() {
    if (modal.submit.disabled || !currentItem) return;
    const fulfillment = modal.root.querySelector('input[name="hold-fulfillment"]:checked');
    const accessories = Array.from(modal.accessories.querySelectorAll('input:checked')).map((input) => input.value);
    const draft = {
      environment: 'TEST',
      state: 'SESSION_DRAFT_ONLY',
      item_id: safeText(currentItem.item_id),
      customer_name: modal.name.value.trim().slice(0, 120),
      phone: normalizePhone(modal.phone.value),
      fulfillment: fulfillment ? fulfillment.value : '',
      accessory_questions: accessories,
      warranty_displayed: cleanWarranty(currentItem.warranty_tier),
      created_at: new Date().toISOString()
    };
    try { sessionStorage.setItem(HOLD_DRAFT_KEY, JSON.stringify(draft)); } catch (_) { /* TEST draft may fail closed */ }
    modal.result.textContent = 'TEST draft saved in this browser session only. Nothing has been written to EDP CUSTOMER_HOLDS, no payment was taken, and the appliance is not reserved yet.';
    modal.result.hidden = false;
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
  modal.panel.addEventListener('change', validate);
  modal.submit.addEventListener('click', saveDraft);
  document.addEventListener('keydown', (event) => {
    if (!modal.root.hidden && event.key === 'Escape') {
      event.preventDefault();
      closeHold();
    }
  });

  let acknowledged = false;
  try { acknowledged = Boolean(sessionStorage.getItem(POLICY_ACK_KEY)); } catch (_) { acknowledged = false; }
  if (acknowledged) loadInventoryForHold();
  else document.addEventListener('edp:policy-acknowledged', loadInventoryForHold, { once: true });
})();
