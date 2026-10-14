"use client";
import Link from "next/link";
import { AppShell, type AppShellProps, type LinkRenderer } from "@wlbp/ui-foundation";
const renderLink: LinkRenderer = ({
  onClick,
  onMouseEnter,
  onTouchStart,
  ...props
}) => (
  <Link
    {...props}
    {...(onClick === undefined ? {} : { onClick })}
    {...(onMouseEnter === undefined ? {} : { onMouseEnter })}
    {...(onTouchStart === undefined ? {} : { onTouchStart })}
  />
);
export function WorkspaceShellClient(props: Omit<AppShellProps, "renderLink">) {
  return <AppShell {...props} renderLink={renderLink} />;
}
