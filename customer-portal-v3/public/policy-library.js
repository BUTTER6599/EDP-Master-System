/* EDP Customer Portal V3 — Policy Library (TEST ONLY)
 *
 * Single source of truth for named customer policies referenced across
 * the portal. Loaded before any component that references policies.
 *
 * All policy text in this file is a TEST PLACEHOLDER. Final wording is
 * under EDP review. Do NOT duplicate this text elsewhere in the portal;
 * other components must call window.EDPPolicyLibrary to render links
 * or open the viewer.
 */
(() => {
  'use strict';

  if (window.EDPPolicyLibrary) return;

  const REVISION = 'TEST-DRAFT-2026-10-02';
  const PLACEHOLDER_NOTE =
    'This policy wording is a TEST PLACEHOLDER and is still under EDP review. ' +
    'It is shown here only so the portal flow can be tested end-to-end. ' +
    'It is not final, is not legally operative, and will be replaced with the ' +
    'approved customer-facing wording before any live launch.';

  const policies = {
    customer_agreement: {
      key: 'customer_agreement',
      label: 'Customer Agreement',
      revision: REVISION,
      placeholder: true,
      summary:
        'How a hold request becomes an actual sale, what the customer and ' +
        'The Electronics Depot each agree to, and what happens if an item ' +
        'cannot be confirmed.',
      body: [
        'A hold request is a request only. It is not a completed purchase. ',
        'A sale happens only after an Electronics Depot representative ',
        'confirms the appliance is available and the customer accepts the ',
        'final price and terms in writing.',
        'The customer agrees that information submitted through the portal ',
        'is used by The Electronics Depot to review the request and contact ',
        'the customer. The customer may be asked to confirm identity or ',
        'provide additional information before a sale is finalized.',
        'The Electronics Depot may decline, cancel, or adjust a hold ',
        'request before a sale is finalized if the item is unavailable, ',
        'has an undisclosed issue, or the request cannot be verified.'
      ]
    },
    warranty: {
      key: 'warranty',
      label: 'Warranty',
      revision: REVISION,
      placeholder: true,
      summary:
        'What warranty, if any, applies to each appliance, and what the ' +
        'customer should expect if a covered issue occurs.',
      body: [
        'The warranty that applies to a specific appliance is set in the ',
        'final written sale record for that appliance, not in the public ',
        'listing or in the hold request. The listing may show a current ',
        'description, but the written sale record controls.',
        'Where an appliance is sold with no warranty, that must be stated ',
        'in the written sale record. The customer should read the written ',
        'sale record before completing a purchase.',
        'Warranty service may require the customer to bring the appliance ',
        'to The Electronics Depot or to allow access for inspection. ',
        'Specific coverage terms are described in the written sale record.'
      ]
    },
    delivery: {
      key: 'delivery',
      label: 'Delivery',
      revision: REVISION,
      placeholder: true,
      summary:
        'How delivery requests are reviewed, how an access review and ' +
        'quote work, and what the customer agrees to about the delivery ' +
        'location.',
      body: [
        'Delivery is a separate service from the appliance sale. A hold ',
        'request that selects delivery is a request to review the ',
        'customer\'s delivery location and provide a delivery quote. It ',
        'does not promise a delivery price, a delivery date, or that the ',
        'location can be served.',
        'The customer agrees to provide an accurate address and to answer ',
        'the delivery questions truthfully. If the location requires ',
        'special access (stairs, narrow doorways, apartment buildings), ',
        'the customer must disclose that in the questionnaire so The ',
        'Electronics Depot can review it.',
        'Photos submitted with a delivery request are used only to review ',
        'the delivery path and to prepare for a safe delivery. Final ',
        'delivery arrangements and any delivery fee are confirmed by The ',
        'Electronics Depot in writing before the delivery is scheduled.'
      ]
    },
    service_options: {
      key: 'service_options',
      label: 'Service Options',
      revision: REVISION,
      placeholder: true,
      summary:
        'The service options The Electronics Depot offers around an ' +
        'appliance sale, including repair, installation help, and pickup.',
      body: [
        'The Electronics Depot offers service options such as appliance ',
        'repair, pickup, delivery, and warranty support. The specific ',
        'options available for a given appliance or location are confirmed ',
        'by The Electronics Depot after the hold request is reviewed.',
        'Not every service is available for every appliance or every ',
        'location. Service options are not promised in the public listing ',
        'or in the hold request alone.',
        'Pricing for service options, when applicable, is confirmed in ',
        'writing before the service is scheduled.'
      ]
    },
    forms: {
      key: 'forms',
      label: 'Forms',
      revision: REVISION,
      placeholder: true,
      summary:
        'What information the customer provides on portal forms, how it ' +
        'is used, and how long it is kept.',
      body: [
        'Information the customer enters in portal forms (such as name, ',
        'phone, delivery address, and delivery questionnaire answers) is ',
        'used only by The Electronics Depot to review and respond to the ',
        'customer\'s request.',
        'The customer should enter accurate information. The Electronics ',
        'Depot may ask the customer to confirm the information before ',
        'finalizing a sale or scheduling a service.',
        'Information submitted through the portal is kept for the amount ',
        'of time needed to review the request, to complete any sale that ',
        'follows, and to meet record-keeping obligations.'
      ]
    },
    shopify_terms: {
      key: 'shopify_terms',
      label: 'Shopify Terms',
      revision: REVISION,
      placeholder: true,
      summary:
        'The terms that apply when the customer continues to a Shopify ' +
        'storefront or completes a transaction powered by Shopify.',
      body: [
        'Some parts of the customer experience may be powered by Shopify. ',
        'When the customer continues to a Shopify-powered page or ',
        'completes a transaction powered by Shopify, Shopify\'s own terms ',
        'and policies apply in addition to The Electronics Depot\'s ',
        'policies.',
        'The Electronics Depot is responsible for the appliance sale, the ',
        'customer-service workflow, and the information displayed on this ',
        'portal. Shopify is responsible for the specific payment and ',
        'storefront software it provides.',
        'The customer should read Shopify\'s terms before completing any ',
        'transaction on a Shopify-powered page.'
      ]
    },
    shopify_privacy_sms: {
      key: 'shopify_privacy_sms',
      label: 'Shopify Privacy & SMS',
      revision: REVISION,
      placeholder: true,
      summary:
        'How privacy and SMS messaging are handled on Shopify-powered ' +
        'portions of the customer experience.',
      body: [
        'Privacy on Shopify-powered portions of the customer experience ',
        'is handled according to Shopify\'s own privacy policy, which the ',
        'customer should read before providing information on a ',
        'Shopify-powered page.',
        'If the customer opts in to SMS updates through a Shopify-powered ',
        'page, the SMS program and the customer\'s SMS consent are ',
        'handled according to the SMS terms shown at the time of opt-in. ',
        'The customer may opt out of SMS at any time by following the ',
        'instructions in the SMS messages.',
        'The Electronics Depot\'s own SMS consent flow is separate and is ',
        'linked from the portal footer. The customer should read the SMS ',
        'terms before opting in to either program.'
      ]
    }
  };

  const styles = document.createElement('style');
  styles.textContent = `
    .edp-pollib-link{color:#0b5ed7;font-weight:800;text-decoration:underline;cursor:pointer;background:none;border:0;padding:0;font:inherit}
    .edp-pollib-link:hover,.edp-pollib-link:focus{color:#083a94;outline:0}
    .edp-pollib-badge{display:inline-block;font-size:.72rem;font-weight:900;letter-spacing:.08em;padding:2px 6px;border-radius:5px;background:#fff3cd;color:#5c4300;border:1px solid #e5c469;margin-left:6px;vertical-align:middle}
    .edp-pollib-overlay[hidden]{display:none!important}
    .edp-pollib-overlay{position:fixed;inset:0;z-index:1500;background:rgba(0,0,0,.68);display:grid;place-items:center;padding:18px}
    .edp-pollib-panel{width:min(760px,100%);max-height:92vh;overflow:auto;background:#fff;color:#152033;border-radius:16px;padding:22px;box-shadow:0 24px 70px rgba(0,0,0,.4)}
    .edp-pollib-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:4px}
    .edp-pollib-head h2{margin:0;font-size:1.4rem}
    .edp-pollib-head .meta{font-size:.85rem;color:#5a6677;font-weight:650;margin-top:4px}
    .edp-pollib-close{border:1px solid #c8d0db;background:#fff;border-radius:8px;padding:8px 12px;cursor:pointer;font:inherit;font-weight:700}
    .edp-pollib-close:hover,.edp-pollib-close:focus{background:#eef2f7}
    .edp-pollib-placeholder-note{background:#fff8e8;border:1px solid #e5c469;border-radius:10px;padding:12px;margin:12px 0;font-weight:700;font-size:.95rem;line-height:1.5}
    .edp-pollib-summary{background:#eef5ff;border:1px solid #b3cbf5;border-radius:10px;padding:12px;margin:12px 0;font-weight:600;line-height:1.55}
    .edp-pollib-body p{margin:0 0 12px;line-height:1.6}
    .edp-pollib-footer{margin-top:16px;display:flex;justify-content:flex-end;gap:10px}
    .edp-pollib-footer .edp-pollib-dismiss{border:0;border-radius:10px;padding:11px 18px;background:#0b5ed7;color:#fff;font:inherit;font-weight:800;cursor:pointer}
    .edp-pollib-footer .edp-pollib-dismiss:hover,.edp-pollib-footer .edp-pollib-dismiss:focus{filter:brightness(.94)}
    @media(max-width:620px){.edp-pollib-panel{padding:17px}}
  `;
  document.head.appendChild(styles);

  const overlay = document.createElement('div');
  overlay.className = 'edp-pollib-overlay';
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'edp-pollib-title');
  overlay.innerHTML = `
    <div class="edp-pollib-panel">
      <div class="edp-pollib-head">
        <div>
          <h2 id="edp-pollib-title"></h2>
          <div class="meta"></div>
        </div>
        <button type="button" class="edp-pollib-close" aria-label="Close policy viewer">Close</button>
      </div>
      <div class="edp-pollib-placeholder-note" hidden></div>
      <div class="edp-pollib-summary"></div>
      <div class="edp-pollib-body"></div>
      <div class="edp-pollib-footer">
        <button type="button" class="edp-pollib-dismiss">I’m done reading</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const titleEl = overlay.querySelector('#edp-pollib-title');
  const metaEl = overlay.querySelector('.edp-pollib-head .meta');
  const placeholderEl = overlay.querySelector('.edp-pollib-placeholder-note');
  const summaryEl = overlay.querySelector('.edp-pollib-summary');
  const bodyEl = overlay.querySelector('.edp-pollib-body');
  const closeBtn = overlay.querySelector('.edp-pollib-close');
  const dismissBtn = overlay.querySelector('.edp-pollib-dismiss');

  let lastOpener = null;

  function textOf(parts) {
    return Array.isArray(parts) ? parts.join('\n\n') : String(parts == null ? '' : parts);
  }

  function openModal(key, options) {
    const policy = policies[key];
    if (!policy) return false;
    const opener = (options && options.opener) || null;
    lastOpener = opener;

    titleEl.textContent = policy.label;
    metaEl.textContent = `Revision ${policy.revision}${policy.placeholder ? ' · Placeholder wording' : ''}`;
    if (policy.placeholder) {
      placeholderEl.textContent = PLACEHOLDER_NOTE;
      placeholderEl.hidden = false;
    } else {
      placeholderEl.hidden = true;
      placeholderEl.textContent = '';
    }
    summaryEl.textContent = textOf(policy.summary);
    bodyEl.innerHTML = '';
    (policy.body || []).forEach((paragraph) => {
      const p = document.createElement('p');
      p.textContent = String(paragraph);
      bodyEl.appendChild(p);
    });

    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => closeBtn.focus(), 0);
    return true;
  }

  function closeModal() {
    overlay.hidden = true;
    document.body.style.overflow = '';
    if (lastOpener && typeof lastOpener.focus === 'function') lastOpener.focus();
    lastOpener = null;
  }

  closeBtn.addEventListener('click', closeModal);
  dismissBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeModal();
  });
  document.addEventListener('keydown', (event) => {
    if (!overlay.hidden && event.key === 'Escape') {
      event.preventDefault();
      closeModal();
    }
  });

  function createLink(key, linkText) {
    const policy = policies[key];
    if (!policy) return null;
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'edp-pollib-link';
    link.textContent = linkText || `See ${policy.label} policy`;
    link.setAttribute('data-policy-key', key);
    link.setAttribute('aria-haspopup', 'dialog');
    link.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openModal(key, { opener: link });
    });
    return link;
  }

  function get(key) {
    const policy = policies[key];
    if (!policy) return null;
    return {
      key: policy.key,
      label: policy.label,
      revision: policy.revision,
      placeholder: policy.placeholder,
      summary: textOf(policy.summary),
      body: Array.isArray(policy.body) ? policy.body.slice() : []
    };
  }

  window.EDPPolicyLibrary = Object.freeze({
    get,
    has: (key) => Object.prototype.hasOwnProperty.call(policies, key),
    keys: () => Object.keys(policies),
    openModal,
    closeModal,
    createLink,
    revision: REVISION,
    placeholderNote: PLACEHOLDER_NOTE
  });
})();
