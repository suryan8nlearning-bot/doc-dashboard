// Centralized debug flag for frontend UI.
// Enable by setting VITE_DEBUG to true/1/yes/on in Frontend env variables.
export const debugEnabled: boolean = (() => {
  // Vite exposes env on import.meta.env
  const raw = (import.meta as any)?.env?.VITE_DEBUG;
  if (raw === true) return true;
  if (typeof raw === "string") {
    const v = raw.trim().toLowerCase();
    return v === "true" || v === "1" || v === "yes" || v === "on";
    }
  return false;
})();
