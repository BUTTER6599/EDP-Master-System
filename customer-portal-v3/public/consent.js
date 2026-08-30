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

  const getEnvironment = () => String(form.dataset.environment || '').toUpperCase();
  const isTestEnvironment = () => getEnvironment() === 'TEST';
  const submitLabel = () => isTestEnvironment() ? 'Submit SMS Opt-In — TEST' : 'Submit SMS Opt-In';

  async function checkGateway() {
    try {
      const response = await fetch('/api/sms-consent/status', { headers: { accept: 'application/json' } });
      const result = await response.json();
      const environment = String(result.environment || '').toUpperCase();
      if (result.ready === true && (environment === 'TEST' || environment === 'LIVE')) {
        form.dataset.environment = environment;
        button.disabled = false;
        button.removeAttribute('aria-disabled');
        button.textContent = submitLabel();
        if (environment === 'TEST') {
          setStatus('TEST consent storage is connected. Submit only test information during this phase.', 'ready');
        } else {
          setStatus('SMS consent storage is connected. You may submit your opt-in.', 'ready');
        }
        return;
      }
    } catch (_err) {
      // Keep the safe disabled state below.
    }

    form.dataset.environment = '';
    button.disabled = true;
    button.setAttribute('aria-disabled', 'true');
    button.textContent = 'SMS STORAGE NOT CONNECTED';
    setStatus('SMS-consent storage is not connected yet. No information can be submitted.', 'disabled');
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

    const testMode = isTestEnvironment();
    button.disabled = true;
    button.textContent = testMode ? 'Submitting TEST opt-in…' : 'Submitting opt-in…';
    setStatus(testMode ? 'Recording TEST consent…' : 'Recording consent…', 'working');

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

      setStatus(`${testMode ? 'TEST consent' : 'Consent'} recorded. ID: ${result.consent_id}. Time: ${result.timestamp}.`, 'success');
      form.reset();
    } catch (_err) {
      setStatus(testMode ? 'The TEST opt-in could not be recorded. Please try again after the connection is verified.' : 'The opt-in could not be recorded. Please try again after the connection is verified.', 'error');
    } finally {
      button.disabled = false;
      button.textContent = submitLabel();
    }
  });

  checkGateway();
})();
