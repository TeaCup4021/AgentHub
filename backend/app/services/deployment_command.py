"""Helpers for routing explicit chat deployment commands."""

from __future__ import annotations

from typing import Optional


DeploymentTarget = str

_EXACT_TARGETS: dict[str, DeploymentTarget] = {
    "deploy": "preview",
    "preview": "preview",
    "staticdeploy": "static_site",
    "staticsite": "static_site",
    "sourcepackage": "source_package",
    "downloadsource": "source_package",
    "containerdeploy": "container",
    "container": "container",
    "\u90e8\u7f72": "preview",
    "\u8bf7\u90e8\u7f72": "preview",
    "\u5e2e\u6211\u90e8\u7f72": "preview",
    "\u7ed9\u6211\u90e8\u7f72": "preview",
    "\u90e8\u7f72\u4e00\u4e0b": "preview",
    "\u90e8\u7f72\u547d\u4ee4": "preview",
    "\u9884\u89c8": "preview",
    "\u9884\u89c8\u4e00\u4e0b": "preview",
    "\u5e2e\u6211\u9884\u89c8": "preview",
    "\u751f\u6210\u9884\u89c8": "preview",
    "\u9884\u89c8\u94fe\u63a5": "preview",
    "\u751f\u6210\u9884\u89c8\u94fe\u63a5": "preview",
    "\u53d1\u5e03": "static_site",
    "\u9759\u6001\u90e8\u7f72": "static_site",
    "\u9759\u6001\u7ad9\u70b9\u90e8\u7f72": "static_site",
    "\u6253\u5305\u6e90\u7801": "source_package",
    "\u6e90\u7801\u6253\u5305": "source_package",
    "\u4e0b\u8f7d\u6e90\u7801": "source_package",
    "\u5bb9\u5668\u90e8\u7f72": "container",
    "\u90e8\u7f72\u5bb9\u5668": "container",
}

_NEGATION_TERMS = (
    "donotdeploy",
    "dontdeploy",
    "nodeploy",
    "\u4e0d\u8981\u90e8\u7f72",
    "\u4e0d\u7528\u90e8\u7f72",
    "\u65e0\u9700\u90e8\u7f72",
    "\u4e0d\u9700\u8981\u90e8\u7f72",
    "\u4e0d\u8981\u53d1\u5e03",
    "\u4e0d\u7528\u53d1\u5e03",
    "\u4e0d\u8981\u9884\u89c8",
    "\u4e0d\u7528\u9884\u89c8",
)

_QUESTION_TERMS = (
    "\u600e\u4e48",
    "\u5982\u4f55",
    "\u600e\u6837",
    "\u6559\u7a0b",
    "\u6587\u6863",
    "\u8bf4\u660e",
    "\u65b9\u6848",
)


def _normalize(prompt: Optional[str]) -> str:
    return "".join((prompt or "").strip().lower().split())


def parse_deploy_command(prompt: Optional[str]) -> Optional[DeploymentTarget]:
    """Return the deployment target for a short, explicit deploy command."""

    normalized = _normalize(prompt)
    if not normalized:
        return None

    if any(term in normalized for term in _NEGATION_TERMS):
        return None

    if normalized in _EXACT_TARGETS:
        return _EXACT_TARGETS[normalized]

    if len(normalized) <= 32 and normalized.startswith("deploy"):
        if "container" in normalized:
            return "container"
        if "source" in normalized or "package" in normalized:
            return "source_package"
        if "static" in normalized:
            return "static_site"
        return "preview"

    if len(normalized) > 48:
        return None

    has_deploy_verb = any(
        term in normalized
        for term in (
            "\u90e8\u7f72",
            "\u53d1\u5e03",
        )
    )
    if not has_deploy_verb:
        return None

    if any(term in normalized for term in _QUESTION_TERMS):
        return None

    if "\u5bb9\u5668" in normalized:
        return "container"
    if (
        "\u6e90\u7801" in normalized
        or "\u6253\u5305" in normalized
        or "\u4e0b\u8f7d" in normalized
    ):
        return "source_package"
    if "\u9759\u6001" in normalized or "\u53d1\u5e03" in normalized:
        return "static_site"
    return "preview"


def should_handle_deployment_command(orchestrate_mode: Optional[str]) -> bool:
    """Deployment commands should bypass planning except during plan editing."""

    return orchestrate_mode not in {"refine_plan", "confirm_plan"}
