"""G1: teste adversarial com chaves temporárias inteiramente fictícias."""
import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts' / 'g1-repair-age-identity-offline.py'
CHARS = 'QPZRY9X8GF2TVDW0S3JN54KHCE6MUA7L'


@unittest.skipUnless(shutil.which('age') and shutil.which('age-keygen'), 'requires age CLI')
class AgeIdentityRepairTests(unittest.TestCase):
    def setUp(self):
        work = tempfile.TemporaryDirectory(prefix='g1-repair-synthetic-')
        self.addCleanup(work.cleanup)
        self.folder = pathlib.Path(work.name)
        self.real = self.folder / 'fictional-original'
        self.bad = self.folder / 'fictional-bad'
        self.out = self.folder / 'fictional-repaired'
        self.archive = self.folder / 'fixture.age'
        msg = self.folder / 'fixture.txt'
        msg.write_text('FICTITIOUS TEST DATA ONLY\n', encoding='ascii')
        subprocess.run(['age-keygen', '-o', str(self.real)], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        pub = subprocess.check_output(['age-keygen', '-y', str(self.real)],
                                      stderr=subprocess.DEVNULL).decode().strip()
        subprocess.run(['age', '-r', pub, '-o', str(self.archive), str(msg)],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        lines = self.real.read_text().splitlines()
        self.assertEqual(len(lines), 3)
        self.assertTrue(lines[2].startswith('AGE-SECRET-KEY-1'))
        wrong = lines[2].replace('AGE-SECRET-KEY-1', 'AGE-SECRET-KEY1', 1)
        bad_checksum = 'QQQQQQ' if wrong[-6:] != 'QQQQQQ' else 'PPPPPP'
        self.bad.write_text('\n'.join(lines[:2] + [wrong[:-6] + bad_checksum]) + '\n')

    def invoke(self, src=None, dst=None):
        return subprocess.run(
            [sys.executable, str(SCRIPT), '--identity', str(src or self.bad),
             '--output', str(dst or self.out), '--archive', str(self.archive)],
            capture_output=True, text=True, check=False)

    def test_corrects_only_with_matching_public_key_and_archive(self):
        result = self.invoke()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('G1_AGE_KEY_REPAIR=PASS', result.stdout)
        self.assertNotIn('AGE-SECRET-KEY', result.stdout + result.stderr)
        self.assertEqual(
            subprocess.check_output(['age-keygen', '-y', str(self.out)]),
            subprocess.check_output(['age-keygen', '-y', str(self.real)]))

    def test_rejects_corrupted_key_data(self):
        lines = self.bad.read_text().splitlines()
        line = lines[2]
        index = len('AGE-SECRET-KEY1') + 2
        character = 'P' if line[index] != 'P' else 'Q'
        lines[2] = line[:index] + character + line[index + 1:]
        tampered = self.folder / 'tampered'
        tampered.write_text('\n'.join(lines) + '\n')
        result = self.invoke(src=tampered)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.out.exists())
        self.assertNotIn('AGE-SECRET-KEY', result.stdout + result.stderr)

    def test_does_not_overwrite_an_existing_file(self):
        self.out.write_text('PRESERVE PRIVATE FILE', encoding='ascii')
        result = self.invoke()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.out.read_text(), 'PRESERVE PRIVATE FILE')


if __name__ == '__main__':
    unittest.main()
