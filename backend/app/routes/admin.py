from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, cast, Date
from datetime import date
from app.database import get_db
from app.models import User, AuditLog, Message, Session, UserQuota, UserRole, ApiConfig, ChatTemplate
from app.schemas import AuditLogOut, PaginatedResponse, DailyStats, UserQuotaOut, UserQuotaUpdate, UserOut, UserCreateByAdmin, UserPasswordChange, ProviderCreate, ProviderUpdate, ProviderOut, TemplateCreate, TemplateUpdate, TemplateOut
from app.auth import get_current_user, require_admin, require_super_admin, hash_password
from app.crypto import encrypt_api_key

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ─── 用户管理 ───
@router.get("/users", response_model=list[UserOut])
async def list_users(
    admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    q = select(User)
    if admin.role.value == "admin":
        q = q.where(User.group_id == admin.group_id)
    result = await db.execute(q.order_by(User.created_at.desc()))
    return [UserOut.model_validate(u) for u in result.scalars().all()]


@router.patch("/users/{user_id}/toggle-active")
async def toggle_user_active(
    user_id: int, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    if admin.id == user_id:
        raise HTTPException(status_code=403, detail="不能对自己执行此操作")
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="用户不存在")
    if target.role.value == "super_admin" and admin.role.value != "super_admin":
        raise HTTPException(status_code=403, detail="无权操作超级管理员")
    target.is_active = not target.is_active
    await db.commit()
    return {"ok": True, "is_active": target.is_active}


@router.post("/users", response_model=UserOut)
async def create_user(
    data: UserCreateByAdmin,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(User).where(User.username == data.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="用户名已存在")

    if data.role not in ("user", "admin"):
        raise HTTPException(status_code=400, detail="角色只能是 user 或 admin")
    if data.role == "admin" and admin.role.value != "super_admin":
        raise HTTPException(status_code=403, detail="只有超管才能创建管理员")

    new_user = User(
        username=data.username,
        password_hash=hash_password(data.password),
        email=data.email,
        role=UserRole(data.role),
        group_id=admin.group_id,
        is_active=True,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return UserOut.model_validate(new_user)


@router.put("/users/{user_id}/password")
async def change_user_password(
    user_id: int,
    data: UserPasswordChange,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if admin.id == user_id:
        raise HTTPException(status_code=403, detail="请通过个人设置修改自己的密码")
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="用户不存在")
    if target.role.value == "super_admin" and admin.role.value != "super_admin":
        raise HTTPException(status_code=403, detail="无权操作超级管理员")
    target.password_hash = hash_password(data.new_password)
    await db.commit()
    return {"ok": True, "message": f"用户 {target.username} 密码已修改"}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if admin.id == user_id:
        raise HTTPException(status_code=403, detail="不能删除自己的账号")
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="用户不存在")
    if target.role.value == "super_admin":
        raise HTTPException(status_code=403, detail="不能删除超级管理员账号")
    if target.role.value == "admin" and admin.role.value != "super_admin":
        raise HTTPException(status_code=403, detail="只有超管才能删除管理员")

    username = target.username
    # 手动清理外键关联（无 cascade 的表 + SQLite 不强制 FK）
    from sqlalchemy import delete as sa_delete
    from app.models import Message, BoardMaterial, RodTube
    try:
        # 1. 删除该用户所有会话的消息
        session_ids_subq = select(Session.id).where(Session.user_id == user_id).subquery()
        await db.execute(sa_delete(Message).where(Message.session_id.in_(session_ids_subq)))
        # 2. 删除该用户所有会话
        await db.execute(sa_delete(Session).where(Session.user_id == user_id))
        # 3. 删除审计日志、配额、板材、圆棒
        await db.execute(sa_delete(AuditLog).where(AuditLog.user_id == user_id))
        await db.execute(sa_delete(UserQuota).where(UserQuota.user_id == user_id))
        await db.execute(sa_delete(BoardMaterial).where(BoardMaterial.user_id == user_id))
        await db.execute(sa_delete(RodTube).where(RodTube.user_id == user_id))
        # 4. 删除用户
        await db.delete(target)
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return {"ok": True, "message": f"用户 {username} 已删除"}


# ─── 使用记录 / 审计 ───
@router.get("/audit")
async def get_audit_logs(
    user_id: int = Query(None),
    model: str = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    q = select(AuditLog)

    # 管理员只能看自己组内用户
    if admin.role.value == "admin":
        group_user_ids = select(User.id).where(User.group_id == admin.group_id).scalar_subquery()
        q = q.where(AuditLog.user_id.in_(group_user_ids))

    if user_id:
        q = q.where(AuditLog.user_id == user_id)
    if model:
        q = q.where(AuditLog.model_name == model)

    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar()

    offset = (page - 1) * page_size
    result = await db.execute(
        q.order_by(desc(AuditLog.created_at)).offset(offset).limit(page_size)
    )
    items = [AuditLogOut.model_validate(r) for r in result.scalars().all()]
    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/audit/sessions/{user_id}")
async def get_user_sessions(
    user_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Message).where(
            Message.session.has(Session.user_id == user_id)
        ).order_by(Message.created_at)
    )
    messages = result.scalars().all()
    return [
        {
            "id": m.id, "session_id": m.session_id,
            "role": m.role, "content": m.content,
            "model_name": m.model_name, "tokens": m.tokens,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in messages
    ]


@router.get("/stats/daily", response_model=DailyStats)
async def get_daily_stats(
    admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    today = date.today()

    q = select(AuditLog).where(cast(AuditLog.created_at, Date) == today)
    if admin.role.value == "admin":
        group_user_ids = select(User.id).where(User.group_id == admin.group_id).scalar_subquery()
        q = q.where(AuditLog.user_id.in_(group_user_ids))
    result = await db.execute(q)
    logs = result.scalars().all()

    user_ids = set()
    session_ids = set()
    total_tokens = 0
    by_model = {}
    for l in logs:
        user_ids.add(l.user_id)
        if l.session_id:
            session_ids.add(l.session_id)
        total_tokens += l.tokens
        if l.model_name:
            by_model[l.model_name] = by_model.get(l.model_name, 0) + 1

    return DailyStats(
        total_users=len(user_ids),
        total_sessions=len(session_ids),
        total_messages=len(logs),
        total_tokens=total_tokens,
        by_model=by_model,
    )




# ─── 用量仪表盘 ───
@router.get("/usage/overview")
async def get_usage_overview(
    days: int = 30,
    admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    from datetime import timedelta
    today = date.today()
    start_date = today - timedelta(days=days - 1)

    # 总览查询
    q = select(AuditLog).where(
        cast(AuditLog.created_at, Date) >= start_date,
        AuditLog.role == "assistant"
    )
    if admin.role.value == "admin":
        group_user_ids = select(User.id).where(User.group_id == admin.group_id).scalar_subquery()
        q = q.where(AuditLog.user_id.in_(group_user_ids))
    result = await db.execute(q)
    logs = result.scalars().all()

    total_messages = len(logs)
    total_tokens = sum(l.tokens or 0 for l in logs)

    # 按模型统计
    by_model = {}
    for l in logs:
        mn = l.model_name or "未知"
        if mn not in by_model:
            by_model[mn] = {"messages": 0, "tokens": 0, "users": set()}
        by_model[mn]["messages"] += 1
        by_model[mn]["tokens"] += l.tokens or 0
        by_model[mn]["users"].add(l.user_id)
    models = [{"model": k, "messages": v["messages"], "tokens": v["tokens"], "users": len(v["users"])} for k, v in by_model.items()]

    # 按天统计
    daily = {}
    for l in logs:
        d = l.created_at.strftime("%m-%d") if l.created_at else "未知"
        if d not in daily:
            daily[d] = {"messages": 0, "tokens": 0, "users": set()}
        daily[d]["messages"] += 1
        daily[d]["tokens"] += l.tokens or 0
        daily[d]["users"].add(l.user_id)
    daily_data = [{"date": k, "messages": v["messages"], "tokens": v["tokens"], "users": len(v["users"])} for k, v in sorted(daily.items())]

    # 费用估算（基于常见模型定价 $/1M tokens）
    model_pricing = {
        "Qwen/Qwen2.5-7B-Instruct": 0.4, "deepseek-chat": 0.28, "gpt-4o-mini": 0.15,
        "gpt-4o": 2.5, "claude-3-haiku": 0.25, "claude-3-sonnet": 3.0,
    }
    total_cost = 0.0
    for m in models:
        price = model_pricing.get(m["model"], 0.5)
        m["cost"] = round(m["tokens"] / 1_000_000 * price, 4)
        total_cost += m["cost"]

    return {
        "total_messages": total_messages,
        "total_tokens": total_tokens,
        "total_cost": round(total_cost, 4),
        "active_days": len(daily_data),
        "models": sorted(models, key=lambda x: x["tokens"], reverse=True),
        "daily": daily_data,
        "period_days": days,
    }

# ─── 配额管理 ───
@router.get("/quotas/{user_id}", response_model=UserQuotaOut)
async def get_user_quota(
    user_id: int, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(UserQuota).where(UserQuota.user_id == user_id))
    quota = result.scalar_one_or_none()
    if not quota:
        quota = UserQuota(user_id=user_id)
        db.add(quota)
        await db.commit()
        await db.refresh(quota)
    return UserQuotaOut.model_validate(quota)


@router.put("/quotas/{user_id}", response_model=UserQuotaOut)
async def update_user_quota(
    user_id: int, data: UserQuotaUpdate,
    admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(UserQuota).where(UserQuota.user_id == user_id))
    quota = result.scalar_one_or_none()
    if not quota:
        quota = UserQuota(user_id=user_id)
        db.add(quota)
    if data.daily_limit is not None:
        quota.daily_limit = data.daily_limit
    if data.token_limit is not None:
        quota.token_limit = data.token_limit
    if data.allowed_models is not None:
        quota.allowed_models = data.allowed_models
    if data.features is not None:
        quota.features = data.features
    await db.commit()
    await db.refresh(quota)
    return UserQuotaOut.model_validate(quota)

# ======================== 模型库 (API Config) ========================

@router.get("/providers", response_model=list[ProviderOut])
async def list_providers(
    admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(ApiConfig).order_by(ApiConfig.created_at.desc()))
    return [ProviderOut.model_validate(p) for p in result.scalars().all()]


@router.post("/providers", response_model=ProviderOut)
async def create_provider(
    data: ProviderCreate,
    admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    provider = ApiConfig(
        name=data.name,
        api_type="openai",
        base_url=data.base_url,
        api_key_encrypted=encrypt_api_key(data.api_key),
        models=data.models,
        is_active=True,
    )
    db.add(provider)
    await db.commit()
    await db.refresh(provider)
    return ProviderOut.model_validate(provider)


@router.put("/providers/{provider_id}", response_model=ProviderOut)
async def update_provider(
    provider_id: int, data: ProviderUpdate,
    admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    provider = await db.get(ApiConfig, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="供应商不存在")
    if data.name is not None:
        provider.name = data.name
    if data.base_url is not None:
        provider.base_url = data.base_url
    if data.api_key is not None:
        provider.api_key_encrypted = encrypt_api_key(data.api_key)
    if data.models is not None:
        provider.models = data.models
    if data.is_active is not None:
        provider.is_active = data.is_active
    await db.commit()
    await db.refresh(provider)
    return ProviderOut.model_validate(provider)


@router.delete("/providers/{provider_id}")
async def delete_provider(
    provider_id: int,
    admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    provider = await db.get(ApiConfig, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="供应商不存在")
    # 检查是否有模板引用此供应商
    refs = await db.execute(select(func.count(ChatTemplate.id)).where(ChatTemplate.provider_id == provider_id))
    if refs.scalar() > 0:
        raise HTTPException(status_code=400, detail="该供应商下有对话模板，请先删除相关模板")
    await db.delete(provider)
    await db.commit()
    return {"ok": True}


# ======================== 对话模板 ========================

@router.get("/templates", response_model=list[TemplateOut])
async def list_templates_admin(
    admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(ChatTemplate).order_by(ChatTemplate.created_at.desc()))
    return [TemplateOut.model_validate(t) for t in result.scalars().all()]


@router.post("/templates", response_model=TemplateOut)
async def create_template(
    data: TemplateCreate,
    admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    provider = await db.get(ApiConfig, data.provider_id)
    if not provider or not provider.is_active:
        raise HTTPException(status_code=400, detail="供应商不存在或已禁用")
    template = ChatTemplate(
        name=data.name,
        provider_id=data.provider_id,
        model_name=data.model_name,
        system_prompt=data.system_prompt,
        created_by=admin.id,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return TemplateOut.model_validate(template)


@router.put("/templates/{template_id}", response_model=TemplateOut)
async def update_template(
    template_id: int, data: TemplateUpdate,
    admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    template = await db.get(ChatTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")
    if data.name is not None:
        template.name = data.name
    if data.provider_id is not None:
        provider = await db.get(ApiConfig, data.provider_id)
        if not provider or not provider.is_active:
            raise HTTPException(status_code=400, detail="供应商不存在或已禁用")
        template.provider_id = data.provider_id
    if data.model_name is not None:
        template.model_name = data.model_name
    if data.system_prompt is not None:
        template.system_prompt = data.system_prompt
    await db.commit()
    await db.refresh(template)
    return TemplateOut.model_validate(template)


@router.delete("/templates/{template_id}")
async def delete_template(
    template_id: int,
    admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    template = await db.get(ChatTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")
    # 解除已绑定此模板的会话关联
    sessions = await db.execute(select(Session).where(Session.template_id == template_id))
    for s in sessions.scalars().all():
        s.template_id = None
    await db.delete(template)
    await db.commit()
    return {"ok": True}
