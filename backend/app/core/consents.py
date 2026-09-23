from app.core.config import settings

RESEARCH_CONSENT_VERSION = "research-v3"
GDPR_CONSENT_VERSION = "gdpr-v2"

RESEARCH_CONSENT_TEXT = (
    "Súhlasím s použitím mojich pseudonymizovaných údajov z meraní na vedecký výskum "
    "výkonu pilotov UAV, štatistické vyhodnocovanie a publikovanie súhrnných výsledkov. "
    "Voliteľné údaje o veku a pilotážnych skúsenostiach možno spolu s meraniami použiť "
    "na výskumné a štatistické vyhodnotenie; tieto otázky možno nevyplniť. Moje meno a "
    "e-mail sa nezverejňujú. Súhlas môžem odvolať; odvolanie neovplyvní zákonnosť "
    "spracúvania pred jeho odvolaním."
)


def gdpr_consent_text() -> str:
    controller = settings.data_controller_name or "[DOPLNIŤ názov prevádzkovateľa]"
    address = settings.data_controller_address or "[DOPLNIŤ poštovú adresu prevádzkovateľa]"
    contact = settings.data_controller_email or "[DOPLNIŤ kontaktný e-mail prevádzkovateľa]"
    retention = settings.data_retention_notice or "[DOPLNIŤ dobu uchovávania podľa výskumného protokolu]"
    return (
        f"Prevádzkovateľ: {controller}; adresa: {address}; kontakt: {contact}. "
        "Údaje spracúvané v účte a profile: meno, priezvisko, e-mail, dátum narodenia, "
        "pseudonymné Participant ID, pilotážna a simulátorová skúsenosť, približný počet "
        "letových hodín, osvedčenie a typ UAV; heslo sa uchováva iba v zabezpečenej hashovanej podobe. "
        "Dátum narodenia a otázky o skúsenostiach sú voliteľné. Účelom je správa účtu, "
        "autentifikácia, správa profilu a štatistické vyhodnotenie podľa samostatného výskumného súhlasu. "
        "Výskumné použitie meraní upravuje samostatný výskumný súhlas. K údajom účtu majú "
        "prístup oprávnení správcovia systému. Údaje účtu sa uchovávajú počas používania účtu; "
        "po jeho anonymizácii môžu pseudonymizované merania zostať zachované podľa pravidiel "
        f"výskumu. Doba uchovávania: {retention}. Zaškrtnutím políčka udeľujete súhlas s týmto "
        "spracúvaním; súhlas môžete kedykoľvek odvolať v študentskom profile. "
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
