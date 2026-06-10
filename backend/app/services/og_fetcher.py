from __future__ import annotations

import ipaddress
import logging
import socket
import re
from typing import Dict
from urllib.parse import urlparse

import httpx

logger = logging.getLogger("agenthub.og_fetcher")

_BLOCKED_HOSTS = {
    "localhost", "127.0.0.1", "0.0.0.0", "::1",
    "169.254.169.254", "metadata.google.internal",
}

_BLOCKED_CIDRS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
]

_OG_TITLE_RE = re.compile(r'<meta\s[^>]*property\s*=\s*["\']og:title["\'][^>]*content\s*=\s*["\']([^"\']*)["\']', re.IGNORECASE)
_OG_DESC_RE = re.compile(r'<meta\s[^>]*property\s*=\s*["\']og:description["\'][^>]*content\s*=\s*["\']([^"\']*)["\']', re.IGNORECASE)
_OG_IMAGE_RE = re.compile(r'<meta\s[^>]*property\s*=\s*["\']og:image["\'][^>]*content\s*=\s*["\']([^"\']*)["\']', re.IGNORECASE)
_OG_SITE_RE = re.compile(r'<meta\s[^>]*property\s*=\s*["\']og:site_name["\'][^>]*content\s*=\s*["\']([^"\']*)["\']', re.IGNORECASE)
_META_DESC_RE = re.compile(r'<meta\s[^>]*name\s*=\s*["\']description["\'][^>]*content\s*=\s*["\']([^"\']*)["\']', re.IGNORECASE)
_FAVICON_RE = re.compile(r'<link\s[^>]*rel\s*=\s*["\'][^"\']*icon[^"\']*["\'][^>]*href\s*=\s*["\']([^"\']*)["\']', re.IGNORECASE)
_CHARSET_RE = re.compile(r'<meta\s[^>]*charset\s*=\s*["\']?([^"\'<> ]+)["\']?', re.IGNORECASE)
_TITLE_TAG_RE = re.compile(r'<title[^>]*>([^<]*)</title>', re.IGNORECASE)


def _is_safe_url(url: str) -> bool:
    hostname = urlparse(url).hostname
    if not hostname:
        return False
    if hostname.lower() in _BLOCKED_HOSTS:
        return False
    try:
        ip = ipaddress.ip_address(hostname)
    except ValueError:
        ip = ipaddress.ip_address(socket.gethostbyname(hostname))
    for cidr in _BLOCKED_CIDRS:
        if ip in cidr:
            return False
    return True


def _decode_html(html_bytes: bytes) -> str:
    match = _CHARSET_RE.search(html_bytes[:1024].decode("ascii", errors="ignore"))
    encoding = match.group(1) if match else "utf-8"
    try:
        return html_bytes.decode(encoding, errors="replace")
    except LookupError:
        return html_bytes.decode("utf-8", errors="replace")


def _first_match(pattern: re.Pattern, html: str) -> str | None:
    m = pattern.search(html)
    return m.group(1).strip() if m else None


def fetch_og_metadata(url: str) -> Dict:
    if not _is_safe_url(url):
        logger.warning("OG fetch blocked unsafe url: %s", url)
        return {}

    try:
        with httpx.Client(timeout=5.0, follow_redirects=True) as client:
            resp = client.get(
                url,
                headers={"User-Agent": "AgentHubBot/1.0 (og-preview)"},
            )
            resp.raise_for_status()
            html = _decode_html(resp.content)
    except Exception:
        logger.debug("OG fetch failed for %s", url)
        return {}

    parsed = urlparse(url)
    hostname = parsed.hostname or ""

    favicon = _first_match(_FAVICON_RE, html)
    if favicon and favicon.startswith("/"):
        favicon = f"{parsed.scheme}://{hostname}{favicon}"

    return {
        "title": _first_match(_OG_TITLE_RE, html) or _first_match(_TITLE_TAG_RE, html),
        "description": _first_match(_OG_DESC_RE, html) or _first_match(_META_DESC_RE, html),
        "image": _first_match(_OG_IMAGE_RE, html),
        "favicon": favicon,
        "site_name": _first_match(_OG_SITE_RE, html) or hostname,
    }
