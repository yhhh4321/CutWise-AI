"""API Key 对称加密工具。

密钥由 SECRET_KEY 通过 SHA-256 派生为 Fernet 所需的 32 字节 urlsafe base64，
不引入额外的加密密钥配置，保证单密钥源与可持久化。
"""
import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings


def _fernet() -> Fernet:
    settings = get_settings()
    key = base64.urlsafe_b64encode(
        hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()
    )
    return Fernet(key)


def encrypt_api_key(plain: str) -> str:
    return _fernet().encrypt(plain.encode("utf-8")).decode("ascii")


def decrypt_api_key(cipher: str) -> str:
    try:
        return _fernet().decrypt(cipher.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        # 兼容历史明文存储：解密失败时按明文返回
        return cipher
