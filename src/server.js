import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import Anthropic from '@anthropic-ai/sdk';
import { getAgent, agents } from './agents.js';
import { sendPush } from './pushover.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const PUBLIC_HOST = process.env.PUBLIC_HOST;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY');
  process.exit(1);
}
if (!PUBLIC_HOST) {
  console.error('Missing PUBLIC_HOST (e.g. your-app.up.railway.app)');
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

let dashboardState = {
  cashProtection: null,
};

app.get('/', (_req, res) => res.send('EDP AI Receptionist running'));

app.get('/dashboard', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'Dashboard.html'));
});

app.get('/api/dashboard', (_req, res) => {
  res.json(dashboardState);
});

app.post('/twilio/voice', (req, res) => {
  const agentKey = req.query.agent || process.env.DEFAULT_AGENT || 'brian';
  const agent = getAgent(agentKey) || agents.brian;
  const wsUrl = `wss://${PUBLIC_HOST}/voice?agent=${encodeURIComponent(agentKey)}`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <ConversationRelay
      url="${wsUrl}"
      welcomeGreeting="${escapeXml(agent.greeting)}"
      voice="${agent.voice}"
      ttsProvider="${agent.ttsProvider}"
      language="${agent.language}" />
  </Connect>
</Response>`;

  res.type('text/xml').send(twiml);
});

const VOICE_PICKER_MAP = {
  '1': { voice: 'Google.en-US-Wavenet-J', name: "Wavenet J, Brian's current voice" },
  '2': { voice: 'Google.en-US-Polyglot-1', name: 'Polyglot One, mature US male' },
  '3': { voice: 'Google.en-GB-Wavenet-B', name: 'British Wavenet B, male' },
  '4': { voice: 'Google.en-GB-Wavenet-D', name: 'British Wavenet D, male alt' },
  '5': { voice: 'Google.en-AU-Wavenet-B', name: 'Australian Wavenet B, male' },
  '6': { voice: 'Google.en-AU-Wavenet-D', name: 'Australian Wavenet D, male alt' },
  '7': { voice: 'Google.en-IN-Wavenet-B', name: 'Indian English Wavenet B, male' },
  '8': { voice: 'Google.en-IN-Wavenet-C', name: 'Indian English Wavenet C, male alt' },
  '9': { voice: 'Google.en-US-Wavenet-I', name: 'Wavenet I, US male alt' },
  '0': { voice: 'Google.en-GB-Neural2-B', name: 'British Neural Two B, male' },
};

const VOICE_PICKER_SAMPLE = "Thanks for calling The Electronics Depot. This is your AI receptionist. We have top-load washers from Whirlpool, Maytag, GE, and Kenmore in stock right now. Prices run two sixty-five to three ninety-five. What can I help you find?";

function voicePickerMenuTwiml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="/twilio/voice-picker-play" method="POST" timeout="10">
    <Say voice="Google.en-US-Neural2-D">Welcome to the Electronics Depot voice picker. Press 1 for Wavenet J, Brian's current voice. Press 2 for Polyglot One, mature US male. Press 3 for British Wavenet B. Press 4 for British Wavenet D. Press 5 for Australian Wavenet B. Press 6 for Australian Wavenet D. Press 7 for Indian English Wavenet B. Press 8 for Indian English Wavenet C. Press 9 for Wavenet I, US male alt. Press 0 for British Neural Two B. Press a digit now.</Say>
  </Gather>
  <Redirect>/twilio/voice-picker</Redirect>
</Response>`;
}

app.all('/twilio/voice-picker', (_req, res) => {
  res.type('text/xml').send(voicePickerMenuTwiml());
});

app.post('/twilio/voice-picker-play', (req, res) => {
  const digit = (req.body && req.body.Digits) ? String(req.body.Digits).trim() : '';
  const choice = VOICE_PICKER_MAP[digit];

  if (!choice) {
    res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect>/twilio/voice-picker</Redirect>
</Response>`);
    return;
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${choice.voice}">${escapeXml(VOICE_PICKER_SAMPLE)}</Say>
  <Say voice="Google.en-US-Neural2-D">That was voice ${escapeXml(choice.name)}. Press another digit to hear a different voice, or hang up to end.</Say>
  <Gather numDigits="1" action="/twilio/voice-picker-play" method="POST" timeout="10">
    <Say voice="Google.en-US-Neural2-D">Press a digit.</Say>
  </Gather>
  <Redirect>/twilio/voice-picker</Redirect>
</Response>`;

  res.type('text/xml').send(twiml);
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/voice' });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const initialAgentKey = url.searchParams.get('agent') || process.env.DEFAULT_AGENT || 'brian';

  let agent = getAgent(initialAgentKey) || agents.brian;
  let history = [];
  let callSid = null;
  let from = null;
  const callStartTime = Date.now();

  console.log(`[ws] connected agent=${agent.name}`);

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === 'setup') {
      callSid = msg.callSid;
      from = msg.from;
      console.log(`[setup] callSid=${callSid} from=${from}`);
      const time = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(new Date());
      sendPush(`📞 Incoming call from ${from}\nAgent: ${agent.name}\nTime: ${time} CT`);
      return;
    }

    if (msg.type === 'prompt') {
      const userText = msg.voicePrompt;
      if (!userText) return;

      console.log(`[${agent.name}] user: ${userText}`);
      history.push({ role: 'user', content: userText });

      try {
        const reply = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          system: agent.systemPrompt,
          messages: history,
        });

        const rawText = reply.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join(' ')
          .trim();

        if (!rawText) return;

        const intakeMatch = rawText.match(/\[INTAKE:(SALES|REPAIR|SELL|GENERAL)\]/);
        const intakeType = intakeMatch ? intakeMatch[1] : null;
        const shouldHangup = rawText.includes('[HANGUP]');

        const text = rawText
          .replace(/\[INTAKE:(?:SALES|REPAIR|SELL|GENERAL)\]/g, '')
          .replace(/\[HANGUP\]/g, '')
          .trim();

        if (!text) return;

        const tokens = [intakeType && `[INTAKE:${intakeType}]`, shouldHangup && '[HANGUP]']
          .filter(Boolean)
          .join(' ');
        console.log(`[${agent.name}] reply: ${text}${tokens ? ' ' + tokens : ''}`);
        history.push({ role: 'assistant', content: text });

        ws.send(JSON.stringify({ type: 'text', token: text, last: true }));

        if (intakeType) {
          summarizeAndPushIntake(intakeType, history.slice(), from);
        }

        if (shouldHangup) {
          console.log('[hangup] ending call');
          ws.send(JSON.stringify({ type: 'end', handoffData: JSON.stringify({ reason: 'completed' }) }));
        }
      } catch (err) {
        console.error('[claude error]', err);
        ws.send(JSON.stringify({
          type: 'text',
          token: "Sorry, I'm having a little trouble right now. Could you give me just a moment?",
          last: true,
        }));
      }
      return;
    }

    if (msg.type === 'interrupt') {
      console.log('[interrupt]');
      return;
    }

    if (msg.type === 'error') {
      console.error('[twilio error]', msg);
    }
  });

  ws.on('close', async () => {
    console.log(`[ws] closed callSid=${callSid} from=${from} finalAgent=${agent.name}`);

    const totalSec = Math.round((Date.now() - callStartTime) / 1000);
    const durationStr = `${Math.floor(totalSec / 60)}m ${totalSec % 60}s`;

    let summary = null;
    if (history.length > 0) {
      try {
        const transcript = history
          .map((m) => `${m.role === 'user' ? 'Caller' : 'Brian'}: ${m.content}`)
          .join('\n');
        const summaryReply = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 120,
          system: 'Summarize this phone call in ONE sentence: who was it, what they wanted, any action items. Be concise.',
          messages: [{ role: 'user', content: transcript }],
        });
        summary = summaryReply.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join(' ')
          .trim() || null;
      } catch (err) {
        console.error('[summary error]', err.message);
      }
    }

    const header = `☎️ Call ended — ${from || 'unknown'}\nDuration: ${durationStr}`;
    sendPush(summary ? `${header}\nSummary: ${summary}` : header);
  });
});

async function summarizeAndPushIntake(type, history, from) {
  let summary = null;
  try {
    const transcript = history
      .map((m) => `${m.role === 'user' ? 'Caller' : 'Brian'}: ${m.content}`)
      .join('\n');
    const reply = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 120,
      system: 'Summarize this customer intake call in ONE sentence: who, what they want, key details collected. Be concise.',
      messages: [{ role: 'user', content: transcript }],
    });
    summary = reply.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join(' ')
      .trim() || null;
  } catch (err) {
    console.error('[intake summary error]', err.message);
  }

  const header = `📋 INTAKE COMPLETE — ${type}\nCaller: ${from || 'unknown'}`;
  sendPush(summary ? `${header}\nSummary: ${summary}` : header);
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

server.listen(PORT, () => {
  console.log(`EDP AI Receptionist listening on :${PORT}`);
  console.log(`Twilio webhook URL: https://${PUBLIC_HOST}/twilio/voice`);
  console.log(`Agents loaded: ${Object.keys(agents).join(', ')}`);
});
