from decimal import Decimal
from datetime import timedelta
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
)

from .schemas import DayJournal


def _fmt(n: Decimal) -> str:
    return f"{Decimal(n):,.2f}"


def _fmt_or_blank(n: Decimal) -> str:
    return _fmt(n) if Decimal(n) != 0 else ""


def _fmt_date(d) -> str:
    return d.strftime("%d.%m.%Y")


def _journal_story(journal: DayJournal):
    styles = getSampleStyleSheet()
    h = ParagraphStyle("h", parent=styles["Heading1"], fontSize=18, spaceAfter=2)
    meta = ParagraphStyle("meta", parent=styles["Normal"], fontSize=10, leading=13)

    firma = (
        "AVANSI Joviste, Subotica"
        if journal.kasa.value == "AVANS"
        else "Joviste PAZAR, Subotica"
    )
    prev_date = journal.datum - timedelta(days=1)

    story = [
        Paragraph("DNEVNIK BLAGAJNE", h),
        Paragraph(f"<b>Datum:</b> {_fmt_date(journal.datum)}", meta),
        Paragraph(f"<b>Firma:</b> {firma}", meta),
        Spacer(1, 6 * mm),
    ]

    header = ["Rb.", "Opis", "Ulaz", "Izlaz", "Racun broj"]
    rows = [header]
    for i, e in enumerate(journal.entries, 1):
        rows.append([
            str(i),
            e.opis,
            _fmt_or_blank(e.ulaz),
            _fmt_or_blank(e.izlaz),
            e.racun_broj,
        ])
    rows.append([
        "",
        "PROMET BLAGAJNE:",
        _fmt(journal.ukupno_ulaz),
        _fmt(journal.ukupno_izlaz),
        "",
    ])

    col_widths = [15 * mm, 75 * mm, 30 * mm, 30 * mm, 30 * mm]
    table = Table(rows, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BOX", (0, 0), (-1, -2), 0.4, colors.black),
        ("INNERGRID", (0, 0), (-1, -2), 0.25, colors.grey),
        ("LINEABOVE", (0, -1), (-1, -1), 0.6, colors.black),
        ("LINEBELOW", (0, -1), (-1, -1), 0.6, colors.black),
        ("FONTNAME", (1, -1), (1, -1), "Helvetica-Bold"),
        ("ALIGN", (2, 0), (3, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(table)
    story.append(Spacer(1, 4 * mm))

    summary = [
        [f"Prethodni saldo ({_fmt_date(prev_date)}):", _fmt(journal.prethodni_saldo)],
        ["Ukupno primljeno:", _fmt(journal.ukupno_ulaz)],
        ["Odbija se izdatak:", _fmt(journal.ukupno_izlaz)],
        [f"Saldo od {_fmt_date(journal.datum)}:", _fmt(journal.saldo)],
    ]
    sum_table = Table(summary, colWidths=[60 * mm, 40 * mm])
    sum_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.black),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(sum_table)

    story.append(Spacer(1, 18 * mm))
    sig_row = [["Blagajnik", "Kontrolisao", "Broj priloga"], ["", "", ""]]
    sig_table = Table(sig_row, colWidths=[60 * mm, 60 * mm, 40 * mm], rowHeights=[6 * mm, 14 * mm])
    sig_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("BOX", (0, 0), (0, -1), 0.4, colors.black),
        ("BOX", (1, 0), (1, -1), 0.4, colors.black),
        ("BOX", (2, 0), (2, -1), 0.4, colors.black),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(sig_table)
    return story


def render_journal_pdf(journal: DayJournal) -> bytes:
    return render_journals_pdf([journal])


def render_journals_pdf(journals: list[DayJournal]) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
    )
    full = []
    for i, j in enumerate(journals):
        if i:
            full.append(PageBreak())
        full.extend(_journal_story(j))
    doc.build(full)
    return buf.getvalue()


def render_journal_range_pdf(journals: list[DayJournal]) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
    )
    styles = getSampleStyleSheet()
    h = ParagraphStyle("h", parent=styles["Heading1"], fontSize=18, spaceAfter=2)
    meta = ParagraphStyle("meta", parent=styles["Normal"], fontSize=10, leading=13)

    first = journals[0]
    last = journals[-1]
    firma = (
        "AVANSI Joviste, Subotica"
        if first.kasa.value == "AVANS"
        else "Joviste PAZAR, Subotica"
    )
    period = f"{_fmt_date(first.datum)} - {_fmt_date(last.datum)}"
    prev_date = first.datum - timedelta(days=1)
    total_ulaz = sum((j.ukupno_ulaz for j in journals), Decimal("0"))
    total_izlaz = sum((j.ukupno_izlaz for j in journals), Decimal("0"))

    story = [
        Paragraph("DNEVNIK BLAGAJNE", h),
        Paragraph(f"<b>Period:</b> {period}", meta),
        Paragraph(f"<b>Firma:</b> {firma}", meta),
        Spacer(1, 6 * mm),
    ]

    header = ["Datum", "Rb.", "Opis", "Ulaz", "Izlaz", "Racun broj"]
    rows = [header]
    rb = 1
    for journal in journals:
        for e in journal.entries:
            rows.append([
                _fmt_date(journal.datum),
                str(rb),
                e.opis,
                _fmt_or_blank(e.ulaz),
                _fmt_or_blank(e.izlaz),
                e.racun_broj,
            ])
            rb += 1
    rows.append([
        "",
        "",
        "PROMET ZA PERIOD:",
        _fmt(total_ulaz),
        _fmt(total_izlaz),
        "",
    ])

    col_widths = [24 * mm, 11 * mm, 65 * mm, 27 * mm, 27 * mm, 26 * mm]
    table = Table(rows, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("BOX", (0, 0), (-1, -2), 0.4, colors.black),
        ("INNERGRID", (0, 0), (-1, -2), 0.25, colors.grey),
        ("LINEABOVE", (0, -1), (-1, -1), 0.6, colors.black),
        ("LINEBELOW", (0, -1), (-1, -1), 0.6, colors.black),
        ("FONTNAME", (2, -1), (2, -1), "Helvetica-Bold"),
        ("ALIGN", (3, 0), (4, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(table)
    story.append(Spacer(1, 4 * mm))

    summary = [
        [f"Prethodni saldo ({_fmt_date(prev_date)}):", _fmt(first.prethodni_saldo)],
        ["Ukupno primljeno:", _fmt(total_ulaz)],
        ["Odbija se izdatak:", _fmt(total_izlaz)],
        [f"Saldo od {_fmt_date(last.datum)}:", _fmt(last.saldo)],
    ]
    sum_table = Table(summary, colWidths=[60 * mm, 40 * mm])
    sum_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.black),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(sum_table)

    story.append(Spacer(1, 18 * mm))
    sig_row = [["Blagajnik", "Kontrolisao", "Broj priloga"], ["", "", ""]]
    sig_table = Table(
        sig_row,
        colWidths=[60 * mm, 60 * mm, 40 * mm],
        rowHeights=[6 * mm, 14 * mm],
    )
    sig_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("BOX", (0, 0), (0, -1), 0.4, colors.black),
        ("BOX", (1, 0), (1, -1), 0.4, colors.black),
        ("BOX", (2, 0), (2, -1), 0.4, colors.black),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(sig_table)

    doc.build(story)
    return buf.getvalue()
