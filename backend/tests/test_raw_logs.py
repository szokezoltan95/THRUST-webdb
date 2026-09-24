import base64
import gzip
import pytest

from app.core.raw_logs import RawUploadInvalid, RawUploadTooLarge, decode_raw_upload


def enc(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


@pytest.mark.parametrize("header", [b"TIME\tAILE\tAREQ\n", b"Time[s]\tPOSX\tPOSY\n"])
def test_accepts_scope_and_simple_gzip_tsv(header):
    archive = gzip.compress(header + b"0.0\t1\t2\n")
    assert decode_raw_upload(enc(archive), file_name="run.tsv.gz", content_type="application/gzip", max_upload_bytes=1024) == archive


def test_rejects_corrupt_gzip():
    with pytest.raises(RawUploadInvalid):
        decode_raw_upload(enc(b"\x1f\x8bnot-gzip"), file_name="run.tsv.gz", content_type="application/gzip", max_upload_bytes=1024)


def test_rejects_expanded_archive_over_safety_limit(monkeypatch):
    import app.core.raw_logs as raw_logs
    monkeypatch.setattr(raw_logs, "MAX_EXPANDED_RAW_BYTES", 8)
    archive = gzip.compress(b"TIME\tAILE\n" + b"0\t1\n" * 10)
    with pytest.raises(RawUploadTooLarge):
        decode_raw_upload(enc(archive), file_name="run.tsv.gz", content_type="application/gzip", max_upload_bytes=1024)


def test_accepts_legacy_plain_tsv():
    plain = b"TIME\tAILE\n0\t1\n"
    assert decode_raw_upload(enc(plain), file_name="run.tsv", content_type="text/tab-separated-values", max_upload_bytes=1024) == plain
