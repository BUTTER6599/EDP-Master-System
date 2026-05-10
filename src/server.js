import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import Anthropic from '@anthropic-ai/sdk';
import { getAgent, agents } from './agents.js';
import { sendPush } from './pushover.js';

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

app.get('/', (_req, res) => res.send('EDP AI Receptionist running'));

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

        const shouldHangup = rawText.includes('[HANGUP]');
        const text = shouldHangup ? rawText.replace(/\[HANGUP\]/g, '').trim() : rawText;

        if (!text) return;

        console.log(`[${agent.name}] reply: ${text}${shouldHangup ? ' [HANGUP]' : ''}`);
        history.push({ role: 'assistant', content: text });

        ws.send(JSON.stringify({ type: 'text', token: text, last: true }));

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
