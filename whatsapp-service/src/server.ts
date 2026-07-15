import 'dotenv/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import express, { type NextFunction, type Request, type Response } from 'express';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WASocket,
  type WAMessage,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { z } from 'zod';

const env = {
  port: Number(process.env.PORT ?? 3100),
  host: process.env.HOST ?? '127.0.0.1',
  apiUrl: (process.env.ORVYN_API_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, ''),
  serviceToken: process.env.WHATSAPP_SERVICE_TOKEN ?? '',
  webhookSecret: process.env.WHATSAPP_WEBHOOK_SECRET ?? '',
  sessionPath: process.env.WHATSAPP_SESSION_PATH ?? './sessions/main',
  autoConnect: (process.env.WHATSAPP_AUTO_CONNECT ?? 'true') === 'true',
};

if (env.serviceToken.length < 16 || env.webhookSecret.length < 16) {
  throw new Error('WHATSAPP_SERVICE_TOKEN and WHATSAPP_WEBHOOK_SECRET must contain at least 16 characters.');
}

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const app = express();
app.use(express.json({ limit: '64kb' }));

let socket: WASocket | null = null;
let connecting: Promise<void> | null = null;
let sessionStatus: 'disconnected' | 'connecting' | 'qr' | 'connected' = 'disconnected';
let qrDataUrl: string | null = null;
let connectedPhone: string | null = null;

const messageSchema = z.object({
  phone: z.string().min(8).max(24),
  message: z.string().min(1).max(4096),
});

function requireAuth(request: Request, response: Response, next: NextFunction): void {
  const provided = request.header('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const expected = Buffer.from(env.serviceToken);
  const actual = Buffer.from(provided);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    response.status(401).json({ message: 'Unauthorized' });
    return;
  }
  next();
}

function phoneToJid(phone: string): string {
  const digits = phone.replace(/\D/g, '').replace(/^0/, '62');
  if (digits.length < 8) throw new Error('Invalid recipient phone number.');
  return `${digits}@s.whatsapp.net`;
}

function extractText(message: WAMessage): string | null {
  const payload = message.message;
  if (!payload) return null;
  return payload.conversation
    ?? payload.extendedTextMessage?.text
    ?? payload.imageMessage?.caption
    ?? payload.videoMessage?.caption
    ?? null;
}

async function forwardInbound(message: WAMessage): Promise<void> {
  const remoteJid = message.key.remoteJid;
  const text = extractText(message)?.trim();
  if (!remoteJid || !text || message.key.fromMe || remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') return;

  const body = JSON.stringify({
    message_id: message.key.id,
    phone: `+${remoteJid.split('@')[0]}`,
    message: text,
    received_at: new Date(Number(message.messageTimestamp ?? Date.now() / 1000) * 1000).toISOString(),
  });
  const signature = createHmac('sha256', env.webhookSecret).update(body).digest('hex');

  try {
    const response = await fetch(`${env.apiUrl}/api/v1/integrations/whatsapp/inbound`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-orvyn-signature': signature },
      body,
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) {
      logger.warn({ status: response.status }, 'ORVYN rejected inbound WhatsApp message');
      return;
    }
    const result = await response.json() as { reply?: string | null };
    if (result.reply && socket) {
      await socket.sendMessage(remoteJid, { text: result.reply });
    }
  } catch (error) {
    logger.error({ error }, 'Failed to forward inbound WhatsApp message');
  }
}

async function connect(): Promise<void> {
  if (connecting) return connecting;
  if (sessionStatus === 'connected' && socket) return;

  connecting = (async () => {
    sessionStatus = 'connecting';
    await mkdir(env.sessionPath, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(env.sessionPath);
    const { version } = await fetchLatestBaileysVersion();
    const nextSocket = makeWASocket({
      version,
      auth: state,
      browser: Browsers.ubuntu('ORVYN'),
      logger: logger.child({ module: 'baileys' }),
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
    });
    socket = nextSocket;
    nextSocket.ev.on('creds.update', saveCreds);
    nextSocket.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const message of messages) await forwardInbound(message);
    });
    nextSocket.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        sessionStatus = 'qr';
        qrDataUrl = await QRCode.toDataURL(qr, { width: 320, margin: 2 });
      }
      if (connection === 'open') {
        sessionStatus = 'connected';
        qrDataUrl = null;
        connectedPhone = nextSocket.user?.id?.split(':')[0] ?? null;
        logger.info({ connectedPhone }, 'WhatsApp session connected');
      }
      if (connection === 'close') {
        socket = null;
        connectedPhone = null;
        const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        sessionStatus = 'disconnected';
        qrDataUrl = null;
        logger.warn({ statusCode, loggedOut }, 'WhatsApp session closed');
        if (!loggedOut) setTimeout(() => void connect(), 2_000);
      }
    });
  })().finally(() => { connecting = null; });

  return connecting;
}

app.get('/health', (_request, response) => {
  response.json({ online: true, connected: sessionStatus === 'connected', status: sessionStatus });
});

app.get('/session', requireAuth, (_request, response) => {
  response.json({ connected: sessionStatus === 'connected', status: sessionStatus, qr: qrDataUrl, phone: connectedPhone });
});

app.post('/session/connect', requireAuth, async (_request, response, next) => {
  try {
    await connect();
    response.status(202).json({ connected: sessionStatus === 'connected', status: sessionStatus, qr: qrDataUrl });
  } catch (error) {
    next(error);
  }
});

app.post('/messages', requireAuth, async (request, response) => {
  const parsed = messageSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(422).json({ message: 'Invalid message payload', errors: parsed.error.flatten() });
    return;
  }
  if (!socket || sessionStatus !== 'connected') {
    response.status(503).json({ message: 'WhatsApp session is not connected.' });
    return;
  }

  const result = await socket.sendMessage(phoneToJid(parsed.data.phone), { text: parsed.data.message });
  response.status(201).json({ id: result?.key.id ?? null, status: 'sent' });
});

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  logger.error({ error }, 'WhatsApp service request failed');
  response.status(500).json({ message: error instanceof Error ? error.message : 'Internal service error' });
});

app.listen(env.port, env.host, () => {
  logger.info({ host: env.host, port: env.port }, 'ORVYN WhatsApp service listening');
  if (env.autoConnect) {
    void connect().catch((error) => logger.error({ error }, 'Initial WhatsApp connection failed'));
  }
});
