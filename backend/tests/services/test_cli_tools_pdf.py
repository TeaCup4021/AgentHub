from app.services.adk.cli_tools import _extract_pdf_source_text, _make_simple_pdf, _pdf_hex


def test_extract_pdf_source_text_from_literal_tj_operators():
    source = """%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
4 0 obj
<< /Length 99 >>
stream
BT
(AgentHub 项目介绍) Tj
(版本: 1.0.0) Tj
(一、项目概述) Tj
ET
endstream
endobj
%%EOF
"""

    text = _extract_pdf_source_text(source)

    assert "%PDF-1.4" not in text
    assert "AgentHub 项目介绍" in text
    assert "版本: 1.0.0" in text
    assert "一、项目概述" in text


def test_make_simple_pdf_does_not_embed_pdf_source_as_visible_text():
    source = """%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
stream
BT
(AgentHub 项目介绍) Tj
ET
endstream
%%EOF
"""

    pdf = _make_simple_pdf(source)

    assert pdf.count(b"%PDF-1.4") == 1
    assert _pdf_hex("%PDF-1.4").encode("ascii") not in pdf
    assert _pdf_hex("AgentHub 项目介绍").encode("ascii") in pdf
