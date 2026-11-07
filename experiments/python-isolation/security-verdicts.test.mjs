import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accessVerdict, udpVerdict, wmiVerdict, writeVerdict } from './security-verdicts.mjs';

test('observed access remains a failure even if a process or control fails', () => {
  const failed = { reason: 'timeout', stdout: 'allowed', exitCode: 1 };
  assert.equal(accessVerdict({ status: 1, stdout: '' }, failed), 'FAIL');
  assert.equal(wmiVerdict({ status: 1, stdout: '' }, { ...failed, stdout: '{"connect":0}' }), 'FAIL');
  assert.equal(udpVerdict({ status: 1, stdout: '' }, failed, ['SANDBOX']), 'FAIL');
  assert.equal(writeVerdict({ status: 1, stdout: '' }, failed, 'a!', undefined, undefined), 'FAIL');
  assert.equal(writeVerdict({ status: 0, stdout: 'allowed' }, { reason: 'timeout' }, 'a!', 'a!', 'a!!'), 'FAIL');
});

test('requires a working control and explicit denial for approval', () => {
  const host = { status: 0, stdout: 'allowed' };
  const denied = { reason: 'completed', exitCode: 0, stdout: 'denied' };
  assert.equal(accessVerdict(host, denied), 'pass');
  assert.equal(accessVerdict({ status: 1, stdout: '' }, denied), 'inconclusive');
  assert.equal(udpVerdict({ status: 0, stdout: 'sent' }, { ...denied, stdout: 'sent' }, ['HOST']), 'inconclusive');
  assert.equal(udpVerdict({ status: 0, stdout: 'sent' }, denied, ['HOST']), 'pass');
});
