"use client";

import { useEffect, useState } from "react";

/** True after mount — use to avoid SSR/client HTML divergence for locale/time/UI from client-only state. */
export function useClientMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);
  return mounted;
}
