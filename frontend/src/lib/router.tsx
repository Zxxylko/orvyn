import { Link as WouterLink, Redirect } from 'wouter';
import type { RedirectProps } from 'wouter';
import type { BrowserLocationHook } from 'wouter/use-browser-location';

export const Link = WouterLink;
export const NavLink = WouterLink;

type NavigateProps = RedirectProps<BrowserLocationHook>;

export function Navigate(props: NavigateProps) {
  return <Redirect<BrowserLocationHook> {...props} />;
}
