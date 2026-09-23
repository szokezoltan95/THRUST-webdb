from app.core.config import settings

RESEARCH_CONSENT_VERSION = "research-v2"
GDPR_CONSENT_VERSION = "gdpr-v1"

RESEARCH_CONSENT_TEXT = (
    "Súhlasím s použitím mojich pseudonymizovaných údajov z meraní na vedecký výskum "
    "výkonu pilotov UAV, štatistické vyhodnocovanie a publikovanie súhrnných výsledkov. "
    "Moje meno a e-mail sa nezverejňujú. Súhlas môžem odvolať; odvolanie neovplyvní "
    "zákonnosť spracúvania pred jeho odvolaním."
)


def gdpr_consent_text() -> str:
    controller = settings.data_controller_name or "[DOPLNIŤ názov prevádzkovateľa]"
    address = settings.data_controller_address or "[DOPLNIŤ poštovú adresu prevádzkovateľa]"
    contact = settings.data_controller_email or "[DOPLNIŤ kontaktný e-mail prevádzkovateľa]"
    retention = settings.data_retention_notice or "[DOPLNIŤ dobu uchovávania podľa výskumného protokolu]"
    return (
        f"Prevádzkovateľ: {controller}; adresa: {address}; kontakt: {contact}. "
        "Údaje spracúvané v účte: meno, priezvisko, e-mail, pseudonymné Participant ID "
        "a údaje potrebné na prihlásenie (heslo sa uchováva iba v zabezpečenej hashovanej podobe). "
        "Účelom je vytvorenie a správa účtu, autentifikácia a spojenie účtu s Participant ID. "
        "Výskumné použitie meraní upravuje samostatný výskumný súhlas. K údajom účtu majú "
        "prístup oprávnení správcovia systému. Údaje účtu sa uchovávajú počas používania účtu; "
        "po jeho anonymizácii môžu pseudonymizované merania zostať zachované podľa pravidiel "
        f"výskumu. Doba uchovávania: {retention}. Súhlas môžete odvolať v študentskom profile. "
        "Máte právo požiadať o prístup, opravu, vymazanie alebo obmedzenie spracúvania a podať "
        "sťažnosť dozornému orgánu; uplatnenie práv môže závisieť od platných právnych povinností "
        "a zachovania výskumných záznamov."
    )


def consent_texts() -> dict[str, object]:
    return {
        "research": {"version": RESEARCH_CONSENT_VERSION, "text": RESEARCH_CONSENT_TEXT},
        "gdpr": {
            "version": GDPR_CONSENT_VERSION,
            "text": gdpr_consent_text(),
            "configured": bool(
                settings.data_controller_name
                and settings.data_controller_address
                and settings.data_controller_email
                and settings.data_retention_notice
            ),
        },
    }
