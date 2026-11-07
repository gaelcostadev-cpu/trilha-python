"""Synthetic MXC launch from a suspended, job-bound helper; no student code."""
import ctypes as c
from ctypes import wintypes as w
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

from proof import K, B, D, H, EXTENDED_LIMIT, PROCESS_INFORMATION, STARTUPINFO, api, check

api('OpenProcess', [D, B, D], H)
api('QueryInformationJobObject', [H, c.c_int, c.c_void_p, D, c.POINTER(D)], B)
api('GetCurrentProcess', [], H)
api('GetProcessHandleCount', [H, c.POINTER(D)], B)

HERE = Path(__file__).resolve().parent
NODE = os.environ['TRILHA_ELECTRON']
HELPER = HERE / 'mxc-helper.mjs'
BASE = Path(os.environ.get('TRILHA_MXC_ROOT', HERE.parent / 'mxc')).resolve()

def main(failure=None):
    with tempfile.TemporaryDirectory(prefix='inherited-', dir=HERE) as folder:
        return run(failure, Path(folder) / 'result.json')

def run(failure, report_path):
    job = check(K.CreateJobObjectW(None, None))
    pi = PROCESS_INFORMATION()
    child = None
    try:
        limits = EXTENDED_LIMIT()
        limits.basic.flags = 0x2000 | 0x8 | 0x100 | 0x200
        limits.basic.active_processes = 16
        limits.process_memory = 1024 * 1024**2
        limits.job_memory = 2048 * 1024**2
        check(K.SetInformationJobObject(job, 9, c.byref(limits), c.sizeof(limits)))
        actual = EXTENDED_LIMIT()
        check(K.QueryInformationJobObject(job, 9, c.byref(actual), c.sizeof(actual), None))
        if (actual.basic.flags != limits.basic.flags or
            actual.basic.active_processes != limits.basic.active_processes or
            actual.process_memory != limits.process_memory or
            actual.job_memory != limits.job_memory):
            raise RuntimeError('job limits do not match requested values')
        startup = STARTUPINFO()
        startup.cb = c.sizeof(startup)
        cmd = c.create_unicode_buffer(subprocess.list2cmdline([NODE, str(HELPER), str(report_path), str(BASE)]))
        os.environ['ELECTRON_RUN_AS_NODE'] = '1'
        check(K.CreateProcessW(NODE, cmd, None, None, False, 0x00000004 | 0x08000000, None, None, c.byref(startup), c.byref(pi)))
        check(K.AssignProcessToJobObject(job, pi.process))
        member = B()
        check(K.IsProcessInJob(pi.process, job, c.byref(member)))
        if not member.value: raise RuntimeError('helper not in job before resume')
        print('helper in exact job before resume; breakaway flags absent; limits confirmed', flush=True)
        if failure == 'assigned': raise RuntimeError(failure)
        if K.ResumeThread(pi.thread) == 0xffffffff:
            raise c.WinError(c.get_last_error())
        if failure == 'resumed': raise RuntimeError(failure)
        deadline = time.monotonic() + 20
        while not report_path.exists() and K.WaitForSingleObject(pi.process, 0) == 0x102 and time.monotonic() < deadline:
            time.sleep(.02)
        if not report_path.exists():
            raise RuntimeError('helper exited or timed out before reporting')
        report = json.loads(report_path.read_text(encoding='utf-8'))
        print('MXC report:', json.dumps(report), flush=True)
        if 'error' in report:
            raise RuntimeError('MXC launch failed: ' + report['error'])
        child = check(K.OpenProcess(0x00101000, False, report['pid']))
        if K.WaitForSingleObject(child, 0) != 0x102:
            raise RuntimeError('MXC process exited before inspection')
        check(K.IsProcessInJob(child, job, c.byref(member)))
        print('live MXC process in exact job:', bool(member.value), flush=True)
        if not member.value:
            raise AssertionError('MXC process is outside job')
        if failure == 'child-open': raise RuntimeError(failure)
        check(K.CloseHandle(job))
        job = None
        if K.WaitForSingleObject(child, 5000) != 0:
            raise AssertionError('MXC process survived last job handle closure')
        if K.WaitForSingleObject(pi.process, 5000) != 0:
            raise AssertionError('helper survived last job handle closure')
        print('closing last job handle terminated both live processes', flush=True)
    finally:
        errors = []
        def attempt(label, action):
            try: action()
            except Exception as error: errors.append(f'{label}: {error}')
        def stop_helper(handle):
            status = K.WaitForSingleObject(handle, 5000)
            if status == 0x102:
                check(K.TerminateProcess(handle, 99))
                if K.WaitForSingleObject(handle, 5000) != 0: raise RuntimeError('forced termination failed')
                raise RuntimeError('process required forced termination')
            if status != 0: raise RuntimeError(f'helper wait failed: {status}')
        def wait_child(handle):
            if K.WaitForSingleObject(handle, 5000) != 0:
                raise RuntimeError('child did not exit after job closure')
        if job: attempt('close job', lambda: check(K.CloseHandle(job)))
        if child:
            attempt('wait child', lambda: wait_child(child))
            attempt('close child', lambda: check(K.CloseHandle(child)))
        if pi.process:
            attempt('stop helper', lambda: stop_helper(pi.process))
            attempt('close thread', lambda: check(K.CloseHandle(pi.thread)))
            attempt('close helper', lambda: check(K.CloseHandle(pi.process)))
        if errors: raise RuntimeError('; '.join(errors))

def handle_count():
    count = D()
    check(K.GetProcessHandleCount(K.GetCurrentProcess(), c.byref(count)))
    return count.value

if __name__ == '__main__':
    if sys.argv[1:] == ['--failures']:
        try:
            main('assigned')
        except RuntimeError as error:
            if str(error) != 'assigned': raise
        else:
            raise AssertionError('warmup failure not injected')
        for stage in ('assigned', 'resumed', 'child-open'):
            before = handle_count()
            try:
                main(stage)
            except RuntimeError as error:
                if str(error) != stage: raise
            else:
                raise AssertionError(f'{stage}: failure not injected')
            after = handle_count()
            if before != after: raise AssertionError(f'{stage}: handles {before} -> {after}')
            print(f'{stage}: cleanup completed; supervisor handles {before} -> {after}', flush=True)
    else:
        main()
