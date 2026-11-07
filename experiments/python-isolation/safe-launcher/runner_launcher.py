"""Supervised PSEC Python runner."""
import ctypes as c
import json
import msvcrt
import os
from pathlib import Path
import subprocess
import threading
import time

from job import K, B, D, H, EXTENDED_LIMIT, PROCESS_INFORMATION, STARTUPINFO, check, cleanup

ROOT = Path(__file__).resolve().parent

class STARTUPINFOEX(c.Structure):
    _fields_ = [('startup', STARTUPINFO), ('attributes', c.c_void_p)]

K.InitializeProcThreadAttributeList.argtypes = [c.c_void_p, D, D, c.POINTER(c.c_size_t)]
K.InitializeProcThreadAttributeList.restype = B
K.UpdateProcThreadAttribute.argtypes = [c.c_void_p, D, c.c_size_t, c.c_void_p, c.c_size_t, c.c_void_p, c.c_void_p]
K.UpdateProcThreadAttribute.restype = B
K.DeleteProcThreadAttributeList.argtypes = [c.c_void_p]
K.DeleteProcThreadAttributeList.restype = None


class BASIC_ACCOUNTING(c.Structure):
    _fields_ = [('total_user', c.c_longlong), ('total_kernel', c.c_longlong), ('period_user', c.c_longlong), ('period_kernel', c.c_longlong), ('page_faults', D), ('total_processes', D), ('active_processes', D), ('terminated_processes', D)]

K.TerminateJobObject.argtypes = [H, D]
K.TerminateJobObject.restype = B
K.QueryInformationJobObject.argtypes = [H, c.c_int, c.c_void_p, D, c.POINTER(D)]
K.QueryInformationJobObject.restype = B

def stop_and_confirm(job):
    check(K.TerminateJobObject(job, 99))
    deadline = time.monotonic() + 5
    while True:
        accounting = BASIC_ACCOUNTING()
        check(K.QueryInformationJobObject(job, 1, c.byref(accounting), c.sizeof(accounting), None))
        if accounting.active_processes == 0: return
        if time.monotonic() >= deadline: raise RuntimeError('Encerramento do Job não confirmado.')
        time.sleep(.01)


class Runner:
    def __init__(self, electron):
        self.electron = str(Path(electron).resolve(strict=True))
        self.confirmed_closed = False
        self.lock = threading.Lock()
        self.active = False
        self.cancelled = threading.Event()

    def cancel(self):
        with self.lock:
            if not self.active:
                return False
            self.cancelled.set()
            return True

    def execute(self, code, stdin=''):
        if not callable(code) and (not isinstance(code, str) or not code.strip() or not isinstance(stdin, str)):
            raise ValueError('Código ou entrada inválidos.')
        try:
            if not callable(code) and (len(code.encode('utf-8')) > 100000 or len(stdin.encode('utf-8')) > 50000):
                raise ValueError('Código ou entrada inválidos.')
        except UnicodeEncodeError as error:
            raise ValueError('Código ou entrada inválidos.') from error
        with self.lock:
            if self.active:
                raise RuntimeError('Já existe uma execução em andamento.')
            self.active = True
            self.cancelled.clear()
        job, pi, descriptors, threads = None, PROCESS_INFORMATION(), [], []
        attribute_list = None
        chunks = [bytearray(), bytearray()]
        io_errors = []
        ready = threading.Event()
        try:
            job = check(K.CreateJobObjectW(None, None))
            limits = EXTENDED_LIMIT()
            limits.basic.flags = 0x2000 | 0x8 | 0x100 | 0x200
            limits.basic.active_processes = 8
            limits.process_memory, limits.job_memory = 512 * 1024**2, 1024 * 1024**2
            check(K.SetInformationJobObject(job, 9, c.byref(limits), c.sizeof(limits)))
            def make_pipe():
                pair = os.pipe()
                descriptors.extend(pair)
                return pair
            input_read, input_write = make_pipe()
            out_read, out_write = make_pipe()
            err_read, err_write = make_pipe()
            for fd in (input_read, out_write, err_write):
                os.set_handle_inheritable(msvcrt.get_osfhandle(fd), True)
            startup = STARTUPINFOEX()
            startup.startup.cb, startup.startup.flags = c.sizeof(startup), 0x100
            startup.startup.stdin = msvcrt.get_osfhandle(input_read)
            startup.startup.stdout = msvcrt.get_osfhandle(out_write)
            startup.startup.stderr = msvcrt.get_osfhandle(err_write)
            size = c.c_size_t()
            if K.InitializeProcThreadAttributeList(None, 1, 0, c.byref(size)) or not size.value or c.get_last_error() != 122:
                raise RuntimeError('Não foi possível calcular a lista de handles.')
            attribute_buffer = c.create_string_buffer(size.value)
            check(K.InitializeProcThreadAttributeList(attribute_buffer, 1, 0, c.byref(size)))
            attribute_list = c.cast(attribute_buffer, c.c_void_p)
            handles = (H * 3)(startup.startup.stdin, startup.startup.stdout, startup.startup.stderr)
            check(K.UpdateProcThreadAttribute(attribute_list, 0, 0x20002, c.cast(handles, c.c_void_p), c.sizeof(handles), None, None))
            startup.attributes = attribute_list
            command = c.create_unicode_buffer(subprocess.list2cmdline([self.electron, str(ROOT / 'helper_launcher.mjs')]))
            system_root = os.environ.get('SystemRoot')
            if not system_root or not Path(system_root).is_absolute():
                raise RuntimeError('SystemRoot indisponível.')
            environment = {'SystemRoot': system_root, 'ELECTRON_RUN_AS_NODE': '1'}
            block = c.create_unicode_buffer('\0'.join(f'{k}={v}' for k, v in sorted(environment.items(), key=lambda item: item[0].upper())) + '\0\0')
            check(K.CreateProcessW(self.electron, command, None, None, True, 0x08000004 | 0x400 | 0x80000, c.cast(block, c.c_void_p), None, c.cast(c.byref(startup), c.POINTER(STARTUPINFO)), c.byref(pi)))
            for fd in (input_read, out_write, err_write):
                os.close(fd); descriptors.remove(fd)
            check(K.AssignProcessToJobObject(job, pi.process))
            member = B()
            check(K.IsProcessInJob(pi.process, job, c.byref(member)))
            if not member.value:
                raise RuntimeError('O limite de recursos não foi confirmado.')
            if self.cancelled.is_set():
                return {'reason': 'cancelled', 'stdout': '', 'stderr': ''}
            if K.ResumeThread(pi.thread) == 0xffffffff:
                raise c.WinError(c.get_last_error())

            def write_request():
                try:
                    with os.fdopen(input_write, 'wb') as stream:
                        if not ready.wait(15) or b'TRILHA_LAUNCHER_READY\n' not in chunks[1]: raise RuntimeError('Inicialização não confirmada.')
                        request = code() if callable(code) else {'code': code, 'input': stdin}
                        if not isinstance(request, dict) or set(request) != {'code', 'input'}: raise ValueError('Solicitação inválida.')
                        if hasattr(self, '_test_handle'): request['test_handle'] = self._test_handle
                        if getattr(self, '_test_environment', False): request['test_environment'] = True
                        if getattr(self, '_test_ready', False): request['test_ready'] = True
                        stream.write(json.dumps(request, ensure_ascii=True).encode('ascii'))
                except Exception as error:
                    io_errors.append(error)

            def read_result(fd, index, limit):
                try:
                    with os.fdopen(fd, 'rb') as stream:
                        while True:
                            data = os.read(stream.fileno(), 8192)
                            if not data: break
                            if len(chunks[index]) + len(data) > limit:
                                io_errors.append(RuntimeError('Resposta excedeu o limite.'))
                                break
                            chunks[index].extend(data)
                            if index == 1 and b'TRILHA_LAUNCHER_READY\n' in chunks[index]: ready.set()
                            if index == 1 and getattr(self, '_test_ready', False) and b'TRILHA_PSEC_TEST_READY ' in chunks[index]:
                                marker = bytes(chunks[index]).split(b'TRILHA_PSEC_TEST_READY ', 1)[1]
                                if b'\n' in marker:
                                    os.write(2, b'TRILHA_PSEC_TEST_READY ' + str(pi.pid).encode('ascii') + b' ' + marker.split(b'\n', 1)[0] + b'\n')
                                    self._test_ready = False
                except (OSError, ValueError) as error:
                    io_errors.append(error)

            for target, args, fd in ((write_request, (), input_write), (read_result, (out_read, 0, 524288), out_read), (read_result, (err_read, 1, 8192), err_read)):
                thread = threading.Thread(target=target, args=args, daemon=True)
                thread.start(); threads.append(thread); descriptors.remove(fd)
            deadline = time.monotonic() + 12
            reason = None
            while True:
                status = K.WaitForSingleObject(pi.process, 50)
                if status == 0: break
                if status != 0x102: raise RuntimeError('Falha ao aguardar o processo.')
                if self.cancelled.is_set(): reason = 'cancelled'; break
                if time.monotonic() >= deadline: reason = 'timeout'; break
            if reason:
                stop_and_confirm(job)
                if K.WaitForSingleObject(pi.process, 5000) != 0: raise RuntimeError('Processo não encerrou.')
            ready.set()
            for thread in threads: thread.join(5)
            if any(thread.is_alive() for thread in threads): raise RuntimeError('Canais não foram encerrados.')
            if reason: return {'reason': reason, 'stdout': '', 'stderr': ''}
            exit_code = D(); check(K.GetExitCodeProcess(pi.process, c.byref(exit_code)))
            if exit_code.value or io_errors: raise RuntimeError('Execução isolada indisponível: ' + chunks[1].decode('utf8', 'replace')[:1024])
            result = json.loads(chunks[0].decode('utf8'))
            if result.get('reason') not in ('completed', 'timeout', 'output_limit') or not isinstance(result.get('stdout'), str) or not isinstance(result.get('stderr'), str):
                raise RuntimeError('Resposta inválida.')
            return result
        finally:
            if attribute_list:
                K.DeleteProcThreadAttributeList(attribute_list)
            for fd in descriptors:
                try: os.close(fd)
                except OSError: pass
            try:
                failure = None
                try:
                    if job: stop_and_confirm(job)
                except Exception as error: failure = error
                try: cleanup(job, pi)
                except Exception as error:
                    if failure is None: failure = error
                if failure: raise failure
                self.confirmed_closed = True
            finally:
                for thread in threads: thread.join(5)
                with self.lock: self.active = False
