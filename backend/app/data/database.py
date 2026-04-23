from sqlalchemy.orm import sessionmaker
from ..config import settings
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

engine = create_async_engine(settings.DB_URL, echo=False, pool_pre_ping=True)

AsyncSessionLocal = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

async def init_db():
    from .models import Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
