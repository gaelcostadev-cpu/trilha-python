import ctypes as c
from ctypes import wintypes as w
import json

k = c.WinDLL('kernel32', use_last_error=True)
a = c.WinDLL('advapi32', use_last_error=True)
k.GetCurrentProcess.restype = w.HANDLE
k.CloseHandle.argtypes = [w.HANDLE]
k.LocalFree.argtypes = [w.HLOCAL]
a.OpenProcessToken.argtypes = [w.HANDLE, w.DWORD, c.POINTER(w.HANDLE)]
a.GetTokenInformation.argtypes = [w.HANDLE, c.c_int, c.c_void_p, w.DWORD, c.POINTER(w.DWORD)]
a.ConvertSidToStringSidW.argtypes = [c.c_void_p, c.POINTER(w.LPWSTR)]

class SID_AND_ATTRIBUTES(c.Structure):
    _fields_ = [('Sid', c.c_void_p), ('Attributes', w.DWORD)]

def info(token, kind):
    size = w.DWORD()
    a.GetTokenInformation(token, kind, None, 0, c.byref(size))
    if not size.value:
        raise c.WinError(c.get_last_error())
    buf = c.create_string_buffer(size.value)
    if not a.GetTokenInformation(token, kind, buf, size, c.byref(size)):
        raise c.WinError(c.get_last_error())
    return buf

token = w.HANDLE()
if not a.OpenProcessToken(k.GetCurrentProcess(), 8, c.byref(token)):
    raise c.WinError(c.get_last_error())
try:
    is_appcontainer = bool(c.cast(info(token, 29), c.POINTER(w.DWORD)).contents.value)
    capabilities = info(token, 30)
    count = c.cast(capabilities, c.POINTER(w.DWORD)).contents.value
    class GROUPS(c.Structure):
        _fields_ = [('Count', w.DWORD), ('Items', SID_AND_ATTRIBUTES * count)]
    groups = c.cast(capabilities, c.POINTER(GROUPS)).contents
    found = set()
    for item in groups.Items:
        sid = w.LPWSTR()
        if not a.ConvertSidToStringSidW(item.Sid, c.byref(sid)):
            raise c.WinError(c.get_last_error())
        try:
            found.add(sid.value)
        finally:
            k.LocalFree(sid)
    print(json.dumps({'appcontainer': is_appcontainer, 'capability_count': count, 'internetClient': 'S-1-15-3-1' in found, 'internetClientServer': 'S-1-15-3-2' in found, 'privateNetworkClientServer': 'S-1-15-3-3' in found}))
finally:
    k.CloseHandle(token)
