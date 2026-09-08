import asyncio
import getpass
import sys

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionFactory
from app.models import AdminUser


async def create_admin(username: str) -> None:
    password = getpass.getpass("Password: ")
    confirmation = getpass.getpass("Repeat password: ")
    if password != confirmation:
        raise SystemExit("Passwords do not match.")
    if len(password) < 12:
        raise SystemExit("Use at least 12 characters.")

    async with SessionFactory() as db:
        exists = await db.scalar(select(AdminUser).where(AdminUser.username == username))
        if exists:
            raise SystemExit("Username already exists.")
        db.add(AdminUser(username=username, password_hash=hash_password(password), role="superadmin"))
        await db.commit()
    print(f"Administrator '{username}' created.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python -m app.create_admin USERNAME")
    asyncio.run(create_admin(sys.argv[1]))

