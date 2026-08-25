import "@testing-library/jest-dom/vitest";
import { registerFallbackMessages } from "@togetherflow/common";
import { controlMessages } from "../i18n/messages";

/*
 * Component tests render screens directly rather than through `AppRoot`, so there is no
 * I18nProvider in the tree. Registering the catalogue here keeps those tests asserting
 * on the real copy rather than on message keys.
 */
registerFallbackMessages(controlMessages);
