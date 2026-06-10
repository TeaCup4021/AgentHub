"""Adapter layer — imports trigger AdapterRegistry registration at startup.

Each adapter module registers itself with AdapterRegistry at import time
(via AdapterRegistry.register() calls at module bottom).
"""

from app.services.adapters.anthropic_adapter import AnthropicAdapter  # noqa: F401
from app.services.adapters.litellm_adapter import LiteLlmAdapter  # noqa: F401
from app.services.adapters.cli_adapter import CliAdapter  # noqa: F401
