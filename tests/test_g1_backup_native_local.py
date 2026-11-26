import importlib.util
from pathlib import Path
import os
import tempfile
import unittest
from unittest.mock import patch
import tarfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("native",ROOT/"scripts/g1-backup-native-local.py")
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)
TABLES = [("public",name) for name in ("prestadores_prospeccao","ofertas_prospeccao",
                                      "configuracao_comercial","service_requests","providers")]
TABLES += [("supabase_migrations","schema_migrations")]
CATALOG = [dict(schema=s,table=t,rls=True,kind="r",policies=0) for s,t in TABLES]
TOC = "\n".join(f"{i}; 0 0 {kind} {s} {t} postgres"
                for i,(s,t,kind) in enumerate((s,t,k) for s,t in TABLES
                    for k in ("TABLE","TABLE DATA"),1)).encode()
URI = "postgresql://postgres.yivkqyjdeouxnwtwfekc:fake-password@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require"
PATHS = dict(psql="psql",pg_dump="pg_dump",pg_restore="pg_restore",age="age")
SNAP = dict(catalog=CATALOG,managed={},counts={},roles_metadata={})


class NativeBackupTest(unittest.TestCase):
    def test_scope_and_toc(self):
        names=native.validate_catalog(CATALOG)
        native.validate_toc(TOC,names)
        with self.assertRaises(native.Blocked):
            native.validate_toc(TOC.replace(b"TABLE DATA public providers ",b"TABLE DATA public other "),names)
        with self.assertRaises(native.Blocked):
            native.validate_catalog([dict(x,rls=False) for x in CATALOG])
        with self.assertRaises(native.Blocked):
            native.validate_catalog(CATALOG[:-1])
        with self.assertRaises(native.Blocked):
            native.validate_catalog(CATALOG+[dict(schema="public",table="x;drop",rls=True,kind="r",policies=0)])

    def test_fixed_project_readonly_env(self):
        with patch.dict(os.environ,{"PGSERVICE":"bad","PGOPTIONS":"bad"}):
            env=native.pg_env(URI)
        self.assertNotIn("PGSERVICE",env)
        self.assertEqual(env["PGOPTIONS"],"-c default_transaction_read_only=on")
        self.assertEqual(env["PGPORT"],"5432")
        self.assertEqual(env["PGSSLMODE"],"require")
        with self.assertRaises(ValueError):
            native.pg_env(URI.replace("yivkqyjdeouxnwtwfekc","another_project"))

    def test_no_ci_execution(self):
        with patch.dict(os.environ,{"CI":"true"}):
            self.assertEqual(native.main(),23)

    def test_private_pipeline_mock(self):
        calls=[]
        def fake(args,env,label,timeout=300):
            calls.append(args)
            if args[0]=="pg_dump":
                self.assertIn("--schema=public",args)
                self.assertIn("--schema=supabase_migrations",args)
                self.assertNotIn("fake-password"," ".join(args))
                Path(args[-1]).write_bytes(b"fixture-dump")
                return b""
            if args[0]=="pg_restore": return TOC
            if args[0]=="age":
                self.assertNotIn("PGPASSWORD",env)
                with tarfile.open(args[-1]) as t:
                    self.assertEqual(set(t.getnames()),{"database.dump","inventory.json","toc.txt","manifest.json"})
                Path(args[args.index("-o")+1]).write_bytes(b"mock-ciphertext")
                return b""
            raise AssertionError("unexpected tool")
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(native,"command",side_effect=fake),patch.object(native,"snapshot",return_value=SNAP):
                path,sha=native.backup(Path(tmp),URI,"age1"+"a"*58,PATHS)
            self.assertTrue(path.name.endswith(".age"))
            self.assertEqual(list(Path(tmp).iterdir()),[path])
            self.assertEqual(len(sha),64)
            self.assertEqual(len(calls),3)

    def test_drift_blocks_before_cifering(self):
        def fake(args,env,label,timeout=300):
            if args[0]=="pg_dump":
                Path(args[-1]).write_bytes(b"fixture-dump")
                return b""
            if args[0]=="pg_restore": return TOC
            raise AssertionError("cipher must not run")
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(native,"command",side_effect=fake),patch.object(native,"snapshot",side_effect=[SNAP,dict(SNAP,counts={"changed":1})]):
                with self.assertRaisesRegex(native.Blocked,"ORIGEM_MUDOU"):
                    native.backup(Path(tmp),URI,"age1"+"a"*58,PATHS)
            self.assertEqual(list(Path(tmp).iterdir()),[])


if __name__=="__main__":
    unittest.main()
