import type { ComponentPropsWithRef, ReactElement } from "react";

/** Forward every prop (including ref) to a single anchor-compatible element. */
export type NavigationLinkProps = Omit<ComponentPropsWithRef<"a">, "href"> & {
  href: string;
};

/** Supplied by an app-owned client wrapper when used inside AppShell. */
export type LinkRenderer = (props: NavigationLinkProps) => ReactElement;

/** Framework-neutral composition point; plain anchors remain the default. */
export function NavigationLink({
  renderLink,
  ...props
}: NavigationLinkProps & { renderLink?: LinkRenderer }) {
  return renderLink ? renderLink(props) : <a {...props} />;
}
