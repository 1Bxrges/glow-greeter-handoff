/** In test mode, the AI only answers numbers on the test list (matched by last 8 digits). */
export function aiAllowedFor(phone: string, testMode: boolean, testNumbers: string) {
  if (!testMode) return true;
  const tail = (s: string) => s.replace(/\D/g, "").slice(-8);
  const p = tail(phone);
  return testNumbers
    .split(/[\n,;]+/)
    .map(tail)
    .some((n) => n.length === 8 && n === p);
}
