import "@testing-library/jest-dom/vitest";
import { registerFallbackMessages } from "@togetherflow/common";
import { workMessages } from "../i18n/messages";

/*
 * Component tests render screens directly rather than through `AppRoot`, so there is no
 * I18nProvider in the tree. Registering the catalogue here means those tests assert on
 * the real copy — the same strings a user sees — instead of on message keys, and a key
 * that is missing from the catalogue still fails visibly.
 */
registerFallbackMessages(workMessages);
