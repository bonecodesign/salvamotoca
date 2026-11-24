import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import subprocess

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("reconcile", ROOT/"scripts/g1-reconcile-historical-local.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class LocalReconcileTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.d = Path(self.tmp.name)
        (self.d/"PG_VERSION").write_text("17\n")
        (self.d/"postmaster.pid").write_text(f"123\n{self.d}\n0\n54322\n")
    def test_valid_local_process(self):
        with patch.object(m.os,"readlink",return_value="/local/bin/postgres"):
            self.assertEqual(m.validate_local(self.d,54322),self.d)
    def test_wrong_port(self):
        with self.assertRaises(ValueError): m.validate_local(self.d,54323)
    def test_wrong_major(self):
        (self.d/"PG_VERSION").write_text("16")
        with self.assertRaises(ValueError): m.validate_local(self.d,54322)
    def test_nonpostgres_process(self):
        with patch.object(m.os,"readlink",return_value="/usr/bin/ssh"):
            with self.assertRaises(ValueError): m.validate_local(self.d,54322)
    def test_wrong_data_directory(self):
        (self.d/"postmaster.pid").write_text("123\n/tmp\n0\n54322\n")
        with self.assertRaises(ValueError): m.validate_local(self.d,54322)
    def test_no_postmaster(self):
        (self.d/"postmaster.pid").unlink()
        with self.assertRaises(OSError): m.validate_local(self.d,54322)
    def test_public_ci_blocked_before_database_connection(self):
        argv=["script","--data-dir",str(self.d),"--port","54322","--archive","missing.age","--psql","psql","--pgpass-file","missing","--ack",m.ACK]
        with patch.object(m.sys,"argv",argv), patch.dict(os.environ,{"GITHUB_ACTIONS":"true"}), patch.object(m.subprocess,"run") as run:
            self.assertEqual(m.main(),2)
            run.assert_not_called()
    def test_sql_fails_closed_and_has_all_categories(self):
        s=m.SQL.read_text()
        self.assertIn("G1_WRONG_DESTINATION",s)
        self.assertIn("G1_PREEXISTING_SCHEMA_MISMATCH",s)
        self.assertIn("G1_FINAL_CATALOG_MISMATCH",s)
        self.assertLess(s.index("G1_WRONG_DESTINATION"),s.index("REVOKE ALL"))
        self.assertLess(s.index("G1_FINAL_CATALOG_MISMATCH"),s.index("COMMIT;"))
        self.assertIn("FULL JOIN g1_catalog",s)
        self.assertEqual(s.count("CREATE POLICY")+s.count("create policy"),3)

if __name__ == "__main__": unittest.main()
