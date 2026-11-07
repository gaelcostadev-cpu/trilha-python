import ctypes as c, json, uuid, traceback
from ctypes import wintypes as w
ole=c.WinDLL('ole32',use_last_error=True); aut=c.WinDLL('oleaut32',use_last_error=True)
class GUID(c.Structure): _fields_=[('a',w.DWORD),('b',w.WORD),('d',w.WORD),('e',c.c_ubyte*8)]
def guid(s): return GUID.from_buffer_copy(uuid.UUID(s).bytes_le)
ole.CoInitializeEx.argtypes=[c.c_void_p,w.DWORD];ole.CoInitializeEx.restype=c.c_long
ole.CoCreateInstance.argtypes=[c.POINTER(GUID),c.c_void_p,w.DWORD,c.POINTER(GUID),c.POINTER(c.c_void_p)];ole.CoCreateInstance.restype=c.c_long
ole.CoUninitialize.argtypes=[]
aut.SysAllocString.argtypes=[w.LPCWSTR];aut.SysAllocString.restype=c.c_void_p
aut.SysFreeString.argtypes=[c.c_void_p]
result={'init':None,'create':None,'connect':None}
try:
 result['init']=ole.CoInitializeEx(None,0)
 clsid=guid('4590f811-1d3a-11d0-891f-00aa004b2e24');iid=guid('dc12a687-737f-11cf-884d-00aa004b2e24');loc=c.c_void_p()
 result['create']=ole.CoCreateInstance(c.byref(clsid),None,1,c.byref(iid),c.byref(loc))
 if result['create']==0:
  v=c.cast(loc,c.POINTER(c.POINTER(c.c_void_p))).contents
  call=c.WINFUNCTYPE(c.c_long,c.c_void_p,c.c_void_p,c.c_void_p,c.c_void_p,c.c_void_p,w.LONG,c.c_void_p,c.c_void_p,c.POINTER(c.c_void_p))(v[3]); release=c.WINFUNCTYPE(w.ULONG,c.c_void_p)(v[2])
  name=aut.SysAllocString('ROOT\\CIMV2');svc=c.c_void_p()
  try:
   result['connect']=call(loc,name,None,None,None,0,None,None,c.byref(svc))
   if svc:
    svt=c.cast(svc,c.POINTER(c.POINTER(c.c_void_p))).contents;c.WINFUNCTYPE(w.ULONG,c.c_void_p)(svt[2])(svc)
  finally: aut.SysFreeString(name);release(loc)
except Exception as e: result['error']=str(e); result['trace']=traceback.format_exc()
finally: ole.CoUninitialize()
print(json.dumps(result),flush=True)


