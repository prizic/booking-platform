/**
 * @wlbp/ui-foundation — the single shadcn/ui + Tailwind component library for
 * Client, Dashboard and Platform Admin. Apps compose these components and
 * Tailwind utilities; they never ship their own component CSS.
 *
 * Styles: each app's globals.css imports "tailwindcss" and
 * "@wlbp/ui-foundation/theme.css", and adds an @source for this package.
 */
export { cn } from "./lib/cn.js";
export * from "./preferences.js";
export * from "./components/button.js";
export * from "./components/form-controls.js";
export * from "./components/field.js";
export * from "./components/surfaces.js";
export * from "./components/overlays.js";
export * from "./components/patterns.js";
export * from "./components/preferences-controls.js";
export * from "./components/app-shell.js";
export * from "./components/schedule-bands.js";
export * from "./components/date-picker.js";
export * from "./components/form.js";
export * from "./components/query.js";
export * from "./forms/index.js";
export * from "./components/compat.js";
