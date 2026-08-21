import * as Network from 'expo-network';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
} from 'react';
import type { PropsWithChildren } from 'react';
import { setKnownNetworkOnline } from '../lib/api-cache';

export type ConnectivityStatus = 'checking' | 'online' | 'offline';

interface NetworkContextValue {
  status: ConnectivityStatus;
  isOnline: boolean;
  type: Network.NetworkStateType | undefined;
  detail: string;
}

const NetworkContext = createContext<NetworkContextValue | null>(null);

export function NetworkProvider({ children }: PropsWithChildren) {
  const networkState = Network.useNetworkState();

  const status: ConnectivityStatus =
    networkState.isConnected === false
    || networkState.isInternetReachable === false
      ? 'offline'
      : networkState.isConnected === true
        ? 'online'
        : 'checking';

  useEffect(() => {
    setKnownNetworkOnline(
      status === 'checking' ? undefined : status === 'online',
    );
  }, [status]);

  const value = useMemo<NetworkContextValue>(
    () => ({
      status,
      isOnline: status === 'online',
      type: networkState.type,
      detail: connectionDetail(status, networkState.type),
    }),
    [networkState.type, status],
  );

  return (
    <NetworkContext.Provider value={value}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetworkStatus(): NetworkContextValue {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetworkStatus must be used inside NetworkProvider.');
  }
  return context;
}

function connectionDetail(
  status: ConnectivityStatus,
  type: Network.NetworkStateType | undefined,
): string {
  if (status === 'offline') {
    return 'Tidak ada akses internet. Data terakhir yang tersimpan tetap tersedia.';
  }
  if (status === 'checking') return 'Memeriksa koneksi perangkat…';

  const labels: Partial<Record<Network.NetworkStateType, string>> = {
    [Network.NetworkStateType.WIFI]: 'Terhubung melalui Wi-Fi',
    [Network.NetworkStateType.CELLULAR]: 'Terhubung melalui data seluler',
    [Network.NetworkStateType.ETHERNET]: 'Terhubung melalui Ethernet',
    [Network.NetworkStateType.VPN]: 'Terhubung melalui VPN',
  };
  return labels[type ?? Network.NetworkStateType.UNKNOWN] ?? 'Perangkat online';
}
