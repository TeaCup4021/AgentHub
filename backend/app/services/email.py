from app.core.config import settings


async def send_verification_email(email: str, code: str) -> None:
    """Send verification code email. Calls the configured email API."""
    if not settings.EMAIL_API_KEY:
        import logging
        logging.getLogger("agenthub.auth").warning(
            "EMAIL_API_KEY not configured, verification code: %s → %s", email, code
        )
        return

    import httpx
    html = (
        f"<p>您好，</p>"
        f"<p>您的 AgentHub 邮箱验证码是："
        f"<strong style=\"font-size:24px\">{code}</strong></p>"
        f"<p>有效期 10 分钟，请勿转发他人。</p>"
    )
    async with httpx.AsyncClient() as client:
        await client.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {settings.EMAIL_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "from": settings.EMAIL_FROM,
                "to": email,
                "subject": "AgentHub 邮箱验证码",
                "html": html,
            },
        )
