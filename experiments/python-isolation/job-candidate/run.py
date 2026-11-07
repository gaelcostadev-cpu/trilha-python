"""Job-owned synthetic test harness; never accepts or runs student programs."""
import ctypes as c
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

sys.path.insert(0, os.environ['TRILHA_JOB_PROOF'])
from proof import K, B, D, EXTENDED_LIMIT, PROCESS_INFORMATION, STARTUPINFO, check, cleanup

HERE = Path(__file__).resolve().parent
BASE = Path(os.environ['TRILHA_MXC_ROOT']).resolve()
ELECTRON = os.environ['TRILHA_ELECTRON']

def run(mode, fail_before_resume=False):
    if mode not in ('io', 'failure', 'flood', 'unicode_flood', 'hang'): raise ValueError('invalid fixed case')
    with tempfile.TemporaryDirectory(prefix='candidate-', dir=HERE) as temp:
        report = Path(temp) / 'result.json'
        job = None
        pi = PROCESS_INFORMATION()
        try:
            job = check(K.CreateJobObjectW(None, None))
            limits = EXTENDED_LIMIT()
            limits.basic.flags = 0x2000 | 0x8 | 0x100 | 0x200
            limits.basic.active_processes = 16
            limits.process_memory, limits.job_memory = 1024 * 1024**2, 2048 * 1024**2
            check(K.SetInformationJobObject(job, 9, c.byref(limits), c.sizeof(limits)))
            startup = STARTUPINFO(); startup.cb = c.sizeof(startup)
            command = subprocess.list2cmdline([ELECTRON, str(HERE / 'helper.mjs'), str(report), str(BASE), mode])
            os.environ['ELECTRON_RUN_AS_NODE'] = '1'
            check(K.CreateProcessW(ELECTRON, c.create_unicode_buffer(command), None, None, False, 0x08000004, None, None, c.byref(startup), c.byref(pi)))
            check(K.AssignProcessToJobObject(job, pi.process))
            member = B()
            check(K.IsProcessInJob(pi.process, job, c.byref(member)))
            if not member.value: raise RuntimeError('helper not in job')
            if fail_before_resume: raise RuntimeError('injected before resume')
            if K.ResumeThread(pi.thread) == 0xffffffff: raise c.WinError(c.get_last_error())
            status = K.WaitForSingleObject(pi.process, 12000)
            if status != 0: raise RuntimeError(f'helper timeout or wait failure: {status}')
            exit_code = D(); check(K.GetExitCodeProcess(pi.process, c.byref(exit_code)))
            if not report.exists(): raise RuntimeError(f'helper exited {exit_code.value} without a result')
            result = json.loads(report.read_text(encoding='utf8'))
            if exit_code.value or 'error' in result: raise RuntimeError(f'helper failed: {result}')
            return result
        finally:
            cleanup(job, pi)

def verify(condition, detail):
    if not condition: raise AssertionError(detail)

if __name__ == '__main__':
    try:
        run('io', True)
    except RuntimeError as error:
        verify(str(error) == 'injected before resume', error)
    else:
        raise AssertionError('failure injection did not fail')
    io = run('io'); verify(io['reason'] == 'completed' and io['exitCode'] == 0 and io['stdout'] == 'Olá mundo\r\n' and io['stderr'] == 'erro\r\n', io)
    failure = run('failure'); verify(failure['reason'] == 'completed' and failure['exitCode'] != 0 and 'synthetic error' in failure['stderr'], failure)
    flood = run('flood'); verify(flood['reason'] == 'output_limit' and flood['bytes'] == 65536, flood)
    unicode_flood = run('unicode_flood'); verify(unicode_flood['reason'] == 'output_limit' and unicode_flood['bytes'] == 65536 and len(unicode_flood['stdout'].encode('utf8')) + len(unicode_flood['stderr'].encode('utf8')) <= 65536 and unicode_flood['stdout'] == 'x' * 65535, unicode_flood)
    hang = run('hang'); verify(hang['reason'] == 'timeout', hang)
    print('PASS: pre-resume failure, fixed stdin/stdout/stderr, exception, output cap, UTF-8 boundary, timeout')
