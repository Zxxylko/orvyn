import 'dotenv/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { chmod, lstat, mkdir, readdir } from 'node:fs/promises';
import express, { type NextFunction, type Request, type Response } from 'express';
import makeWASocket, {
  areJidsSameUser,
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

process.umask(0o077);

const env = {
  port: Number(process.env.PORT ?? 3100),
  host: process.env.HOST ?? '127.0.0.1',
  apiUrl: (process.env.ORVYN_API_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, ''),
  serviceToken: process.env.WHATSAPP_SERVICE_TOKEN ?? '',
  webhookSecret: process.env.WHATSAPP_WEBHOOK_SECRET ?? '',
  sessionPath: process.env.WHATSAPP_SESSION_PATH ?? './sessions/main',
  autoConnect: (process.env.WHATSAPP_AUTO_CONNECT ?? 'true') === 'true',
};

if (env.serviceToken.length < 32 || env.webhookSecret.length < 32) {
  throw new Error('WHATSAPP_SERVICE_TOKEN and WHATSAPP_WEBHOOK_SECRET must contain at least 32 characters.');
}

function redactDiagnostic(value: unknown): string {
  const message = value instanceof Error ? `${value.name}: ${value.message}` : String(value);
  if (/(SessionEntry|baseKey|chainKey|rootKey|ephemeralKey|privateKey|<Buffer)/i.test(message)) {
    return '[redacted cryptographic diagnostic]';
  }

  return message.replace(/(Bearer\s+)[^\s]+/gi, '$1[redacted]').slice(0, 2_000);
}

for (const method of ['log', 'warn', 'error'] as const) {
  const original = console[method].bind(console);
  console[method] = (...args: unknown[]) => original(...args.map(redactDiagnostic));
}

function errorSummary(error: unknown): { type: string; message: string } {
  return {
    type: error instanceof Error ? error.name : 'UnknownError',
    message: redactDiagnostic(error),
  };
}

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: ['*.token', '*.secret', '*.key', '*.phone', '*.connectedPhone'],
    censor: '[redacted]',
  },
});
const baileysLogger = pino({ level: process.env.BAILEYS_LOG_LEVEL ?? 'silent' });
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

function isConnectedAccountChat(remoteJid: string): boolean {
  const account = socket?.user;
  return [account?.id, account?.phoneNumber, account?.lid]
    .some((jid) => jid ? areJidsSameUser(jid, remoteJid) : false);
}

async function hardenSessionPath(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error('WHATSAPP_SESSION_PATH must be a real directory.');
  }
  await chmod(path, 0o700);

  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = `${path}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      throw new Error('Symbolic links are not allowed in WHATSAPP_SESSION_PATH.');
    }
    if (entry.isDirectory()) {
      await hardenSessionPath(child);
    } else if (entry.isFile()) {
      await chmod(child, 0o600);
    }
  }
}

async function forwardInbound(message: WAMessage): Promise<void> {
  const remoteJid = message.key.remoteJid;
  const text = extractText(message)?.trim();
  if (
    !remoteJid
    || !text
    || remoteJid.endsWith('@g.us')
    || remoteJid.endsWith('@newsletter')
    || remoteJid.endsWith('@broadcast')
    || (message.key.fromMe && !isConnectedAccountChat(remoteJid))
  ) return;

  const senderJid = message.key.remoteJidAlt?.endsWith('@s.whatsapp.net')
    ? message.key.remoteJidAlt
    : remoteJid;
  const body = JSON.stringify({
    message_id: message.key.id,
    phone: `+${senderJid.split('@')[0]}`,
    message: text,
    received_at: new Date(Number(message.messageTimestamp ?? Date.now() / 1000) * 1000).toISOString(),
  });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac('sha256', env.webhookSecret).update(`${timestamp}.${body}`).digest('hex');

  try {
    const response = await fetch(`${env.apiUrl}/api/v1/integrations/whatsapp/inbound`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-orvyn-signature': signature,
        'x-orvyn-timestamp': timestamp,
      },
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
    logger.error({ error: errorSummary(error) }, 'Failed to forward inbound WhatsApp message');
  }
}

async function connect(): Promise<void> {
  if (connecting) return connecting;
  if (sessionStatus === 'connected' && socket) return;

  connecting = (async () => {
    sessionStatus = 'connecting';
    await hardenSessionPath(env.sessionPath);
    const { state, saveCreds } = await useMultiFileAuthState(env.sessionPath);
    const { version } = await fetchLatestBaileysVersion();
    const nextSocket = makeWASocket({
      version,
      auth: state,
      browser: Browsers.ubuntu('ORVYN'),
      logger: baileysLogger.child({ module: 'baileys' }),
      printQRInTerminal: false,
      emitOwnEvents: false,
      markOnlineOnConnect: false,
      maxMsgRetryCount: 1,
      syncFullHistory: false,
      shouldIgnoreJid: (jid) => jid.endsWith('@newsletter') || jid.endsWith('@broadcast'),
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
        connectedPhone = (nextSocket.user?.phoneNumber ?? nextSocket.user?.id)?.split(':')[0] ?? null;
        logger.info('WhatsApp session connected');
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

app.disable('x-powered-by');

app.get('/health', (_request, response) => {
  response.json({ online: true });
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
  logger.error({ error: errorSummary(error) }, 'WhatsApp service request failed');
  response.status(500).json({ message: 'Internal service error' });
});

app.listen(env.port, env.host, () => {
  logger.info({ host: env.host, port: env.port }, 'ORVYN WhatsApp service listening');
  if (env.autoConnect) {
    void connect().catch((error) => logger.error({ error: errorSummary(error) }, 'Initial WhatsApp connection failed'));
  }
});
