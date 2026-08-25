import { useEffect, useState } from "react";

/**
 * Mirrors a value after it stops changing, for type-ahead filtering that queries the
 * server (§14.4) without firing a request per keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
