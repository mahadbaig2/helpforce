"""Generate four bundled PDF fixtures used by the local document preview."""

from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "fixtures" / "seed-pdfs"
OUTPUT.mkdir(parents=True, exist_ok=True)

TITLES = [
    "Procurement policy update", "Quarterly budget release",
    "Regional office equipment", "Staff leave procedure",
    "Vendor renewal request", "Training programme approval",
    "Records retention schedule", "Travel reimbursement policy",
]
TYPES = ["Policy", "Finance", "Operations", "Personnel"]

NAVY = colors.HexColor("#17394f")
MUTED = colors.HexColor("#5d7180")
RULE = colors.HexColor("#d9e3e8")

title_style = ParagraphStyle("Title", fontName="Helvetica-Bold", fontSize=20, leading=25, textColor=NAVY, spaceAfter=16)
section_style = ParagraphStyle("Section", fontName="Helvetica-Bold", fontSize=11, leading=15, textColor=NAVY, spaceBefore=23, spaceAfter=8)
body_style = ParagraphStyle("Body", fontName="Helvetica", fontSize=10.5, leading=17, textColor=colors.HexColor("#283c48"))
note_style = ParagraphStyle("Note", fontName="Helvetica", fontSize=9, leading=14, textColor=MUTED)


def draw_page(canvas, document):
    canvas.saveState()
    width, height = A4
    canvas.setFillColor(NAVY)
    canvas.rect(0, height - 14, width, 14, fill=1, stroke=0)
    canvas.setFont("Helvetica-Bold", 10)
    canvas.drawString(52, height - 52, "HELPFORCE")
    canvas.setFont("Helvetica", 9)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(width - 52, height - 52, "DOCUMENT APPROVALS")
    canvas.setStrokeColor(RULE)
    canvas.line(52, height - 67, width - 52, height - 67)
    canvas.line(52, 54, width - 52, 54)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(52, 38, f"{document._helpforce_id}  |  Supporting document")
    canvas.drawRightString(width - 52, 38, f"Page {document.page}")
    canvas.restoreState()


for index in (0, 5, 10, 15):
    document_id = f"HF-{index + 101:04d}"
    title = f"{TITLES[index // 4]} {index + 1}"
    kind = TYPES[(index // 3) % len(TYPES)]
    filename = OUTPUT / f"{document_id}.pdf"
    doc = SimpleDocTemplate(
        str(filename), pagesize=A4, leftMargin=52, rightMargin=52,
        topMargin=94, bottomMargin=78, title=title, author="Helpforce",
    )
    doc._helpforce_id = document_id
    details = Table(
        [["DOCUMENT ID", "CATEGORY", "PREPARED FOR"],
         [document_id, kind, "Officer and Senior Officer review"]],
        colWidths=[113, 110, 268],
    )
    details.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f2f6f8")),
        ("TEXTCOLOR", (0, 0), (-1, 0), MUTED),
        ("TEXTCOLOR", (0, 1), (-1, 1), NAVY),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("FONTSIZE", (0, 1), (-1, 1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 4),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 13),
        ("TOPPADDING", (0, 0), (-1, 0), 12),
        ("LEFTPADDING", (0, 0), (-1, -1), 11),
    ]))
    sections = [
        ("Purpose and background", f"This {kind.lower()} request describes the proposed change for the regional team. It explains why the current process needs review and who will be affected."),
        ("Proposed action", f"Approve the revised {TITLES[index // 4].lower()} for the next operating period. The Clerk will coordinate implementation after final approval."),
        ("Impact and controls", "The team will record any costs, notify affected colleagues, and review the outcome after thirty days."),
    ]
    story = [Paragraph(escape(title), title_style), details, Spacer(1, 20)]
    for heading, body in sections:
        story.extend((Paragraph(escape(heading), section_style), Paragraph(escape(body), body_style)))
    story.extend((Spacer(1, 28), Paragraph("This supporting document is included for the local approval demonstration. The document body in the application remains the source for AI summary citations.", note_style)))
    doc.build(story, onFirstPage=draw_page, onLaterPages=draw_page)
    print(f"{filename.name}: {filename.stat().st_size} bytes")
