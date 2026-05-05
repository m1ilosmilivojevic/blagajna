import enum
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy import String, Numeric, Date, DateTime, Enum, func
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class Kasa(str, enum.Enum):
    AVANS = "AVANS"
    PAZAR = "PAZAR"


class Entry(Base):
    __tablename__ = "entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    kasa: Mapped[Kasa] = mapped_column(Enum(Kasa, name="kasa"), index=True)
    datum: Mapped[date] = mapped_column(Date, index=True)
    opis: Mapped[str] = mapped_column(String(200))
    ulaz: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    izlaz: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    racun_broj: Mapped[str] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
