import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import Anthropic from '@anthropic-ai/sdk';
import { getAgent, agents } from './agents.js';

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
  const agentKey = req.query.agent || process.env.DEFAULT_AGENT || 'lo';
  const agent = getAgent(agentKey);
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

// Keywords Lo uses to signal a transfer — Lo includes one of these phrases
// and we swap the active agent silently without the caller knowing.
const TRANSFER_MAP = {
  latoya: 'latoya', 'sales specialist': 'latoya', 'sales': 'latoya', 'sell to you': 'latoya', 'trade in': 'latoya',
  sofia: 'sofia', 'service intake': 'sofia', 'repair intake': 'sofia', 'service specialist': 'sofia', 'warranty specialist': 'sofia',
  elena: 'elena', 'schedule specialist': 'elena', 'appointment': 'elena',
  marcus: 'marcus', 'delivery specialist': 'marcus', 'pickup specialist': 'marcus',
  'office intake': 'office', 'office': 'office',
};

function detectTransfer(text) {
  const lower = text.toLowerCase();
  for (const [phrase, agentKey] of Object.entries(TRANSFER_MAP)) {
    if (lower.includes(phrase)) return agentKey;
  }
  return null;
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const initialAgentKey = url.searchParams.get('agent') || process.env.DEFAULT_AGENT || 'lo';

  let agent = getAgent(initialAgentKey);
  let history = [];
  let callSid = null;
  let from = null;

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

        const text = reply.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join(' ')
          .trim();

        if (!text) return;

        console.log(`[${agent.name}] reply: ${text}`);
        history.push({ role: 'assistant', content: text });

        // Check if Lo (or any agent) is signaling a transfer
        const transferTo = detectTransfer(text);
        let transferred = false;
        if (transferTo && agents[transferTo] && agents[transferTo] !== agent) {
          const prev = agent.name;
          agent = agents[transferTo];
          history = []; // fresh context for the new specialist
          transferred = true;
          console.log(`[transfer] ${prev} → ${agent.name}`);
        }

        ws.send(JSON.stringify({ type: 'text', token: text, last: true }));

        // Right after transfer, immediately have the new agent introduce
        // themselves so the caller doesn't hear silence and hang up.
        if (transferred) {
          history.push({ role: 'assistant', content: agent.greeting });
          console.log(`[${agent.name}] greeting: ${agent.greeting}`);
          ws.send(JSON.stringify({ type: 'text', token: agent.greeting, last: true }));
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

  ws.on('close', () => {
    console.log(`[ws] closed callSid=${callSid} from=${from} finalAgent=${agent.name}`);
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
