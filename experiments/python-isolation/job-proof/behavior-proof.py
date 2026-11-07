"""Fixed Windows/MXC experiments; never accepts or runs student programs."""
import ctypes as c
import json
import os
import re
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from contextlib import ExitStack

from proof import K, B, D, H, EXTENDED_LIMIT, PROCESS_INFORMATION, STARTUPINFO, api, check

api('OpenProcess', [D, B, D], H)
HERE = Path(__file__).resolve().parent
BASE = Path(os.environ.get('TRILHA_MXC_ROOT', HERE.parent / 'mxc')).resolve()
ELECTRON = os.environ['TRILHA_ELECTRON']
RUNTIME = BASE / 'official-runtime' / 'python.exe'

def close(handle):
    check(K.CloseHandle(handle))

def crash_report_path(token):
    if not re.fullmatch(r'crash-[a-z0-9_]{8}', token):
        raise ValueError('invalid crash test token')
    folder = (HERE / token).resolve(strict=True)
    if folder.parent != HERE or not folder.is_dir():
        raise ValueError('invalid crash test folder')
    return folder / 'ready.json'

def publish_crash(report_path, value):
    temporary = report_path.with_suffix('.tmp')
    with temporary.open('x', encoding='utf-8') as stream:
        json.dump(value, stream)
    os.rename(temporary, report_path)

def wait_dead(handle, force=False):
    status = K.WaitForSingleObject(handle, 5000)
    if status == 0x102 and force:
        check(K.TerminateProcess(handle, 99))
        if K.WaitForSingleObject(handle, 5000) != 0: raise RuntimeError('forced termination failed')
        raise RuntimeError('process survived job closure; forced cleanup')
    if status != 0: raise RuntimeError(f'process did not exit after job closure: {status}')

def read_report(path, process, timeout=20):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if path.exists():
            try: return json.loads(path.read_text(encoding='utf-8'))
            except json.JSONDecodeError: pass
        if K.WaitForSingleObject(process, 0) != 0x102:
            raise RuntimeError('helper exited before report')
        time.sleep(.02)
    raise RuntimeError('report timed out')

def host_control(mode):
    child = subprocess.Popen([str(RUNTIME), '-I', '-B', '-u', str(HERE / 'fixed-payload.py'), mode, str(os.getpid()), 'host'], stdout=subprocess.PIPE, text=True)
    try:
        output, _ = child.communicate(timeout=10)
        if child.returncode: raise RuntimeError(f'host control exited {child.returncode}')
        result = json.loads(output)
        print('host control:', result, flush=True)
        return result
    finally:
        if child.poll() is None: child.kill()
        child.wait(timeout=5)

def experiment(mode, process_limit=16, memory_limit=1024, crash_report=None):
    pi = PROCESS_INFORMATION()
    with ExitStack() as stack:
        temp_root = crash_report.parent if crash_report else HERE
        report_path = Path(stack.enter_context(tempfile.TemporaryDirectory(prefix='behavior-', dir=temp_root))) / 'result.json'
        job = check(K.CreateJobObjectW(None, None))
        active_job = [job]
        def close_job():
            if active_job:
                close(active_job[0])
                active_job.pop()
        stack.callback(close_job)
        limits = EXTENDED_LIMIT()
        limits.basic.flags = 0x2000 | 0x8 | 0x100 | 0x200
        limits.basic.active_processes = process_limit
        limits.process_memory = memory_limit * 1024**2
        limits.job_memory = 2048 * 1024**2
        check(K.SetInformationJobObject(job, 9, c.byref(limits), c.sizeof(limits)))
        startup = STARTUPINFO(); startup.cb = c.sizeof(startup)
        command = subprocess.list2cmdline([ELECTRON, str(HERE / 'behavior-helper.mjs'), str(report_path), str(BASE), mode, str(os.getpid())])
        os.environ['ELECTRON_RUN_AS_NODE'] = '1'
        check(K.CreateProcessW(ELECTRON, c.create_unicode_buffer(command), None, None, False, 0x08000004, None, None, c.byref(startup), c.byref(pi)))
        stack.callback(close, pi.process)
        stack.callback(close, pi.thread)
        stack.callback(wait_dead, pi.process, True)
        stack.callback(close_job)
        check(K.AssignProcessToJobObject(job, pi.process))
        member = B()
        check(K.IsProcessInJob(pi.process, job, c.byref(member)))
        if not member.value: raise RuntimeError('helper is outside job')
        if K.ResumeThread(pi.thread) == 0xffffffff: raise c.WinError(c.get_last_error())
        report = read_report(report_path, pi.process)
        if 'error' in report: raise RuntimeError(report['error'])
        child = check(K.OpenProcess(0x00101000, False, report['pid']))
        stack.callback(close, child)
        stack.callback(wait_dead, child)
        stack.callback(close_job)
        check(K.IsProcessInJob(child, job, c.byref(member)))
        if not member.value: raise RuntimeError('payload is outside job')
        if K.WaitForSingleObject(child, 0) != 0x102: raise RuntimeError('payload exited before verification')
        print('job payload:', report, flush=True)
        if crash_report:
            publish_crash(crash_report, {'helper': pi.pid, 'child': report['pid']})
            time.sleep(15)
        # Close the job before waiting, including on exceptional paths.
        close_job()
        return report['payload']

def crash_test():
    with ExitStack() as stack:
        report_path = Path(stack.enter_context(tempfile.TemporaryDirectory(prefix='crash-', dir=HERE))) / 'ready.json'
        victim = subprocess.Popen([sys.executable, '-B', __file__, '--victim', report_path.parent.name])
        def cleanup_victim():
            if victim.poll() is None: victim.kill()
            victim.wait(timeout=5)
        stack.callback(cleanup_victim)
        report = read_report(report_path, H(victim._handle))
        handles = []
        for key in ('helper', 'child'):
            handle = check(K.OpenProcess(0x00100000, False, report[key]))
            stack.callback(close, handle)
            handles.append(handle)
        if any(K.WaitForSingleObject(handle, 0) != 0x102 for handle in handles):
            raise RuntimeError('process not alive before crash')
        victim.kill(); victim.wait(timeout=5)
        for handle in handles: wait_dead(handle)
        print('abrupt supervisor termination killed helper and MXC payload', flush=True)

if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--victim':
        experiment('access', crash_report=crash_report_path(sys.argv[2]))
    elif len(sys.argv) == 1:
        access = host_control('access')
        if not access['opened']: raise RuntimeError(f'host access control failed: {access}')
        access = experiment('access')
        if access['opened'] or access['error'] != 5: raise RuntimeError(f'PSEC access test failed: {access}')
        memory = host_control('memory')
        if not memory['allocated']: raise RuntimeError(f'host memory control failed: {memory}')
        memory = experiment('memory')
        if not memory['allocated']: raise RuntimeError(f'PSEC memory control failed: {memory}')
        memory = experiment('memory', memory_limit=512)
        if memory['allocated'] or memory.get('error') != 1455:
            raise RuntimeError(f'PSEC memory limit inconclusive: {memory}')
        processes = experiment('process')
        if not processes['created'] or processes['exit'] != 0: raise RuntimeError(f'PSEC process control failed: {processes}')
        processes = experiment('process', process_limit=2)
        if processes['created'] or processes.get('error') != 1816:
            raise RuntimeError(f'PSEC process limit inconclusive: {processes}')
        crash_test()
    else:
        raise SystemExit('invalid arguments')
