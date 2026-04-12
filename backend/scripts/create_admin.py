"""Create default admin user if none exists."""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from app.database import async_session
from app.models.user import User, UserRole
from app.auth import hash_password


async def main():
    async with async_session() as db:
        result = await db.execute(select(User).where(User.role == UserRole.admin))
        if result.scalar_one_or_none():
            print("Admin user already exists, skipping.")
            return

        admin = User(
            email=os.getenv("ADMIN_EMAIL", "admin@mlabled.local"),
            password_hash=hash_password(os.getenv("ADMIN_PASSWORD", "admin")),
            full_name="Admin",
            role=UserRole.admin,
        )
        db.add(admin)
        await db.commit()
        print(f"Created admin user: {admin.email}")


if __name__ == "__main__":
    asyncio.run(main())
