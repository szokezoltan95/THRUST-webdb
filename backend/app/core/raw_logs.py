"""Validation helpers for raw measurement archives."""
from __future__ import annotations

import base64
import binascii
import gzip
import io
import zlib


class RawUploadInvalid(ValueError):
    """The uploaded raw measurement archive is malformed."""


class RawUploadTooLarge(RawUploadInvalid):
    """The compressed or expanded measurement exceeds the server limit."""


MAX_EXPANDED_RAW_BYTES = 250_000_000
MAX_HEADER_BYTES = 4096


def decode_raw_upload(encoded: str | None, *, file_name: str | None, content_type: str, max_upload_bytes: int) -> bytes | None:
    """Validate gzip TSV while retaining its compressed bytes on the server."""
    if not encoded:
        return None
    try:
        raw_bytes = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise RawUploadInvalid("Raw log nie je platný Base64 súbor.") from exc
    if not raw_bytes:
        raise RawUploadInvalid("Raw log je prázdny.")
    if len(raw_bytes) > max_upload_bytes:
        raise RawUploadTooLarge("Raw log prekračuje povolenú veľkosť.")
    is_gzip = content_type == "application/gzip" or bool(file_name and file_name.lower().endswith(".gz"))
    if not is_gzip:
        return raw_bytes
    if not raw_bytes.startswith(b"\x1f\x8b"):
        raise RawUploadInvalid("Súbor je označený ako gzip, ale nemá platnú gzip hlavičku.")
    try:
        with gzip.GzipFile(fileobj=io.BytesIO(raw_bytes), mode="rb") as stream:
            header = stream.readline(MAX_HEADER_BYTES + 1)
            if len(header) > MAX_HEADER_BYTES or not header.endswith(b"\n"):
                raise RawUploadInvalid("Gzip log nemá platnú hlavičku TSV.")
            header = header.removeprefix(b"\xef\xbb\xbf")
            if not header.startswith((b"TIME\t", b"Time[s]\t")):
                raise RawUploadInvalid("Gzip log neobsahuje známu SCoPE/SimPLE TSV hlavičku.")
            expanded_size = len(header)
            while True:
                chunk = stream.read(64 * 1024)
                if not chunk:
                    break
                expanded_size += len(chunk)
                if expanded_size > MAX_EXPANDED_RAW_BYTES:
                    raise RawUploadTooLarge("Rozbalený raw log prekračuje bezpečný limit.")
    except RawUploadInvalid:
        raise
    except (OSError, EOFError, zlib.error) as exc:
        raise RawUploadInvalid("Gzip raw log je poškodený alebo neúplný.") from exc
    return raw_bytes
