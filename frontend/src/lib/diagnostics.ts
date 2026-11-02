export function diagnostic(area: string, code: string) {
  try {
    const key = "women.v2.diagnostics",
      old = JSON.parse(localStorage.getItem(key) || "[]");
    old.push({ at: new Date().toISOString(), area, code: code.slice(0, 80) });
    localStorage.setItem(key, JSON.stringify(old.slice(-50)));
  } catch {}
}
