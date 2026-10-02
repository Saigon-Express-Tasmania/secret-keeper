/// <reference types="vite/client" />

// Deliberately no VITE_* variables: anything Vite inlines is public, so the
// build refuses to run when one is set (see vite.config.ts). Server-side
// settings (R2, CK_SERVER_SECRET, Brevo…) are read by the vault Function.
