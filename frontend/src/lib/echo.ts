import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

type WindowWithPusher = Window & typeof globalThis & {
  Pusher: typeof Pusher;
};

// Expose Pusher to window object (required by Laravel Echo)
(window as WindowWithPusher).Pusher = Pusher;

const REVERB_KEY = import.meta.env.VITE_REVERB_APP_KEY || 'orvyn-reverb-key';
const REVERB_HOST = import.meta.env.VITE_REVERB_HOST || window.location.hostname;
const REVERB_PORT = import.meta.env.VITE_REVERB_PORT || '8080';
const REVERB_SCHEME = import.meta.env.VITE_REVERB_SCHEME || 'ws';

export const echo = new Echo({
  broadcaster: 'reverb',
  key: REVERB_KEY,
  wsHost: REVERB_HOST,
  wsPort: parseInt(REVERB_PORT),
  wssPort: parseInt(REVERB_PORT),
  forceTLS: REVERB_SCHEME === 'wss',
  enabledTransports: ['ws', 'wss'],
  authEndpoint: (import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1') + '/broadcasting/auth',
  auth: {
    headers: {
      // Dynamic getter to always fetch the latest auth token for private channels
      get Authorization() {
        const token = localStorage.getItem('auth_token');
        return token ? `Bearer ${token}` : '';
      },
    },
  },
});

export default echo;
