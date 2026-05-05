from datetime import date
from decimal import Decimal
from fastapi import Depends, FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .db import Base, engine, get_db
from .models import Entry, Kasa
from .pdf import render_journal_pdf, render_journals_pdf
from .schemas import DayJournal, EntryCreate, EntryOut

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Blagajna")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def saldo_before(db: Session, kasa: Kasa, datum: date) -> Decimal:
    stmt = select(
        func.coalesce(func.sum(Entry.ulaz - Entry.izlaz), 0)
    ).where(Entry.kasa == kasa, Entry.datum < datum)
    return Decimal(db.execute(stmt).scalar_one())


@app.get("/")
def root():
    return {"status": "ok"}


@app.post("/entries", response_model=EntryOut)
def create_entry(payload: EntryCreate, db: Session = Depends(get_db)):
    if payload.ulaz < 0 or payload.izlaz < 0:
        raise HTTPException(400, "Iznosi ne smeju biti negativni")
    entry = Entry(
        kasa=payload.kasa,
        datum=payload.datum or date.today(),
        opis=payload.opis,
        ulaz=payload.ulaz,
        izlaz=payload.izlaz,
        racun_broj=payload.racun_broj,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@app.get("/journal/{kasa}/{datum}", response_model=DayJournal)
def get_journal(kasa: Kasa, datum: date, db: Session = Depends(get_db)):
    rows = (
        db.execute(
            select(Entry)
            .where(Entry.kasa == kasa, Entry.datum == datum)
            .order_by((Entry.opis == "uplata pazara"), Entry.id)
        )
        .scalars()
        .all()
    )
    prev = saldo_before(db, kasa, datum)
    ukupno_ulaz = sum((e.ulaz for e in rows), Decimal("0"))
    ukupno_izlaz = sum((e.izlaz for e in rows), Decimal("0"))
    return DayJournal(
        kasa=kasa,
        datum=datum,
        prethodni_saldo=prev,
        ukupno_ulaz=ukupno_ulaz,
        ukupno_izlaz=ukupno_izlaz,
        saldo=prev + ukupno_ulaz - ukupno_izlaz,
        entries=[EntryOut.model_validate(e) for e in rows],
    )


class UplataPazara(EntryCreate):
    pass


@app.post("/uplata-pazara")
def create_uplata_pazara(
    payload: UplataPazara, db: Session = Depends(get_db)
):
    if payload.izlaz <= 0:
        raise HTTPException(400, "Iznos mora biti veći od nule")
    datum = payload.datum or date.today()
    racun = payload.racun_broj or datum.strftime("%d.%m.%Y")
    for kasa in (Kasa.AVANS, Kasa.PAZAR):
        db.add(Entry(
            kasa=kasa,
            datum=datum,
            opis="uplata pazara",
            ulaz=Decimal("0"),
            izlaz=payload.izlaz,
            racun_broj=racun,
        ))
    db.commit()
    return {"ok": True}


@app.put("/entries/{entry_id}", response_model=EntryOut)
def update_entry(entry_id: int, payload: EntryCreate, db: Session = Depends(get_db)):
    entry = db.get(Entry, entry_id)
    if not entry:
        raise HTTPException(404, "Stavka ne postoji")
    if payload.ulaz < 0 or payload.izlaz < 0:
        raise HTTPException(400, "Iznosi ne smeju biti negativni")
    entry.kasa = payload.kasa
    entry.datum = payload.datum or entry.datum
    entry.opis = payload.opis
    entry.ulaz = payload.ulaz
    entry.izlaz = payload.izlaz
    entry.racun_broj = payload.racun_broj
    db.commit()
    db.refresh(entry)
    return entry


@app.get("/journal/{kasa}/range/pdf")
def get_journal_range_pdf(
    kasa: Kasa,
    start: date,
    end: date,
    skip_empty: bool = True,
    db: Session = Depends(get_db),
):
    if end < start:
        raise HTTPException(400, "Datum 'do' mora biti posle datuma 'od'")
    from datetime import timedelta
    journals = []
    cur = start
    while cur <= end:
        j = get_journal(kasa, cur, db)
        if not skip_empty or j.entries:
            journals.append(j)
        cur += timedelta(days=1)
    if not journals:
        raise HTTPException(404, "Nema stavki u datom rasponu")
    pdf = render_journals_pdf(journals)
    filename = f"dnevnik_{kasa.value.lower()}_{start.isoformat()}_{end.isoformat()}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@app.get("/journal/{kasa}/{datum}/pdf")
def get_journal_pdf(kasa: Kasa, datum: date, db: Session = Depends(get_db)):
    journal = get_journal(kasa, datum, db)
    pdf = render_journal_pdf(journal)
    filename = f"dnevnik_{kasa.value.lower()}_{datum.isoformat()}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@app.delete("/entries/{entry_id}")
def delete_entry(entry_id: int, db: Session = Depends(get_db)):
    entry = db.get(Entry, entry_id)
    if not entry:
        raise HTTPException(404, "Stavka ne postoji")
    db.delete(entry)
    db.commit()
    return {"ok": True}
