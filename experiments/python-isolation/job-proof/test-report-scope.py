"""Verify that the crash report cannot target or overwrite arbitrary files."""
import importlib.util
from pathlib import Path
import tempfile

here = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('behavior_proof', here / 'behavior-proof.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

for token in ('../outside', r'C:\outside', 'crash-../../outside'):
    try: module.crash_report_path(token)
    except ValueError: pass
    else: raise RuntimeError(f'accepted invalid token: {token}')

with tempfile.TemporaryDirectory(prefix='crash-', dir=here) as folder:
    path = module.crash_report_path(Path(folder).name)
    path.write_text('fictitious-existing-data', encoding='utf-8')
    try: module.publish_crash(path, {'test': True})
    except FileExistsError: pass
    else: raise RuntimeError('overwrote existing report')
    if path.read_text(encoding='utf-8') != 'fictitious-existing-data':
        raise RuntimeError('existing report changed')

print('invalid paths rejected; existing report preserved')
