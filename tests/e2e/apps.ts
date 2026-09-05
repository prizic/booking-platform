export const applicationOrigins = [
  { name: "client", origin: "http://localhost:3000" },
  { name: "dashboard", origin: "http://localhost:3001" },
  { name: "platform-admin", origin: "http://localhost:3002" },
] as const;

export const locales = [
  { locale: "en", direction: "ltr" },
  { locale: "ar", direction: "rtl" },
] as const;
