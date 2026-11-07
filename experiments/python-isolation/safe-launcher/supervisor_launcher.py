"""One-shot supervisor for isolated Python."""
import json, os, sys, threading, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from runner_launcher import Runner

try:
    if len(sys.argv) != 2 or not Path(sys.argv[1]).is_absolute():
        raise ValueError('Inicialização inválida.')
    runner = Runner(sys.argv[1])
    request_ready = threading.Event()
    request = []
    def control():
        data = bytearray()
        while True:
            byte = os.read(0, 1)
            if not byte: os._exit(1)
            if byte == b'\n': break
            data += byte
            if len(data) > 1000000: os._exit(1)
        if not request_ready.is_set(): os._exit(1)
        try:
            value = json.loads(data)
            if not isinstance(value, dict) or set(value) != {'code', 'input'}: os._exit(1)
            request.append(value)
        except Exception: os._exit(1)
        while True:
            byte = os.read(0, 1)
            if not byte: os._exit(1)
            if byte != b'C': os._exit(1)
            while not runner.cancel(): time.sleep(.005)
    threading.Thread(target=control, daemon=True).start()
    def get_request():
        request_ready.set()
        print(json.dumps({'ready': True}), flush=True)
        deadline = time.monotonic() + 10
        while not request and time.monotonic() < deadline: time.sleep(.005)
        if not request: raise TimeoutError('Solicitação ausente.')
        return request[0]
    result = runner.execute(get_request)
    print(json.dumps({'result': result, 'tree_closed': runner.confirmed_closed}, ensure_ascii=True), flush=True)
except Exception as error:
    print(json.dumps({'error': str(error), 'tree_closed': bool('runner' in globals() and runner.confirmed_closed)}, ensure_ascii=True), flush=True)
    sys.exit(1)
