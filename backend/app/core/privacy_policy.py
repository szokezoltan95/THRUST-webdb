from fastapi import HTTPException
from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.consents import consent_texts, gdpr_consent_text, research_consent_text
from app.models.security import SecurityPolicy
from app.schemas.security import PolicyContent

RETENTION_LABELS = {
    "account": ("Účet a identita", "Account and identity"),
    "profile": ("Profil účastníka", "Participant profile"),
    "measurements": ("Merania a raw súbory", "Measurements and raw files"),
    "consents": ("Súhlasy a žiadosti", "Consents and requests"),
    "backups": ("Záložné kópie", "Backup copies"),
}


def default_policy() -> dict:
    # Keep the existing bootstrap documents until an administrator publishes a policy.
    gdpr = {}
    for lang, marker in [("sk", ". Údaje spracúvané"), ("en", ". Data processed")]:
        text = gdpr_consent_text(lang)
        body = text.split(marker, 1)[1]
        body = marker[2:] + body
        retention = settings.data_retention_notice_en if lang == "en" else settings.data_retention_notice
        retention = retention or ("[ADD retention period from research protocol]" if lang == "en" else "[DOPLNIŤ dobu uchovávania podľa výskumného protokolu]")
        sentence = f"Retention period: {retention}. " if lang == "en" else f"Doba uchovávania: {retention}. "
        gdpr[lang] = body.replace(sentence, "")
    try:
        email = TypeAdapter(EmailStr).validate_python(settings.data_controller_email) if settings.data_controller_email else None
    except ValidationError:
        email = None
    return PolicyContent(
        controller_name=settings.data_controller_name,
        controller_address=settings.data_controller_address,
        controller_email=email,
        research={lang: research_consent_text(lang) for lang in ("sk", "en")},
        gdpr=gdpr,
        purposes={"sk": "", "en": ""}, recipients={"sk": "", "en": ""},
        retention={key: {"sk": settings.data_retention_notice if key == "measurements" else "",
                         "en": settings.data_retention_notice_en if key == "measurements" else ""}
                   for key in RETENTION_LABELS},
    ).model_dump(mode="json")


async def current_policy(db: AsyncSession) -> tuple[int, dict]:
    row = await db.scalar(select(SecurityPolicy).order_by(SecurityPolicy.revision.desc()).limit(1))
    return (row.revision, row.payload) if row else (0, default_policy())


def render_documents(revision: int, content: dict, lang: str) -> dict:
    if revision == 0:
        return consent_texts(lang)
    en = lang == "en"
    controller = (f"Controller: {content['controller_name']}; address: {content['controller_address']}; contact: {content['controller_email'] or '—'}."
                  if en else f"Prevádzkovateľ: {content['controller_name']}; adresa: {content['controller_address']}; kontakt: {content['controller_email'] or '—'}.")
    parts = [controller]
    if content.get("dpo_contact"):
        parts.append(("Data protection contact: " if en else "Kontakt pre ochranu údajov: ") + content["dpo_contact"])
    parts.append(content["gdpr"][lang])
    for key in ("purposes", "recipients"):
        if content[key][lang]:
            label = {"purposes": ("Účely a právne základy", "Purposes and legal bases"), "recipients": ("Príjemcovia", "Recipients")}[key][int(en)]
            parts.append(label + ": " + content[key][lang])
    parts.append(("Retention periods:" if en else "Lehoty uchovávania:") + "\n" + "\n".join(
        RETENTION_LABELS[key][int(en)] + ": " + (value[lang] or ("Not configured" if en else "Nenastavené"))
        for key, value in content["retention"].items()))
    configured = bool(content["controller_name"] and content["controller_address"] and content["controller_email"] and all(v[lang] for v in content["retention"].values()))
    return {"research": {"version": f"research-r{revision}", "text": content["research"][lang]},
            "gdpr": {"version": f"gdpr-r{revision}", "text": "\n\n".join(parts), "configured": configured}}


async def current_documents(db: AsyncSession, lang: str) -> dict:
    revision, content = await current_policy(db)
    return render_documents(revision, content, lang)


def validate_presented_versions(documents: dict, research_version: str | None, gdpr_version: str) -> None:
    if gdpr_version != documents["gdpr"]["version"] or (research_version is not None and research_version != documents["research"]["version"]):
        raise HTTPException(status_code=409, detail="Text súhlasu sa zmenil. Obnov stránku a prečítaj si aktuálne znenie.")
