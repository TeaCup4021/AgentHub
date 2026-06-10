import pytest

from app.services.artifact_detector import (
    detect_artifacts,
    extract_download_artifacts_from_tool_response,
    strip_artifact_tags,
)


@pytest.mark.asyncio
async def test_detect_deploy_status_self_closing_with_any_attribute_order():
    artifacts = await detect_artifacts(
        'Done <artifact type="deploy_status" url="DEPLOY_REQUEST" title="Deployment status"/>'
    )

    deploy = next(a for a in artifacts if a["artifactType"] == "deploy_status")
    assert deploy["title"] == "Deployment status"
    assert deploy["content"]["url"] == "DEPLOY_REQUEST"
    assert deploy["content"]["status"] == "building"


@pytest.mark.asyncio
async def test_detect_deploy_status_body_tag_and_single_quoted_attrs():
    artifacts = await detect_artifacts(
        "<artifact title='Local app' url='http://localhost:8123' type='deploy_status'></artifact>"
    )

    deploy = next(a for a in artifacts if a["artifactType"] == "deploy_status")
    assert deploy["title"] == "Local app"
    assert deploy["content"]["url"] == "http://localhost:8123"
    assert deploy["content"]["status"] == "deployed"


@pytest.mark.asyncio
async def test_detect_preview_xml_also_emits_html_source(monkeypatch):
    async def _publish_preview_html(_html):
        return "http://localhost:8080/preview/preview-1"

    monkeypatch.setattr(
        "app.services.artifact_detector._publish_preview_html",
        _publish_preview_html,
    )

    artifacts = await detect_artifacts(
        '<artifact type="preview" title="Bye XUPT"><![CDATA[<!doctype html><h1>Bye, XUPT</h1>]]></artifact>'
    )

    preview = next(a for a in artifacts if a["artifactType"] == "preview")
    code = next(a for a in artifacts if a["artifactType"] == "code")
    assert preview["content"]["url"] == "http://localhost:8080/preview/preview-1"
    assert code["content"]["fileName"] == "index.html"
    assert code["content"]["language"] == "html"
    assert "Bye, XUPT" in code["content"]["code"]


def test_strip_artifact_tags_removes_self_closing_deploy_status():
    content = 'Ready <artifact type="deploy_status" url="DEPLOY_REQUEST" title="Deployment status"/>'

    assert strip_artifact_tags(content) == "Ready"


@pytest.mark.asyncio
async def test_detect_artifacts_skips_backend_static_localhost_links():
    artifacts = await detect_artifacts(
        "Open http://localhost:8080/index.html or http://localhost:8080/xupt.html。"
    )

    assert [a for a in artifacts if a["artifactType"] == "link_preview"] == []


@pytest.mark.asyncio
async def test_detect_artifacts_keeps_actual_deployment_localhost_links():
    artifacts = await detect_artifacts("Open http://localhost:8000/index.html")

    links = [a for a in artifacts if a["artifactType"] == "link_preview"]
    assert len(links) == 1
    assert links[0]["content"]["url"] == "http://localhost:8000/index.html"


@pytest.mark.asyncio
async def test_detect_file_xml_with_legacy_duplicate_type_attr_as_document():
    artifacts = await detect_artifacts(
        '<artifact type="file" url="/api/v1/files/11111111-1111-1111-1111-111111111111/download" '
        'name="sample.pdf" size="1234" type="application/pdf" />'
    )

    doc = next(a for a in artifacts if a["artifactType"] == "document")
    assert doc["content"]["fileName"] == "sample.pdf"
    assert doc["content"]["fileType"] == "pdf"
    assert doc["content"]["fileUrl"] == "/api/v1/files/11111111-1111-1111-1111-111111111111/download"
    assert doc["id"].startswith("download-")


@pytest.mark.asyncio
async def test_detect_local_download_link_as_pdf_document_artifact():
    artifacts = await detect_artifacts(
        "下载链接：/api/v1/files/22222222-2222-2222-2222-222222222222/download"
    )

    doc = next(a for a in artifacts if a["artifactType"] == "document")
    assert doc["content"]["fileType"] == "pdf"
    assert doc["content"]["fileUrl"] == "/api/v1/files/22222222-2222-2222-2222-222222222222/download"
    assert doc["id"].startswith("download-")


def test_extract_download_artifacts_from_tool_response_json_string():
    artifacts = extract_download_artifacts_from_tool_response({
        "result": (
            'Successfully created file example.pdf\n'
            '{"download_url": "/api/v1/files/33333333-3333-3333-3333-333333333333/download", '
            '"file_name": "example.pdf", "file_size": 2048, "mime_type": "application/pdf"}'
        )
    })

    assert len(artifacts) == 1
    assert artifacts[0]["artifactType"] == "document"
    assert artifacts[0]["id"].startswith("download-")
    assert artifacts[0]["content"]["fileName"] == "example.pdf"
    assert artifacts[0]["content"]["fileType"] == "pdf"
