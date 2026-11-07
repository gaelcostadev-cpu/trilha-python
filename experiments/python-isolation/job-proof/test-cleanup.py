"""Fault injection for cleanup ordering, without creating any process."""
from proof import PROCESS_INFORMATION, cleanup

class FakeKernel:
    def __init__(self, failure):
        self.failure = failure
        self.calls = []
        self.stopped = False
    def CloseHandle(self, handle):
        self.calls.append(('close', handle))
        return not (self.failure == 'job' and handle == 1)
    def WaitForSingleObject(self, handle, timeout):
        self.calls.append(('wait', handle))
        return 0 if self.stopped else 0x102
    def TerminateProcess(self, handle, code):
        self.calls.append(('terminate', handle))
        self.stopped = self.failure != 'terminate'
        return self.failure != 'terminate'

pi = PROCESS_INFORMATION()
pi.process, pi.thread = 2, 3
for failure in ('job', 'terminate'):
    kernel = FakeKernel(failure)
    try:
        cleanup(1, pi, kernel)
    except RuntimeError:
        pass
    else:
        raise AssertionError('cleanup failure was not reported')
    if ('terminate', 2) not in kernel.calls: raise AssertionError(kernel.calls)
    if ('close', 3) not in kernel.calls or ('close', 2) not in kernel.calls: raise AssertionError(kernel.calls)
    print(f'{failure}: remaining cleanup actions attempted')
