(() => {
  const form = document.getElementById('sms-consent-form');
  const button = document.getElementById('sms-consent-submit');
  const status = document.getElementById('sms-consent-status');
  const checkbox = form && form.elements.sms_consent;

  if (!form || !button || !status || !checkbox) return;

  const setStatus = (message, state = '') => {
    status.textContent = message;
    status.dataset.state = state;
  };

  async function checkGateway() {
    try {
      const response = await fetch('/api/sms-consent/status', { headers: { accept: 'application/json' } });
      const result = await response.json();
      if (result.ready === true && result.environment === 'TEST') {
        button.disabled = false;
        button.removeAttribute('aria-disabled');
        button.textContent = 'Submit SMS Opt-In — TEST';
        setStatus('TEST consent storage is connected. Submit only test information during this phase.', 'ready');
        return;
      }
    } catch (_err) {
      // Keep the safe disabled state below.
    }

    button.disabled = true;
    button.setAttribute('aria-disabled', 'true');
    button.textContent = 'TEST ONLY — STORAGE NOT CONNECTED';
    setStatus('Permanent SMS-consent storage is not connected yet. No information can be submitted.', 'disabled');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (button.disabled) return;

    const customerName = String(form.elements.name.value || '').trim();
    const mobileNumber = String(form.elements.phone.value || '').trim();

    if (!mobileNumber) {
      setStatus('Enter a mobile number before submitting.', 'error');
      form.elements.phone.focus();
      return;
    }

    if (!checkbox.checked) {
      setStatus('Check the optional SMS consent box only if you want to opt in to text updates.', 'error');
      checkbox.focus();
      return;
    }

    button.disabled = true;
    button.textContent = 'Submitting TEST opt-in…';
    setStatus('Recording TEST consent…', 'working');

    try {
      const response = await fetch('/api/sms-consent', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json'
        },
        body: JSON.stringify({
          customer_name: customerName,
          mobile_number: mobileNumber,
          sms_consent: true
        })
      });

      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'submission_failed');
      }

      setStatus(`TEST consent recorded. ID: ${result.consent_id}. Time: ${result.timestamp}.`, 'success');
      form.reset();
    } catch (err) {
      const code = err && err.message ? err.message : 'unknown_error';
      setStatus(`TEST diagnostic: ${code}. The opt-in was not recorded.`, 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Submit SMS Opt-In — TEST';
    }
  });

  checkGateway();
})();
