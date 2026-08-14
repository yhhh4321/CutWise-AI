from fastapi import APIRouter, Depends
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models import BoardMaterial, RodTube
from app.schemas import BoardMaterialItem, BoardMaterialBulk, RodTubeItem, RodTubeBulk
from app.auth import get_current_user
from app.models import User

router = APIRouter(prefix="/api/materials", tags=["materials"])

DEFAULT_BOARDS = [
    {"id": "standard-122-244", "name": "标准板", "length": 122, "width": 244, "thickness": 18, "color": "白色", "price": 100},
    {"id": "large-122-305", "name": "加长板", "length": 122, "width": 305, "thickness": 18, "color": "金色", "price": 125},
    {"id": "square-122-122", "name": "方形板", "length": 122, "width": 122, "thickness": 15, "color": "蓝色", "price": 55},
]

DEFAULT_RODTUBES = [
    {"id": "round-bar-10-200", "type": "round-bar", "name": "标准圆棒", "diameter": 10, "wallThickness": None, "length": 200, "price": 8},
    {"id": "round-tube-20-2-200", "type": "round-tube", "name": "标准圆管", "diameter": 20, "wallThickness": 2, "length": 200, "price": 15},
]


@router.get("/boards", response_model=list[BoardMaterialItem])
async def get_boards(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(BoardMaterial).where(BoardMaterial.user_id == user.id)
    )
    rows = result.scalars().all()
    if not rows:
        # return defaults without persisting
        return [BoardMaterialItem(**b) for b in DEFAULT_BOARDS]
    return [BoardMaterialItem(id=r.material_id, name=r.name, length=r.length,
                               width=r.width, thickness=r.thickness,
                               color=r.color, price=r.price) for r in rows]


@router.put("/boards")
async def save_boards(body: BoardMaterialBulk, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(delete(BoardMaterial).where(BoardMaterial.user_id == user.id))
    for m in body.materials:
        row = BoardMaterial(
            user_id=user.id,
            material_id=m.id,
            name=m.name,
            length=m.length,
            width=m.width,
            thickness=m.thickness,
            color=m.color,
            price=m.price,
        )
        db.add(row)
    await db.commit()
    return {"ok": True}


@router.get("/rods", response_model=list[RodTubeItem])
async def get_rods(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(RodTube).where(RodTube.user_id == user.id)
    )
    rows = result.scalars().all()
    if not rows:
        return [RodTubeItem(**r) for r in DEFAULT_RODTUBES]
    return [RodTubeItem(id=r.material_id, type=r.type, name=r.name,
                         diameter=r.diameter, wallThickness=r.wall_thickness,
                         length=r.length, price=r.price) for r in rows]


@router.put("/rods")
async def save_rods(body: RodTubeBulk, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(delete(RodTube).where(RodTube.user_id == user.id))
    for m in body.materials:
        row = RodTube(
            user_id=user.id,
            material_id=m.id,
            type=m.type,
            name=m.name,
            diameter=m.diameter,
            wall_thickness=m.wallThickness,
            length=m.length,
            price=m.price,
        )
        db.add(row)
    await db.commit()
    return {"ok": True}
