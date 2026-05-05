from datetime import date
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, model_validator

from .models import Kasa


class EntryCreate(BaseModel):
    kasa: Kasa
    opis: str
    ulaz: Decimal = Decimal("0")
    izlaz: Decimal = Decimal("0")
    racun_broj: str
    datum: date | None = None

    @model_validator(mode="after")
    def _validate_racun_prefix(self):
        if self.ulaz > 0 and self.izlaz > 0:
            raise ValueError("Stavka ne može imati i ulaz i izlaz")

        # Uplata pazara koristi datum kao racun_broj — preskoci prefiks
        if self.opis.strip().lower() == "uplata pazara":
            return self
        prefix = "a" if self.kasa == Kasa.AVANS else "r"
        if not self.racun_broj or self.racun_broj[0].lower() != prefix:
            label = "AVANS (a...)" if self.kasa == Kasa.AVANS else "PAZAR (r...)"
            raise ValueError(
                f"Račun broj mora počinjati sa '{prefix}' za kasu {label}"
            )
        return self


class EntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kasa: Kasa
    datum: date
    opis: str
    ulaz: Decimal
    izlaz: Decimal
    racun_broj: str


class DayJournal(BaseModel):
    kasa: Kasa
    datum: date
    prethodni_saldo: Decimal
    ukupno_ulaz: Decimal
    ukupno_izlaz: Decimal
    saldo: Decimal
    entries: list[EntryOut]
