"""Fixed synthetic programs only; this experiment accepts no student code."""
import os
import sys
import time

mode = sys.argv[1]
if mode == 'io':
    print('Olá ' + input())
    print('erro', file=sys.stderr)
elif mode == 'failure':
    raise ValueError('synthetic error')
elif mode == 'flood':
    while True:
        os.write(1, b'x' * 8192)
elif mode == 'unicode_flood':
    os.write(1, b'x' * 65535 + 'á'.encode('utf8'))
    while True:
        os.write(1, b'x' * 8192)
elif mode == 'hang':
    time.sleep(60)
else:
    raise ValueError('unknown fixed case')
