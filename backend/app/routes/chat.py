import json
import httpx
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from sqlalchemy.orm import selectinload
from app.database import get_db, async_session_factory
from app.models import User, Session, Message, AuditLog, UserQuota, ChatTemplate, ApiConfig
from app.schemas import (
    ChatRequest, SessionOut, SessionDetailOut, MessageOut, PaginatedResponse, DailyStats
)
from app.auth import get_current_user
from app.config import get_settings
from app.crypto import decrypt_api_key

router = APIRouter(prefix="/api/chat", tags=["chat"])
settings = get_settings()


@router.get("/quota")
async def get_quota(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    """返回当前用户的用量配额状态"""
    quota_result = await db.execute(select(UserQuota).where(UserQuota.user_id == user.id))
    quota = quota_result.scalar_one_or_none()

    today_count = await db.execute(
        select(func.count(Message.id)).where(
            Message.session.has(Session.user_id == user.id),
            func.date(Message.created_at) == func.date('now')
        )
    )
    used_messages = today_count.scalar() or 0

    today_tokens = await db.execute(
        select(func.coalesce(func.sum(Message.tokens), 0)).where(
            Message.session.has(Session.user_id == user.id),
            func.date(Message.created_at) == func.date('now'),
        )
    )
    used_tokens = today_tokens.scalar() or 0

    return {
        "daily_messages_used": used_messages,
        "daily_messages_limit": quota.daily_limit if quota else 0,
        "daily_tokens_used": used_tokens,
        "daily_tokens_limit": quota.token_limit if quota else 0,
    }


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Session)
        .where(Session.user_id == user.id, Session.is_archived == False)
        .order_by(desc(Session.updated_at))
    )
    return [SessionOut.model_validate(s) for s in result.scalars().all()]


@router.get("/templates", response_model=list)
async def list_templates(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(ChatTemplate).order_by(ChatTemplate.created_at.desc()))
    templates = result.scalars().all()
    return [{"id": t.id, "name": t.name, "model_name": t.model_name,
             "provider_id": t.provider_id,
             "created_at": t.created_at.isoformat() if t.created_at else None} for t in templates]


@router.post("/sessions", response_model=SessionOut)
async def create_session(
    title: str = "新对话", model: Optional[str] = None,
    template_id: Optional[int] = None,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    session_title = title
    session_model = model or settings.DEFAULT_MODEL
    session_template_id = None

    if template_id:
        template = await db.get(ChatTemplate, template_id)
        if template:
            session_title = template.name
            session_model = template.model_name
            session_template_id = template.id

    session = Session(
        user_id=user.id, title=session_title,
        model_name=session_model, template_id=session_template_id
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return SessionOut.model_validate(session)


@router.get("/sessions/{session_id}", response_model=SessionDetailOut)
async def get_session(
    session_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Session)
        .where(Session.id == session_id, Session.user_id == user.id)
        .options(selectinload(Session.messages))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    return SessionDetailOut.model_validate(session)


@router.delete("/sessions/{session_id}/messages/{message_id}")
async def trim_messages(
    session_id: int, message_id: int,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    """删除指定消息及其之后的所有消息（用于编辑重发和重生成）"""
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == user.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")

    await db.execute(
        Message.__table__.delete().where(
            Message.session_id == session_id,
            Message.id >= message_id
        )
    )
    await db.commit()
    return {"ok": True, "trimmed_from": message_id}


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == user.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    await db.delete(session)
    await db.commit()
    return {"ok": True}


@router.patch("/sessions/{session_id}")
async def rename_session(
    session_id: int, title: str,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == user.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    session.title = title
    await db.commit()
    return {"ok": True}


@router.post("/completions")
async def chat_completions(
    data: ChatRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    # 配额检查
    quota_result = await db.execute(select(UserQuota).where(UserQuota.user_id == user.id))
    quota = quota_result.scalar_one_or_none()
    if quota and quota.daily_limit > 0:
        today_count = await db.execute(
            select(func.count(Message.id)).where(
                Message.session.has(Session.user_id == user.id),
                func.date(Message.created_at) == func.date('now')
            )
        )
        if today_count.scalar() >= quota.daily_limit:
            raise HTTPException(status_code=429, detail="今日对话次数已达上限")

    # 获取或创建会话
    if data.session_id:
        result = await db.execute(
            select(Session).where(Session.id == data.session_id, Session.user_id == user.id)
        )
        session = result.scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=404, detail="会话不存在")
    else:
        session = Session(user_id=user.id, title="新对话", model_name=data.model or settings.DEFAULT_MODEL)
        db.add(session)
        await db.commit()
        await db.refresh(session)

    model_name = data.model or settings.DEFAULT_MODEL

    # 保存用户消息
    user_msg = Message(session_id=session.id, role="user", content=data.message, model_name=model_name)
    db.add(user_msg)

    # 保存审计日志
    audit = AuditLog(
        user_id=user.id, session_id=session.id, action="chat",
        model_name=model_name, role="user",
        content_preview=data.message[:200], ip_address=None
    )
    db.add(audit)

    # 获取上下文
    ctx_result = await db.execute(
        select(Message).where(Message.session_id == session.id).order_by(Message.created_at)
    )
    history = ctx_result.scalars().all()
    messages = [{"role": m.role, "content": m.content} for m in history]

    # 注入模板 System Prompt
    if session.template_id:
        template = await db.get(ChatTemplate, session.template_id)
        if template and template.system_prompt:
            messages.insert(0, {"role": "system", "content": template.system_prompt})

    # 注入语言偏好 System Prompt（覆盖所有语言）
    lang_prompts = {
        "zh": "请始终使用中文回复。",
        "ja": "常に日本語で返信してください。",
        "en": "Please always reply in English.",
    }
    user_lang = data.lang or "zh"
    lang_prompt = lang_prompts.get(user_lang, lang_prompts["zh"])
    messages.insert(0, {"role": "system", "content": lang_prompt})

    # 模型服务异常提示（按用户语言）
    error_msgs = {
        "zh": {
            "timeout": "请求模型超时，请稍后重试或检查模型库配置。",
            "status": "模型服务返回异常状态码 {code}，请检查模型库 Base URL 与 API Key。",
            "network": "无法连接模型服务，请检查模型库 Base URL 与 API Key 是否正确。",
            "unknown": "对话服务发生异常，请稍后重试。",
        },
        "ja": {
            "timeout": "モデルへのリクエストがタイムアウトしました。しばらくして再試行するか、モデルライブラリを確認してください。",
            "status": "モデルサービスが異常ステータスコード {code} を返しました。モデルライブラリの Base URL と API Key を確認してください。",
            "network": "モデルサービスに接続できません。モデルライブラリの Base URL と API Key を確認してください。",
            "unknown": "会話サービスで例外が発生しました。しばらくして再試行してください。",
        },
        "en": {
            "timeout": "Model request timed out. Please retry later or check the model library configuration.",
            "status": "Model service returned status code {code}. Check the Base URL and API Key in the model library.",
            "network": "Unable to connect to the model service. Check the Base URL and API Key in the model library.",
            "unknown": "Chat service error. Please try again later.",
        },
    }
    err_msgs = error_msgs.get(user_lang, error_msgs["zh"])

    await db.commit()

    async def stream():
        assistant_content = ""

        # 根据模型名查找匹配的 Provider（模型库），优先使用其 base_url 和 api_key
        api_base = settings.OPENAI_BASE_URL
        api_key = settings.OPENAI_API_KEY
        async with async_session_factory() as provider_db:
            provider_result = await provider_db.execute(
                select(ApiConfig).where(ApiConfig.is_active == True)
            )
            for p in provider_result.scalars().all():
                if model_name in (p.models or []):
                    api_base = p.base_url
                    api_key = decrypt_api_key(p.api_key_encrypted)
                    break

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(connect=10.0, read=120.0, write=30.0, pool=10.0)) as client:
                async with client.stream(
                    "POST",
                    f"{api_base}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": model_name,
                        "messages": messages,
                        "stream": True,
                    },
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            chunk = line[6:]
                            if chunk == "[DONE]":
                                break
                            try:
                                delta = json.loads(chunk)
                                content = delta["choices"][0]["delta"].get("content", "")
                                if content:
                                    assistant_content += content
                                    yield f"data: {json.dumps({'content': content})}\n\n"
                            except (json.JSONDecodeError, KeyError, IndexError):
                                continue
        except httpx.TimeoutException:
            assistant_content = err_msgs["timeout"]
            yield f"data: {json.dumps({'content': assistant_content})}\n\n"
        except httpx.HTTPStatusError as e:
            assistant_content = err_msgs["status"].format(code=e.response.status_code)
            yield f"data: {json.dumps({'content': assistant_content})}\n\n"
        except httpx.HTTPError:
            assistant_content = err_msgs["network"]
            yield f"data: {json.dumps({'content': assistant_content})}\n\n"
        except Exception:
            assistant_content = err_msgs["unknown"]
            yield f"data: {json.dumps({'content': assistant_content})}\n\n"
        finally:
            # 保存 AI 回复 + 审计日志
            async with async_session_factory() as save_db:
                ai_msg = Message(
                    session_id=session.id, role="assistant",
                    content=assistant_content or "（模型未返回内容）",
                    model_name=model_name, tokens=max(len(assistant_content) // 3, 1)
                )
                save_db.add(ai_msg)

                audit_ai = AuditLog(
                    user_id=user.id, session_id=session.id, action="chat",
                    model_name=model_name, role="assistant",
                    content_preview=assistant_content[:200] if assistant_content else "",
                    tokens=max(len(assistant_content) // 3, 1)
                )
                save_db.add(audit_ai)

                # 自动更新会话标题
                session_result = await save_db.execute(select(Session).where(Session.id == session.id))
                s = session_result.scalar_one_or_none()
                if s and s.title == "新对话" and data.message:
                    s.title = data.message[:30] + ("..." if len(data.message) > 30 else "")
                await save_db.commit()

        yield "data: [DONE]\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")
