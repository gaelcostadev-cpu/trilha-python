"""Fixed-payload Windows Job experiment; never executes student programs."""
import ctypes as c
from ctypes import wintypes as w
from pathlib import Path
import subprocess
import sys
import tempfile
import time

K = c.WinDLL('kernel32', use_last_error=True)
P, D, H, B = c.c_void_p, w.DWORD, w.HANDLE, w.BOOL

def api(name, args, result):
    fn = getattr(K, name)
    fn.argtypes, fn.restype = args, result
    return fn

class STARTUPINFO(c.Structure):
    _fields_ = [('cb', D), ('reserved', w.LPWSTR), ('desktop', w.LPWSTR), ('title', w.LPWSTR), ('x', D), ('y', D), ('xsize', D), ('ysize', D), ('xchars', D), ('ychars', D), ('fill', D), ('flags', D), ('show', w.WORD), ('reserved2size', w.WORD), ('reserved2', P), ('stdin', H), ('stdout', H), ('stderr', H)]

class PROCESS_INFORMATION(c.Structure):
    _fields_ = [('process', H), ('thread', H), ('pid', D), ('tid', D)]

class BASIC_LIMIT(c.Structure):
    _fields_ = [('process_time', c.c_longlong), ('job_time', c.c_longlong), ('flags', D), ('min_working', c.c_size_t), ('max_working', c.c_size_t), ('active_processes', D), ('affinity', c.c_size_t), ('priority', D), ('scheduling', D)]

class IO_COUNTERS(c.Structure):
    _fields_ = [(name, c.c_ulonglong) for name in ('read_ops', 'write_ops', 'other_ops', 'read_bytes', 'write_bytes', 'other_bytes')]

class EXTENDED_LIMIT(c.Structure):
    _fields_ = [('basic', BASIC_LIMIT), ('io', IO_COUNTERS), ('process_memory', c.c_size_t), ('job_memory', c.c_size_t), ('peak_process', c.c_size_t), ('peak_job', c.c_size_t)]

api('CreateJobObjectW', [P, w.LPCWSTR], H)
api('SetInformationJobObject', [H, c.c_int, P, D], B)
api('CreateProcessW', [w.LPCWSTR, w.LPWSTR, P, P, B, D, P, w.LPCWSTR, c.POINTER(STARTUPINFO), c.POINTER(PROCESS_INFORMATION)], B)
api('AssignProcessToJobObject', [H, H], B)
api('IsProcessInJob', [H, H, c.POINTER(B)], B)
api('ResumeThread', [H], D)
api('WaitForSingleObject', [H, D], D)
api('GetExitCodeProcess', [H, c.POINTER(D)], B)
api('TerminateProcess', [H, w.UINT], B)
api('CloseHandle', [H], B)

def check(value):
    if not value:
        raise c.WinError(c.get_last_error())
    return value

def cleanup(job, pi, kernel=K):
    errors = []
    def attempt(name, action):
        try: action()
        except Exception as error: errors.append(f'{name}: {error}')
    def stop_process():
        status = kernel.WaitForSingleObject(pi.process, 100)
        if status == 0x102:
            terminated = kernel.TerminateProcess(pi.process, 99)
            if not terminated and kernel.WaitForSingleObject(pi.process, 0) != 0: check(terminated)
            if kernel.WaitForSingleObject(pi.process, 5000) != 0: raise RuntimeError('process survived cleanup')
        elif status != 0: raise RuntimeError(f'process wait failed: {status}')
    if job: attempt('close job', lambda: check(kernel.CloseHandle(job)))
    if pi.process:
        attempt('stop process', stop_process)
        if pi.thread: attempt('close thread', lambda: check(kernel.CloseHandle(pi.thread)))
        attempt('close process', lambda: check(kernel.CloseHandle(pi.process)))
    if errors: raise RuntimeError('; '.join(errors))

def run(sentinel, failure=None):
    job = None
    pi = PROCESS_INFORMATION()
    try:
        if failure == 'create_job': raise RuntimeError(failure)
        job = check(K.CreateJobObjectW(None, None))
        limits = EXTENDED_LIMIT()
        limits.basic.flags = 0x2000 | 0x8 | 0x100 | 0x200
        limits.basic.active_processes = 4
        limits.process_memory, limits.job_memory = 128 * 1024**2, 256 * 1024**2
        if failure == 'set_limits': raise RuntimeError(failure)
        if failure == 'set_limits_os':
            if K.SetInformationJobObject(job, 9, c.byref(limits), 1): raise AssertionError('invalid limit accepted')
            raise RuntimeError(failure)
        check(K.SetInformationJobObject(job, 9, c.byref(limits), c.sizeof(limits)))
        startup = STARTUPINFO()
        startup.cb = c.sizeof(startup)
        payload = 'from pathlib import Path; import sys; Path(sys.argv[1]).write_text("started")'
        cmd = c.create_unicode_buffer(subprocess.list2cmdline([sys.executable, '-I', '-B', '-c', payload, str(sentinel)]))
        if failure == 'create_process': raise RuntimeError(failure)
        check(K.CreateProcessW(sys.executable, cmd, None, None, False, 0x00000004 | 0x08000000, None, None, c.byref(startup), c.byref(pi)))
        if failure == 'assign': raise RuntimeError(failure)
        if failure == 'assign_os':
            if K.AssignProcessToJobObject(H(-1), pi.process): raise AssertionError('invalid job accepted')
            raise RuntimeError(failure)
        check(K.AssignProcessToJobObject(job, pi.process))
        in_job = B()
        check(K.IsProcessInJob(pi.process, job, c.byref(in_job)))
        if not in_job.value: raise RuntimeError('process not in expected job')
        if failure == 'verify': raise RuntimeError(failure)
        if failure == 'resume': raise RuntimeError(failure)
        if K.ResumeThread(pi.thread) == 0xffffffff: raise c.WinError(c.get_last_error())
        if K.WaitForSingleObject(pi.process, 10000) != 0: raise RuntimeError('wait failed or timed out')
        exit_code = D()
        check(K.GetExitCodeProcess(pi.process, c.byref(exit_code)))
        if exit_code.value != 0: raise RuntimeError(f'child exit {exit_code.value}')
    finally:
        cleanup(job, pi)

def main():
    with tempfile.TemporaryDirectory(prefix='job-proof-', dir=Path(__file__).parent) as folder:
        sentinel = Path(folder) / 'started'
        for stage in ('create_job', 'set_limits', 'set_limits_os', 'create_process', 'assign', 'assign_os', 'verify', 'resume'):
            try:
                run(sentinel, stage)
                raise AssertionError(f'{stage}: injected failure was not raised')
            except RuntimeError as error:
                if str(error) != stage: raise
            if sentinel.exists(): raise AssertionError(f'{stage}: payload ran')
            print(f'{stage}: failure closed; payload did not run')
        run(sentinel)
        if sentinel.read_text() != 'started': raise AssertionError('positive control failed')
        print('positive control: exact process handle is in job before resume; payload ran')
        sentinel.unlink()
        job = check(K.CreateJobObjectW(None, None))
        pi = PROCESS_INFORMATION()
        try:
            limits = EXTENDED_LIMIT()
            limits.basic.flags = 0x2000
            check(K.SetInformationJobObject(job, 9, c.byref(limits), c.sizeof(limits)))
            startup = STARTUPINFO(); startup.cb = c.sizeof(startup)
            payload = 'from pathlib import Path; import sys,time; Path(sys.argv[1]).write_text("started"); time.sleep(120)'
            cmd = c.create_unicode_buffer(subprocess.list2cmdline([sys.executable, '-I', '-B', '-c', payload, str(sentinel)]))
            check(K.CreateProcessW(sys.executable, cmd, None, None, False, 0x00000004 | 0x08000000, None, None, c.byref(startup), c.byref(pi)))
            check(K.AssignProcessToJobObject(job, pi.process))
            if K.ResumeThread(pi.thread) == 0xffffffff: raise c.WinError(c.get_last_error())
            deadline = time.monotonic() + 10
            while not sentinel.exists() and time.monotonic() < deadline: time.sleep(0.02)
            if not sentinel.exists(): raise AssertionError('child did not start')
            check(K.CloseHandle(job)); job = None
            if K.WaitForSingleObject(pi.process, 5000) != 0: raise AssertionError('child survived job closure')
            print('closing the last job handle terminated the running child')
        finally:
            cleanup(job, pi)

if __name__ == '__main__':
    main()
