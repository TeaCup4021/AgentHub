from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services.deployment_source import DeploymentSourceResolver


def test_normalize_files_rejects_path_traversal():
    with pytest.raises(ValueError):
        DeploymentSourceResolver.normalize_files({"../index.html": "bad"})


def test_ensure_index_file_reuses_single_html_file():
    files = DeploymentSourceResolver.ensure_index_file({
        "hello.html": "<h1>Hello</h1>",
    })

    assert files["index.html"] == "<h1>Hello</h1>"


def test_ensure_index_file_builds_listing_when_no_html_entry():
    files = DeploymentSourceResolver.ensure_index_file({
        "main.py": "print('hello')",
    })

    assert "index.html" in files
    assert "main.py" in files["index.html"]


def test_extract_preview_files_reuses_inline_html_source():
    artifact = SimpleNamespace(
        content={
            "html": "<!doctype html><h1>Bye, XUPT</h1>",
            "fileName": "bye-xupt.html",
        }
    )

    files = DeploymentSourceResolver.extract_preview_files(artifact)

    assert files == {"bye-xupt.html": "<!doctype html><h1>Bye, XUPT</h1>"}


def test_load_preview_html_from_url_reads_preview_storage(monkeypatch):
    def _get_file(object_name):
        assert object_name == "previews/preview-1.html"
        return b"<!doctype html><h1>Stored Preview</h1>"

    monkeypatch.setattr("app.services.deployment_source.storage.get_file", _get_file)

    html = DeploymentSourceResolver.load_preview_html_from_url(
        "http://localhost:8080/preview/preview-1"
    )

    assert html == "<!doctype html><h1>Stored Preview</h1>"


def test_build_summary_counts_files_and_entry():
    summary = DeploymentSourceResolver.build_summary({
        "index.html": "<h1>Hello</h1>",
        "style.css": "body{}",
    }, source="request")

    assert summary["source"] == "request"
    assert summary["fileCount"] == 2
    assert summary["entryFile"] == "index.html"
    assert summary["files"] == ["index.html", "style.css"]
