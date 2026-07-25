import base64
import hashlib
import os

from cryptography.fernet import Fernet, MultiFernet


def _fernet_from_secret(secret: str) -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
    return Fernet(key)


def _primary_secret() -> str:
    return os.environ.get("STORAGE_ENCRYPTION_KEY") or os.environ.get("JWT_SECRET", "dev-insecure-secret")


def _fernets():
    """Primary key first (used for encryption); JWT-derived key kept as a
    decryption fallback so credentials encrypted before STORAGE_ENCRYPTION_KEY
    was introduced keep working."""
    primary = _primary_secret()
    secrets = [primary]
    jwt_secret = os.environ.get("JWT_SECRET", "dev-insecure-secret")
    if jwt_secret and jwt_secret != primary:
        secrets.append(jwt_secret)
    return [_fernet_from_secret(s) for s in secrets]


def encrypt(value: str) -> str:
    if value is None:
        return ""
    return _fernets()[0].encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt(token: str) -> str:
    if not token:
        return ""
    return MultiFernet(_fernets()).decrypt(token.encode("utf-8")).decode("utf-8")
