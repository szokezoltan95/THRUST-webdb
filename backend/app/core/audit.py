from app.api.dependencies import effective_role
from app.models.security import SecurityEvent


def record_event(db, auth, category: str, action: str, target_id: str | None = None, **details) -> None:
    # Only operational metadata. Never pass request bodies, e-mail addresses,
    # notes, passwords, session/CSRF tokens or raw measurement payloads here.
    db.add(SecurityEvent(category=category, action=action, actor_id=auth.user.id,
                         actor_role=effective_role(auth.user), target_id=target_id, details=details))
