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
HASHED_FILES = SQL_FILES | {"source_inventory_before.json"}
REQUIRED_FILES = HASHED_FILES | {"manifest.sha256", "manifest.txt"}
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
COPY_REGEXES = {
    name: re.compile(
        rb'^COPY\s+(?:"?public"?\.)"?'
        + name.encode("ascii")
        + rb'"?\s*\('
    )
    for name in REQUIRED_COPY
}


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
                if len(members) != len(REQUIRED_FILES) or set(member_names) != REQUIRED_FILES:
                    raise ValidationError("UNEXPECTED_OR_MISSING_ARCHIVE_FILES")
                if len(member_names) != len(set(member_names)):
                    raise ValidationError("DUPLICATE_ARCHIVE_MEMBER")
                for member in members:
                    if not member.isfile() or not (0 < member.size <= MAX_FILE_BYTES):
                        raise ValidationError("NONREGULAR_OR_INVALID_FILE_SIZE")
                    total += member.size
                    if total > MAX_TOTAL_BYTES:
                        raise ValidationError("ARCHIVE_TOO_LARGE")
                    if member.name in {"manifest.txt", "manifest.sha256",
                                       "source_inventory_before.json"} and (
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
                                    for name, regex in COPY_REGEXES.items():
                                        if regex.match(line):
                                            copy_seen.add(name)
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

        if copy_seen != set(REQUIRED_COPY):
            raise ValidationError("ESSENTIAL_COPY_COMMANDS_MISSING")
        raw_sha = metadata["manifest.sha256"].decode("ascii")
        entries: dict[str, str] = {}
        for line in raw_sha.splitlines():
            matched = re.fullmatch(r"([a-f0-9]{64})  ([A-Za-z0-9_.-]+)", line)
            if not matched or matched.group(2) in entries:
                raise ValidationError("MANIFEST_FORMAT_INVALID")
            entries[matched.group(2)] = matched.group(1)
        if set(entries) != HASHED_FILES:
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
        }
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

        print("G1_ENCRYPTED_ARCHIVE_INTEGRITY=PASS")
        print("G1_EXPECTED_PROJECT_AND_INVENTORY=PASS")
        print("G1_HASHED_MEMBER_COUNT=6")
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
