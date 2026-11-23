#!/usr/bin/env python3
"""Reparar um defeito conhecido de transcrição da identidade age G1, offline.

Uma chave privada que começa com AGE-SECRET-KEY1 (hífen ausente) pode
ter checksum Bech32 incorreto. A identidade só é aceita após o age-keygen
confirmar sua chave pública e o age autenticar TODO o arquivo .age.

Somente chaves fictícias nos testes de CI. NUNCA incluir chaves privadas,
SQLs recuperados ou dados reais em GitHub, Actions, logs ou anexos de chat.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

CHARS = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
HRP = 'age-secret-key-'
PREFIX_BAD = 'AGE-SECRET-KEY1'
GENERATORS = (0x3B6A57B2, 0x26508E6D, 0x1EA119FA, 0x3D4233DD, 0x2A1462B3)


class Reject(Exception):
    pass


def polymod(values: list[int]) -> int:
    check = 1
    for value in values:
        top = check >> 25
        check = ((check & 0x1FFFFFF) << 5) ^ value
        for i, generator in enumerate(GENERATORS):
            if top & (1 << i):
                check ^= generator
    return check


def hrp_expand(hrp: str) -> list[int]:
    return [ord(c) >> 5 for c in hrp] + [0] + [ord(c) & 31 for c in hrp]


def from_five(data: list[int]) -> bytes:
    acc = 0
    bits = 0
    out = bytearray()
    for value in data:
        acc = (acc << 5) | value
        bits += 5
        if bits >= 8:
            bits -= 8
            out.append((acc >> bits) & 255)
    if bits >= 5 or ((acc << (8 - bits)) & 255):
        raise Reject('INVALID_KEY_DATA')
    return bytes(out)


def checksum(data: list[int]) -> str:
    mod = polymod(hrp_expand(HRP) + data + [0] * 6) ^ 1
    return ''.join(CHARS[(mod >> (5 * (5 - i))) & 31] for i in range(6))


def repair(src: Path, dst: Path, archive: Path) -> None:
    if src.resolve() == dst.resolve() or dst.exists():
        raise Reject('OUTPUT_EXISTS_OR_SAME_AS_SOURCE')
    if not src.is_file() or not archive.is_file() or not dst.parent.is_dir():
        raise Reject('INPUT_OR_DESTINATION_UNAVAILABLE')
    if not 100 <= src.stat().st_size <= 4096:
        raise Reject('IDENTITY_SIZE_UNEXPECTED')
    if shutil.which('age-keygen') is None or shutil.which('age') is None:
        raise Reject('AGE_CLI_UNAVAILABLE')
    try:
        lines = src.read_text(encoding='ascii').splitlines()
    except (UnicodeError, OSError):
        raise Reject('IDENTITY_UNREADABLE') from None
    if len(lines) != 3 or not lines[0].startswith('#'):
        raise Reject('IDENTITY_SHAPE_UNEXPECTED')
    pub = re.fullmatch(r'# public key: (age1[0-9a-z]+)', lines[1])
    if pub is None or not lines[2].startswith(PREFIX_BAD):
        raise Reject('KEY_HEADER_NOT_THE_KNOWN_DEFECT')
    encoded = lines[2][len(PREFIX_BAD):]
    if len(encoded) != 58 or any(c not in CHARS.upper() for c in encoded):
        raise Reject('KEY_PAYLOAD_INVALID')
    data = [CHARS.index(c.lower()) for c in encoded[:-6]]
    if len(from_five(data)) != 32:
        raise Reject('KEY_LENGTH_INVALID')
    corrected = (HRP + '1' + ''.join(CHARS[v] for v in data) + checksum(data)).upper()

    # Exclusivamente em diretório privado escolhido pelo usuário;
    # não sobrescrever arquivo existente. Em Windows exigir pasta NTFS privada.
    fd = os.open(dst, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, 'w', encoding='ascii') as out:
            out.write(lines[0] + '\n' + lines[1] + '\n' + corrected + '\n')
        key_check = subprocess.run(['age-keygen', '-y', str(dst)],
                                   capture_output=True, stdin=subprocess.DEVNULL,
                                   timeout=30, check=False)
        if (key_check.returncode != 0
                or key_check.stdout.decode('ascii', 'replace').strip() != pub.group(1)):
            raise Reject('CORRECTED_KEY_PUBKEY_MISMATCH')

        # Descriptografia completa para o descarte local: nenhum SQL gravado.
        with open(os.devnull, 'wb') as sink:
            result = subprocess.run(
                ['age', '--decrypt', '-i', str(dst), str(archive)],
                stdout=sink, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL,
                timeout=180, check=False)
        if result.returncode != 0:
            raise Reject('CORRECTED_KEY_CANNOT_DECRYPT_ARCHIVE')
        print('G1_AGE_KEY_REPAIR=PASS')
        print('G1_PUBLIC_KEY_MATCH=PASS')
        print('G1_REAL_ARCHIVE_DECRYPT_AUTH=PASS')
        print('G1_RESTORATION_VERIFIED=FALSE')
    except BaseException:
        dst.unlink(missing_ok=True)
        raise


def main() -> int:
    parser = argparse.ArgumentParser(description='Offline G1 identity repair; no network.')
    parser.add_argument('--identity', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--archive', required=True, type=Path)
    args = parser.parse_args()
    try:
        repair(args.identity, args.output, args.archive)
        return 0
    except Reject as exc:
        print('G1_AGE_KEY_REPAIR=REJECTED_' + str(exc), file=sys.stderr)
        return 2
    except (OSError, ValueError, subprocess.TimeoutExpired):
        print('G1_AGE_KEY_REPAIR=REJECTED_OPERATION', file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
