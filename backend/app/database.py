from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import get_settings

settings = get_settings()

# SQLite 不支持 pool_size/max_overflow，仅 PostgreSQL 连接池参数
engine_kwargs = {"echo": settings.DEBUG}
if "postgresql" in settings.DATABASE_URL or "asyncpg" in settings.DATABASE_URL:
    engine_kwargs.update({"pool_size": 20, "max_overflow": 10})

engine = create_async_engine(settings.DATABASE_URL, **engine_kwargs)
async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with async_session_factory() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Migration: add template_id column to sessions if not exists
        try:
            await conn.exec_driver_sql(
                "ALTER TABLE sessions ADD COLUMN template_id INTEGER REFERENCES chat_templates(id)"
            )
        except Exception:
            pass  # Column already exists
