"""Experimental gate: execute only after the host has attached resource limits."""
import sys, types
print('TRILHA_SANDBOX_READY', flush=True)
header = sys.stdin.buffer.readline(128)
parts = header.rstrip(b'\n').split(b' ')
if len(parts) != 2 or parts[0] != b'TRILHA_SANDBOX_RUN' or not parts[1].isdigit():
    sys.exit(125)
length = int(parts[1])
if length < 1 or length > 400000:
    sys.exit(125)
source = sys.stdin.buffer.read(length)
if len(source) != length:
    sys.exit(125)
sys.argv = ['<programa>']
module = types.ModuleType('__main__')
module.__file__ = '<programa>'
module.__package__ = None
sys.modules['__main__'] = module
exec(compile(source.decode('utf-8'), '<programa>', 'exec'), module.__dict__)
