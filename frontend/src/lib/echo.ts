import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import type { ChannelAuthorizationHandler } from 'pusher-js';
import { authorizeBroadcast } from './api';

type WindowWithPusher = Window & typeof globalThis & {
  Pusher: typeof Pusher;
};

// Expose Pusher to window object (required by Laravel Echo)
(window as WindowWithPusher).Pusher = Pusher;

const REVERB_KEY = import.meta.env.VITE_REVERB_APP_KEY || 'orvyn-reverb-key';
const REVERB_HOST = import.meta.env.VITE_REVERB_HOST || window.location.hostname;
const REVERB_PORT = import.meta.env.VITE_REVERB_PORT || '8080';
const REVERB_SCHEME = import.meta.env.VITE_REVERB_SCHEME || 'ws';
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
const API_ORIGIN = new URL(API_BASE_URL, window.location.origin).origin;
const BROADCAST_AUTH_ENDPOINT = import.meta.env.VITE_BROADCAST_AUTH_ENDPOINT
  || `${API_ORIGIN}/broadcasting/auth`;

const authorizePrivateChannel: ChannelAuthorizationHandler = async (
  { channelName, socketId },
  callback,
) => {
  try {
    const authorization = await authorizeBroadcast(
      BROADCAST_AUTH_ENDPOINT,
      socketId,
      channelName,
    );
    callback(null, authorization);
  } catch (error) {
    callback(
      error instanceof Error ? error : new Error('Private channel authorization failed.'),
      null,
    );
  }
};

export const echo = new Echo({
  broadcaster: 'reverb',
  key: REVERB_KEY,
  wsHost: REVERB_HOST,
  wsPort: parseInt(REVERB_PORT, 10),
  wssPort: parseInt(REVERB_PORT, 10),
  forceTLS: REVERB_SCHEME === 'wss',
  enabledTransports: ['ws', 'wss'],
  authEndpoint: BROADCAST_AUTH_ENDPOINT,
  channelAuthorization: {
    customHandler: authorizePrivateChannel,
  },
});

export default echo;
