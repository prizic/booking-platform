"use client";
import { useEffect } from "react";
export function RequestFocus({ bookingIds }: { bookingIds: readonly string[] }) {
  useEffect(() => {
    const focus = () => {
      const id = window.location.hash.slice(1);
      if (!bookingIds.some((bookingId) => id === `request-${bookingId}`)) return;
      const target = document.getElementById(id);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "nearest" });
    };
    focus();
    window.addEventListener("hashchange", focus);
    return () => window.removeEventListener("hashchange", focus);
  }, [bookingIds]);
  return null;
}
