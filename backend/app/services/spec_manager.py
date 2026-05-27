import logging
import os
from pathlib import Path
from typing import Optional

logger = logging.getLogger("agenthub.spec_manager")


class SpecManager:
    """Minimal file-based Spec/Rules loader.

    Reads all .md files from a configured specs directory and concatenates
    them into a single injection text. A future DB-backed version (Day 14-15)
    will replace this with per-conversation spec resolution.
    """

    def __init__(self, specs_dir: Optional[str] = None) -> None:
        if specs_dir is None:
            specs_dir = os.path.join(
                os.path.dirname(__file__), "..", "..", "specs"
            )
        self.specs_dir = Path(specs_dir).resolve()
        logger.info("SpecManager initialized with specs_dir=%s", self.specs_dir)

    def get_rules_for_conversation(self, conv_id: str) -> Optional[str]:
        if not self.specs_dir.exists():
            logger.info("SpecManager: specs_dir not found, skipping")
            return None

        md_files = sorted(self.specs_dir.glob("*.md"))
        if not md_files:
            logger.info("SpecManager: no .md files in specs_dir")
            return None

        contents: list[str] = []
        for f in md_files:
            try:
                text = f.read_text(encoding="utf-8").strip()
                if text:
                    contents.append(text)
            except Exception:
                logger.warning("SpecManager: failed to read %s", f, exc_info=True)

        if not contents:
            return None

        logger.info(
            "SpecManager: loaded %d spec file(s) for conversation_id=%s",
            len(contents),
            conv_id,
        )
        return "\n\n".join(contents)


_spec_manager: Optional[SpecManager] = None


def get_spec_manager() -> SpecManager:
    global _spec_manager
    if _spec_manager is None:
        _spec_manager = SpecManager()
    return _spec_manager
