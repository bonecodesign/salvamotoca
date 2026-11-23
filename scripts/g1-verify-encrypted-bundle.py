#!/usr/bin/env python3
"""G1: verifica um backup age PRIVADO sem extrair SQL em disco ou abrir rede.

Não é restauração de PostgreSQL, Auth ou Storage. Executar em máquina
confiável, fora do GitHub público, com a chave privada sob controle do fundador.

Uso:
  python3 scripts/g1-verify-encrypted-bundle.py \
    --archive /caminho/backup.tar.gz.age --identity /caminho/chave-age.txt
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile

PROJECT_REF = "yivkqyjdeouxnwtwfekc"
SQL_FILES = frozenset((
    "roles.sql", "schema.sql", "data.sql",
    "history_schema.sql", "history_data.sql",
))
HASHED_FILES = SQL_FILES | {"source_inventory_before.json", "source_schema_inventory_before.json", "source_managed_scope_before.json"}
REQUIRED_FILES = HASHED_FILES | {"manifest.sha256", "manifest.txt"}
LEGACY_HASHED_FILES = SQL_FILES | {"source_inventory_before.json", "source_schema_inventory_before.json"}
LEGACY_REQUIRED_FILES = LEGACY_HASHED_FILES | {"manifest.sha256", "manifest.txt"}
LEGACY_CIPHERTEXT_SHA256 = "f7ae94952411e6314c870d987914cec841f84d026f270908409a4d2f96785678"
REQUIRED_INVENTORY = frozenset((
    "auth_users", "service_requests", "registered_providers",
    "prospected_providers", "prospecting_offers", "commercial_config",
    "migration_versions", "storage_objects",
))
REQUIRED_COPY = (
    "prestadores_prospeccao", "ofertas_prospeccao", "configuracao_comercial",
)
MAX_FILE_BYTES = 150 * 1024 * 1024
MAX_TOTAL_BYTES = 300 * 1024 * 1024
MAX_METADATA_BYTES = 64 * 1024
PUBLIC_COPY_HEADER = re.compile(rb'^COPY\s+(?:"?public"?\.)"?([a-z][a-z0-9_]*)"?\s*\(')


class ValidationError(Exception):
    """Fixed, nonsensitive error labels only."""


def read_backup(archive: Path, identity: Path) -> None:
    if not archive.is_file() or not archive.stat().st_size:
        raise ValidationError("ARCHIVE_NOT_FOUND_OR_EMPTY")
    if not identity.is_file() or not identity.stat().st_size:
        raise ValidationError("PRIVATE_KEY_NOT_FOUND_OR_EMPTY")
    if shutil.which("age") is None:
        raise ValidationError("AGE_CLI_MISSING")
    # Testes na CI podem usar CHAVES FICTICIAS marcadas explicitamente.
    # Não carregar a chave privada verdadeira em runner de repositório público.
    if os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get(
        "G1_SYNTHETIC_CI_ONLY"
    ) != "true":
        raise ValidationError("PUBLIC_CI_PRIVATE_KEY_BLOCKED")

    with tempfile.TemporaryDirectory(prefix="salvamotoca-g1-verify-") as private:
        plaintext = Path(private) / "package.tar.gz"
        try:
            subprocess.run(
                ["age", "--decrypt", "-i", str(identity), "-o", str(plaintext),
                 str(archive)],
                check=True, stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                timeout=180,
            )
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            raise ValidationError("AGE_DECRYPT_FAILED") from None
        if not plaintext.is_file() or not plaintext.stat().st_size:
            raise ValidationError("DECRYPTED_ARCHIVE_MISSING")

        hashes: dict[str, str] = {}
        metadata: dict[str, bytes] = {}
        copy_seen: set[str] = set()
        total = 0
        try:
            with tarfile.open(plaintext, mode="r:gz") as package:
                members = package.getmembers()
                member_names = [m.name for m in members]
                # Não usar tar.extract(): caminho, links e arquivos fora da
                # lista aprovada são rejeitados antes de ler quaisquer dados.
                if len(member_names) != len(set(member_names)):
                    raise ValidationError("DUPLICATE_ARCHIVE_MEMBER")
                member_set = set(member_names)
                if member_set == REQUIRED_FILES and len(members) == len(REQUIRED_FILES):
                    legacy = False
                elif member_set == LEGACY_REQUIRED_FILES and len(members) == len(LEGACY_REQUIRED_FILES):
                    legacy = True
                    # Apenas o ciphertext histórico exato previamente auditado pode ser usado.
                    # CI testa pacote FICTÍCIO com marcador de teste explícito.
                    if os.environ.get("G1_SYNTHETIC_CI_ONLY") != "true":
                        if hashlib.sha256(archive.read_bytes()).hexdigest() != LEGACY_CIPHERTEXT_SHA256:
                            raise ValidationError("UNRECOGNIZED_LEGACY_CIPHERTEXT")
                else:
                    raise ValidationError("UNEXPECTED_OR_MISSING_ARCHIVE_FILES")
                for member in members:
                    if not member.isfile() or not (0 < member.size <= MAX_FILE_BYTES):
                        raise ValidationError("NONREGULAR_OR_INVALID_FILE_SIZE")
                    total += member.size
                    if total > MAX_TOTAL_BYTES:
                        raise ValidationError("ARCHIVE_TOO_LARGE")
                    if member.name in {"manifest.txt", "manifest.sha256",
                                       "source_inventory_before.json",
                                       "source_schema_inventory_before.json",
                                       "source_managed_scope_before.json"} and (
                        member.size > MAX_METADATA_BYTES
                    ):
                        raise ValidationError("METADATA_TOO_LARGE")
                    fileobj = package.extractfile(member)
                    if fileobj is None:
                        raise ValidationError("ARCHIVE_MEMBER_UNREADABLE")
                    sha = hashlib.sha256()
                    small = bytearray()
                    with fileobj:
                        if member.name == "data.sql":
                            # Percorrer linhas sem materializar dados de pessoa.
                            for line in fileobj:
                                sha.update(line)
                                if len(line) <= 8192:
                                    match = PUBLIC_COPY_HEADER.match(line)
                                    if match:
                                        copy_seen.add(match.group(1).decode("ascii"))
                        else:
                            while True:
                                chunk = fileobj.read(1024 * 1024)
                                if not chunk:
                                    break
                                sha.update(chunk)
                                if member.name not in SQL_FILES:
                                    small.extend(chunk)
                    hashes[member.name] = sha.hexdigest()
                    if member.name not in SQL_FILES:
                        metadata[member.name] = bytes(small)
        except (OSError, EOFError, tarfile.TarError) as exc:
            raise ValidationError("ARCHIVE_STRUCTURE_INVALID") from None

        if not set(REQUIRED_COPY).issubset(copy_seen):
            raise ValidationError("ESSENTIAL_COPY_COMMANDS_MISSING")
        raw_sha = metadata["manifest.sha256"].decode("ascii")
        entries: dict[str, str] = {}
        for line in raw_sha.splitlines():
            matched = re.fullmatch(r"([a-f0-9]{64})  ([A-Za-z0-9_.-]+)", line)
            if not matched or matched.group(2) in entries:
                raise ValidationError("MANIFEST_FORMAT_INVALID")
            entries[matched.group(2)] = matched.group(1)
        expected_hashes = LEGACY_HASHED_FILES if legacy else HASHED_FILES
        if set(entries) != expected_hashes:
            raise ValidationError("MANIFEST_FILE_SET_MISMATCH")
        for filename, expected in entries.items():
            if hashes.get(filename) != expected:
                raise ValidationError("MANIFEST_SHA256_MISMATCH")

        settings: dict[str, str] = {}
        for line in metadata["manifest.txt"].decode("utf-8").splitlines():
            if line.count("=") != 1:
                raise ValidationError("BACKUP_METADATA_INVALID")
            k, v = line.split("=", 1)
            if not k or k in settings:
                raise ValidationError("BACKUP_METADATA_INVALID")
            settings[k] = v
        required_settings = {
            "project_ref": PROJECT_REF,
            "environment": "TESTES",
            "backup_kind": "logical_sql",
            "g1_restoration_verified": "false",
            "storage_physical_objects_included": "false",
            "auth_managed_schema_recovery_proven": "false",
            "storage_bucket_configuration_recovery_proven": "false",
        }
        if legacy:
            del required_settings["auth_managed_schema_recovery_proven"]
            del required_settings["storage_bucket_configuration_recovery_proven"]
        if settings != required_settings:
            raise ValidationError("BACKUP_PROJECT_OR_SCOPE_MISMATCH")

        try:
            inventory = json.loads(
                metadata["source_inventory_before.json"].decode("utf-8")
            )
        except (UnicodeError, json.JSONDecodeError):
            raise ValidationError("BACKUP_INVENTORY_INVALID") from None
        if not isinstance(inventory, dict) or set(inventory) != REQUIRED_INVENTORY:
            raise ValidationError("BACKUP_INVENTORY_KEYS_INVALID")
        if any(type(inventory[field]) is not int or inventory[field] < 0
               for field in REQUIRED_INVENTORY):
            raise ValidationError("BACKUP_INVENTORY_VALUES_INVALID")
        if inventory["storage_objects"] != 0:
            raise ValidationError("STORAGE_PHYSICAL_FILES_NOT_INCLUDED")
        if not legacy:
            # Managed Auth and Storage services are NOT part of the SQL restore.
            # Their source metadata is hashed/encrypted for future private review.
            # Refuse any package containing Auth rows or physical Storage objects.
            try:
                managed = json.loads(
                    metadata["source_managed_scope_before.json"].decode("utf-8")
                )
            except (UnicodeError, json.JSONDecodeError):
                raise ValidationError("MANAGED_SCOPE_INVENTORY_INVALID") from None
            auth_fields = {
                "auth_users", "auth_identities", "auth_sessions",
                "auth_refresh_tokens", "auth_mfa_factors", "auth_flow_state",
            }
            managed_keys = auth_fields | {
                "storage_objects", "storage_buckets", "storage_policy_count",
                "storage_policy_sha256"
            }
            if not isinstance(managed, dict) or set(managed) != managed_keys:
                raise ValidationError("MANAGED_SCOPE_INVENTORY_INVALID")
            if any(type(managed[k]) is not int or managed[k] < 0
                   for k in auth_fields | {"storage_objects", "storage_policy_count"}):
                raise ValidationError("MANAGED_SCOPE_COUNTS_INVALID")
            policy_hash = managed["storage_policy_sha256"]
            if (type(policy_hash) is not str
                or re.fullmatch(r"[0-9a-f]{64}", policy_hash) is None
                or policy_hash != "c75f54c93a080d4552558ce59539c2e8813a645b5dfdfe44ebd328839aad2254"):
                raise ValidationError("STORAGE_POLICY_DEFINITION_CHANGED")
            if any(managed[k] != 0 for k in auth_fields):
                raise ValidationError("AUTH_MANAGED_DATA_NOT_INCLUDED")
            if managed["storage_objects"] != 0:
                raise ValidationError("STORAGE_PHYSICAL_FILES_NOT_INCLUDED")
            buckets = managed["storage_buckets"]
            if not isinstance(buckets, list) or len(buckets) != 1:
                raise ValidationError("STORAGE_MANAGED_CONFIGURATION_CHANGED")
            bucket = buckets[0]
            if (not isinstance(bucket, dict)
                or set(bucket) != {"name", "private", "file_size_limit", "allowed_mime_types"}
                or type(bucket["name"]) is not str
                or type(bucket["private"]) is not bool
                or type(bucket["file_size_limit"]) is not int
                or not isinstance(bucket["allowed_mime_types"], list)
                or any(type(m) is not str for m in bucket["allowed_mime_types"])):
                raise ValidationError("STORAGE_MANAGED_CONFIGURATION_CHANGED")
            if managed["storage_policy_count"] != 3 or bucket != {
                "name": "request-photos", "private": True,
                "file_size_limit": 5242880,
                "allowed_mime_types": ["image/jpeg"],
            }:
                raise ValidationError("STORAGE_MANAGED_CONFIGURATION_CHANGED")

        else:
            # Formato histórico não comprova toda a cobertura Auth/Storage.
            if inventory["auth_users"] != 0:
                raise ValidationError("LEGACY_AUTH_DATA_NOT_COVERED")

        try:
            schema_inventory = json.loads(
                metadata["source_schema_inventory_before.json"].decode("utf-8")
            )
        except (UnicodeError, json.JSONDecodeError):
            raise ValidationError("PUBLIC_SCHEMA_INVENTORY_INVALID") from None
        if not isinstance(schema_inventory, dict) or set(schema_inventory) != {"tables"}:
            raise ValidationError("PUBLIC_SCHEMA_INVENTORY_INVALID")
        table_items = schema_inventory["tables"]
        if not isinstance(table_items, list) or not table_items or len(table_items) > 500:
            raise ValidationError("PUBLIC_SCHEMA_INVENTORY_INVALID")
        table_names = set()
        for item in table_items:
            if not isinstance(item, dict) or set(item) != {
                "name", "rls_enabled", "policy_count"
            }:
                raise ValidationError("PUBLIC_SCHEMA_INVENTORY_INVALID")
            name = item["name"]
            if not isinstance(name, str) or not re.fullmatch(r"[a-z][a-z0-9_]*", name):
                raise ValidationError("PUBLIC_SCHEMA_INVENTORY_INVALID")
            if name in table_names or type(item["rls_enabled"]) is not bool or (
                type(item["policy_count"]) is not int or item["policy_count"] < 0
            ):
                raise ValidationError("PUBLIC_SCHEMA_INVENTORY_INVALID")
            table_names.add(name)
        if copy_seen != table_names:
            raise ValidationError("PUBLIC_COPY_COVERAGE_MISMATCH")

        print("G1_ENCRYPTED_ARCHIVE_INTEGRITY=PASS")
        print("G1_EXPECTED_PROJECT_AND_INVENTORY=PASS")
        print("G1_HASHED_MEMBER_COUNT=" + ("7" if legacy else "8"))
        print("G1_PACKAGE_VERSION=" + ("HISTORICAL_PINNED" if legacy else "MANAGED_SCOPE_V2"))
        print("G1_MANAGED_SCOPE_NOT_RESTORED=" + ("UNKNOWN_LEGACY" if legacy else "CONFIRMED"))
        print("G1_ESSENTIAL_COPY_HEADERS=PASS")
        print("G1_RESTORATION_VERIFIED=FALSE")
        print("G1=BLOCKED")
        print("RELEASE=NO_GO")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Verificar offline a integridade de pacote G1 criptografado."
    )
    parser.add_argument("--archive", required=True, type=Path)
    parser.add_argument("--identity", required=True, type=Path)
    args = parser.parse_args()
    try:
        read_backup(args.archive, args.identity)
        return 0
    except ValidationError as exc:
        print("G1_ARCHIVE_REJECTED=" + str(exc), file=sys.stderr)
        print("G1=BLOCKED", file=sys.stderr)
        return 2
    except (OSError, ValueError, UnicodeError) as exc:
        # Não ecoar paths, SQL, segredos ou erro de ferramenta.
        print("G1_ARCHIVE_REJECTED=INVALID_PACKAGE", file=sys.stderr)
        print("G1=BLOCKED", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
