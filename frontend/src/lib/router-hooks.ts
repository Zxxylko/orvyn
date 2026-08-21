import { useLocation as useWouterLocation } from 'wouter';

export function useLocation() {
  const [pathname] = useWouterLocation();

  return { pathname };
}

export function useNavigate() {
  const [, navigate] = useWouterLocation();

  return navigate;
}
