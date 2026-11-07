const completed = result => result.reason === 'completed' && result.exitCode === 0;

export function accessVerdict(host, sandbox) {
  if (sandbox.stdout?.trim() === 'allowed') return 'FAIL';
  if (host.status !== 0 || host.stdout.trim() !== 'allowed' || !completed(sandbox)) return 'inconclusive';
  return sandbox.stdout.trim() === 'denied' ? 'pass' : 'inconclusive';
}

export function writeVerdict(host, sandbox, expected, before, after) {
  const verdict = accessVerdict(host, sandbox);
  if (verdict === 'FAIL') return verdict;
  if (before !== expected || typeof after !== 'string') return 'inconclusive';
  if (after !== before) return 'FAIL';
  return verdict;
}

export function wmiVerdict(host, sandbox) {
  let observed;
  try { observed = JSON.parse(sandbox.stdout).connect; } catch { return 'inconclusive'; }
  if (observed === 0) return 'FAIL';
  try {
    if (host.status !== 0 || JSON.parse(host.stdout).connect !== 0 || !completed(sandbox)) return 'inconclusive';
  } catch { return 'inconclusive'; }
  return observed === -2147024891 ? 'pass' : 'inconclusive';
}

export function udpVerdict(host, sandbox, received) {
  if (received.includes('SANDBOX')) return 'FAIL';
  if (host.status !== 0 || host.stdout.trim() !== 'sent' || !received.includes('HOST') || !completed(sandbox)) return 'inconclusive';
  return sandbox.stdout.trim() === 'denied' ? 'pass' : 'inconclusive';
}
