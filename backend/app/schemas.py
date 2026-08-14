from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Any
from datetime import datetime


# ─── Auth ───
class UserRegister(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=6, max_length=128)
    email: Optional[EmailStr] = None


class UserCreateByAdmin(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=6, max_length=128)
    email: Optional[EmailStr] = None
    role: Optional[str] = "user"


class UserLogin(BaseModel):
    username: str
    password: str
    remember: bool = False


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class UserOut(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    role: str
    is_active: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─── Chat ───
class ChatRequest(BaseModel):
    session_id: Optional[int] = None
    message: str = Field(min_length=1, max_length=32000)
    model: Optional[str] = None
    web_search: bool = False
    lang: Optional[str] = "zh"


class MessageOut(BaseModel):
    id: int
    session_id: int
    role: str
    content: str
    model_name: Optional[str] = None
    tokens: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SessionOut(BaseModel):
    id: int
    title: str
    model_name: Optional[str] = None
    template_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SessionDetailOut(SessionOut):
    messages: list[MessageOut] = []


# ─── Pagination ───
class PaginatedResponse(BaseModel):
    items: list[Any]
    total: int
    page: int
    page_size: int


# ─── Admin / Audit ───
class AuditLogOut(BaseModel):
    id: int
    user_id: int
    session_id: Optional[int] = None
    action: str
    model_name: Optional[str] = None
    role: Optional[str] = None
    content_preview: Optional[str] = None
    tokens: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserQuotaOut(BaseModel):
    user_id: int
    daily_limit: int
    token_limit: int
    allowed_models: list[str]
    features: dict

    class Config:
        from_attributes = True


class UserQuotaUpdate(BaseModel):
    daily_limit: Optional[int] = None
    token_limit: Optional[int] = None
    allowed_models: Optional[list[str]] = None
    features: Optional[dict] = None


class UserPasswordChange(BaseModel):
    new_password: str = Field(min_length=6, max_length=128)


class DailyStats(BaseModel):
    total_users: int
    total_sessions: int
    total_messages: int
    total_tokens: int
    by_model: dict[str, int]


# ─── Model Provider (ApiConfig) ───
class ProviderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    base_url: str = Field(min_length=1, max_length=512)
    api_key: str = Field(min_length=1)
    models: list[str] = Field(default_factory=list)


class ProviderUpdate(BaseModel):
    name: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    models: Optional[list[str]] = None
    is_active: Optional[bool] = None


class ProviderOut(BaseModel):
    id: int
    name: str
    api_type: str
    base_url: str
    models: list[str]
    is_active: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─── Chat Template ───
class TemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    provider_id: int
    model_name: str = Field(min_length=1, max_length=128)
    system_prompt: str = ""


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    provider_id: Optional[int] = None
    model_name: Optional[str] = None
    system_prompt: Optional[str] = None


class TemplateOut(BaseModel):
    id: int
    name: str
    provider_id: int
    model_name: str
    system_prompt: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─── Board Materials ───
class BoardMaterialItem(BaseModel):
    id: str
    name: str
    length: int
    width: int
    thickness: int
    color: str = "白色"
    price: int = 100

    class Config:
        from_attributes = True


class BoardMaterialBulk(BaseModel):
    materials: list[BoardMaterialItem]


# ─── Rod/Tube Materials ───
class RodTubeItem(BaseModel):
    id: str
    type: str  # 'round-bar' | 'round-tube'
    name: str
    diameter: int
    wallThickness: Optional[int] = None
    length: int
    price: int = 8

    class Config:
        from_attributes = True


class RodTubeBulk(BaseModel):
    materials: list[RodTubeItem]
