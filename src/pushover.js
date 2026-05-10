const PUSHOVER_URL = 'https://api.pushover.net/1/messages.json';

export async function sendPush(message, title) {
  if (!process.env.PUSHOVER_APP_TOKEN || !process.env.PUSHOVER_USER_KEY) {
    console.warn('[push] missing env vars, skipping');
    return;
  }
  try {
    const res = await fetch(PUSHOVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token: process.env.PUSHOVER_APP_TOKEN,
        user: process.env.PUSHOVER_USER_KEY,
        message,
        title: title || 'EDP Receptionist',
      }),
    });
    if (!res.ok) console.error('[push] failed:', res.status);
  } catch (err) {
    console.error('[push] error:', err.message);
  }
}
