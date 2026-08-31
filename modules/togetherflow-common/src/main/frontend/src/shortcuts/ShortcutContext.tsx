/**
 * Shortcut registry (REQUIREMENTS.md §14.4).
 *
 * Shortcuts belong next to the state they act on — "complete this task" is TaskDetail's
 * business, not the app root's — but the help dialog has to list all of them, and a list
 * maintained apart from the handlers goes stale the first time one is renamed.
 *
 * So components register their bindings and the provider owns both the single keydown
 * listener and the help dialog. One source of truth, and a shortcut cannot be documented
 * unless it is actually wired up, or wired up without appearing in the help.
 *
 * Bindings are scoped by mounting: a screen that is not on screen has not registered
 * anything, so "complete this task" simply does not exist while no task is open.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ShortcutHelp } from "../components/ShortcutHelp";
import { useT } from "../i18n/I18nContext";
import { useShortcuts, type Shortcut } from "./useShortcuts";

interface ShortcutContextValue {
  register: (id: symbol, shortcuts: Shortcut[]) => void;
  unregister: (id: symbol) => void;
  /** Everything currently registered, in registration order. */
  shortcuts: Shortcut[];
}

const ShortcutContext = createContext<ShortcutContextValue | null>(null);

export interface ShortcutProviderProps {
  children: ReactNode;
  /** Off while signed out, so shortcuts cannot fire behind the login screen. */
  enabled?: boolean;
}

export function ShortcutProvider({ children, enabled = true }: ShortcutProviderProps) {
  const t = useT();
  const [registrations, setRegistrations] = useState<{ id: symbol; shortcuts: Shortcut[] }[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);

  const register = useCallback((id: symbol, shortcuts: Shortcut[]) => {
    setRegistrations((current) => [...current.filter((entry) => entry.id !== id), { id, shortcuts }]);
  }, []);

  const unregister = useCallback((id: symbol) => {
    setRegistrations((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const registered = useMemo(
    () => registrations.flatMap((entry) => entry.shortcuts),
    [registrations],
  );

  const all = useMemo<Shortcut[]>(
    () => [
      ...registered,
      { key: "?", description: t("shortcuts.help"), run: () => setHelpOpen((open) => !open) },
    ],
    [registered, t],
  );

  /*
   * First match wins, so while the help dialog is open its own Escape has to come before
   * anything a screen registered — otherwise a screen's Escape closes the panel behind
   * the dialog and leaves the dialog itself up. Undocumented on purpose: closing a dialog
   * with Escape needs no explaining, and listing it would pad the help with the obvious.
   */
  const handled = useMemo<Shortcut[]>(
    () => (helpOpen ? [{ key: "Escape", run: () => setHelpOpen(false) }, ...all] : all),
    [all, helpOpen],
  );

  useShortcuts(handled, { enabled });

  const value = useMemo(
    () => ({ register, unregister, shortcuts: all }),
    [register, unregister, all],
  );

  return (
    <ShortcutContext.Provider value={value}>
      {children}
      <ShortcutHelp shortcuts={all} open={helpOpen} onClose={() => setHelpOpen(false)} />
    </ShortcutContext.Provider>
  );
}

/**
 * Registers a screen's bindings for as long as it is mounted.
 *
 * `shortcuts` is re-registered whenever the array identity changes, so wrap it in
 * `useMemo` where the handlers close over state that changes often.
 */
export function useRegisterShortcuts(shortcuts: Shortcut[]): void {
  const context = useContext(ShortcutContext);
  /*
   * Stable per component instance, so re-registering replaces this component's bindings
   * rather than accumulating a new set each render. A lazy `useState` initialiser rather
   * than a ref written during render, which is unsafe under concurrent rendering.
   */
  const [key] = useState(() => Symbol("shortcuts"));

  const register = context?.register;
  const unregister = context?.unregister;

  /*
   * Re-register on the bindings' *shape*, never on the array's identity.
   *
   * Registering sets state on the provider, which re-renders every child, which rebuilds
   * whatever array the child passed. Depending on that array's identity therefore closes
   * a loop the moment any ancestor hands down an inline callback — which is the ordinary
   * way to write a parent — and React stops it with "Maximum update depth exceeded".
   * Found by running the app: every unit test passes a stable `vi.fn()` and so never
   * completes the circuit.
   *
   * The signature covers everything the provider actually uses a registration for: which
   * keys are bound, what the help dialog prints, and whether the binding is live.
   */
  const signature = shortcuts
    .map((shortcut) => `${shortcut.key}|${shortcut.description ?? ""}|${shortcut.when !== false}`)
    .join(";");

  // `run` is read through a ref, so a re-render that only changed a closure still runs
  // the current handler without re-registering.
  const latest = useRef(shortcuts);
  useEffect(() => {
    latest.current = shortcuts;
  });

  useEffect(() => {
    if (!register || !unregister) return;
    register(
      key,
      latest.current.map((shortcut, index) => ({
        ...shortcut,
        run: (event: KeyboardEvent) => latest.current[index]?.run(event),
      })),
    );
    return () => unregister(key);
  }, [register, unregister, key, signature]);
}

/** Everything currently registered — for anything that wants to render its own help. */
export function useRegisteredShortcuts(): Shortcut[] {
  return useContext(ShortcutContext)?.shortcuts ?? [];
}
