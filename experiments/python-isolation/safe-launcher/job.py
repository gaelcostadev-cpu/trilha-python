"""Windows Job primitives for the isolated runner."""
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
