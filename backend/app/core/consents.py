from app.core.config import settings
from typing import Literal

ConsentLanguage = Literal["sk", "en"]

RESEARCH_CONSENT_VERSION = "research-v4"
GDPR_CONSENT_VERSION = "gdpr-v3"

RESEARCH_CONSENT_TEXT = (
    "Súhlasím s použitím mojich pseudonymizovaných údajov z meraní na vedecký výskum "
    "výkonu pilotov UAV, štatistické vyhodnocovanie a publikovanie súhrnných výsledkov. "
    "Voliteľné údaje z profilu (vek, pohlavie, dominantná ruka, zraková korekcia a "
    "skúsenosti s UAV/RC, FPV, simulátormi a videohrami) možno spolu s meraniami použiť "
    "na výskumné a štatistické vyhodnotenie; tieto otázky možno nevyplniť. Moje meno a "
    "e-mail sa nezverejňujú. Súhlas môžem odvolať; odvolanie neovplyvní zákonnosť "
    "spracúvania pred jeho odvolaním."
)

RESEARCH_CONSENT_TEXT_EN = (
    "I consent to the use of my pseudonymized measurement data for scientific research "
    "on UAV pilot performance, statistical evaluation and publication of aggregate results. "
    "Optional profile information (age, sex, dominant hand, vision correction and experience "
    "with UAV/RC, FPV, simulators and video games) may be used together with measurements "
    "for research and statistical evaluation; these questions may be left unanswered. My name "
    "and email are not published. I may withdraw consent; withdrawal does not affect the "
    "lawfulness of processing carried out before withdrawal."
)


def research_consent_text(lang: ConsentLanguage = "sk") -> str:
    return RESEARCH_CONSENT_TEXT_EN if lang == "en" else RESEARCH_CONSENT_TEXT


def gdpr_consent_text(lang: ConsentLanguage = "sk") -> str:
    controller = settings.data_controller_name or ("[ADD controller name]" if lang == "en" else "[DOPLNIŤ názov prevádzkovateľa]")
    address = settings.data_controller_address or ("[ADD controller postal address]" if lang == "en" else "[DOPLNIŤ poštovú adresu prevádzkovateľa]")
    contact = settings.data_controller_email or ("[ADD controller contact email]" if lang == "en" else "[DOPLNIŤ kontaktný e-mail prevádzkovateľa]")
    if lang == "en":
        retention = settings.data_retention_notice_en or "[ADD retention period from research protocol]"
    else:
        retention = settings.data_retention_notice or "[DOPLNIŤ dobu uchovávania podľa výskumného protokolu]"
    if lang == "en":
        return (
            f"Controller: {controller}; address: {address}; contact: {contact}. "
            "Data processed in the account and profile: first and last name, email, date of birth, "
            "sex, dominant hand, vision correction and approximate diopter value for each eye, "
            "pseudonymous Participant ID, UAV/RC, FPV, simulator and video game experience, "
            "flight hours, certificate and UAV type; the password is stored only as a secure hash. "
            "Date of birth, sex, vision and experience details are optional. The purposes are account "
            "management, authentication, profile management and statistical evaluation under the "
            "separate research consent. Research use of measurements is governed by that separate consent. "
            "Authorized system administrators may access account data. Account data is retained while "
            "the account is in use; after anonymization, pseudonymized measurements may be retained "
            f"under the research rules. Retention period: {retention}. By checking the box you consent "
            "to this processing; you may withdraw consent at any time in the student profile. "
            "You may request access, rectification, erasure or restriction of processing and lodge a "
            "complaint with a supervisory authority; the exercise of these rights may depend on "
            "applicable legal obligations and the preservation of research records."
        )
    return (
        f"Prevádzkovateľ: {controller}; adresa: {address}; kontakt: {contact}. "
        "Údaje spracúvané v účte a profile: meno, priezvisko, e-mail, dátum narodenia, "
        "pohlavie, dominantná ruka, zraková korekcia a približná sila dioptrií pre každé oko, "
        "pseudonymné Participant ID, skúsenosti s UAV/RC, FPV, simulátormi a videohrami, "
        "letové hodiny, osvedčenie a typ UAV; heslo sa uchováva iba v zabezpečenej hashovanej podobe. "
        "Údaje o dátume narodenia, pohlaví, zraku a skúsenostiach sú voliteľné. Účelom je správa účtu, "
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


def consent_texts(lang: ConsentLanguage = "sk") -> dict[str, object]:
    return {
        "research": {"version": RESEARCH_CONSENT_VERSION, "text": research_consent_text(lang)},
        "gdpr": {
            "version": GDPR_CONSENT_VERSION,
            "text": gdpr_consent_text(lang),
            "configured": bool(
                settings.data_controller_name
                and settings.data_controller_address
                and settings.data_controller_email
                and (settings.data_retention_notice_en if lang == "en" else settings.data_retention_notice)
            ),
        },
    }
