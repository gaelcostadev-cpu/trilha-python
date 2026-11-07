"""Fixed diagnostic only; emits one JSON result then waits for supervision."""
import ctypes as c
import json
import subprocess
import sys
import time

mode, target = sys.argv[1:3]
result = {'mode': mode}
if mode == 'access':
    k = c.WinDLL('kernel32', use_last_error=True)
    k.OpenProcess.argtypes = [c.c_ulong, c.c_int, c.c_ulong]
    k.OpenProcess.restype = c.c_void_p
    k.CloseHandle.argtypes = [c.c_void_p]
    handle = k.OpenProcess(0x40, False, int(target))
    result.update(opened=bool(handle), error=0 if handle else c.get_last_error())
    if handle: k.CloseHandle(handle)
elif mode == 'memory':
    k = c.WinDLL('kernel32', use_last_error=True)
    k.VirtualAlloc.argtypes = [c.c_void_p, c.c_size_t, c.c_ulong, c.c_ulong]
    k.VirtualAlloc.restype = c.c_void_p
    k.VirtualFree.argtypes = [c.c_void_p, c.c_size_t, c.c_ulong]
    address = k.VirtualAlloc(None, 640 * 1024**2, 0x3000, 4)
    result.update(allocated=bool(address), error=0 if address else c.get_last_error())
    if address: k.VirtualFree(address, 0, 0x8000)
elif mode == 'process':
    try:
        child = subprocess.Popen([sys.executable, '-I', '-B', '-c', 'pass'])
        result.update(created=True, exit=child.wait(timeout=5))
    except OSError as error:
        result.update(created=False, error=error.winerror)
else:
    raise ValueError('unknown fixed mode')
print(json.dumps(result), flush=True)
if sys.argv[3:] != ['host']: time.sleep(15)
