"""Trusted experiment: waits until the host attaches an independent job."""
import runpy, sys
print('TRILHA_SANDBOX_READY',flush=True)
if sys.stdin.buffer.readline()!=b'TRILHA_SANDBOX_RUN\n':
    sys.exit(125)
runpy.run_path(sys.argv[1],run_name='__main__')
