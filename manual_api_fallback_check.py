
from unittest.mock import patch

from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

sample_pdf_text = """
ORBIT TEST SUPPLIES
Invoice Number: FALLBACK-API-TEST-008
Invoice Date: 2026-10-17
Due Date: 2026-11-16
PO Number: PO-ORBIT-007
Subtotal: 1000.00
GST: 180.00
Total: 1180.00
"""

# Build a simple text-based PDF for this test.
from io import BytesIO
from reportlab.pdfgen import canvas

pdf_buffer = BytesIO()
pdf_canvas = canvas.Canvas(pdf_buffer)
y = 780

for line in sample_pdf_text.strip().splitlines():
    pdf_canvas.drawString(60, y, line)
    y -= 20

pdf_canvas.save()
pdf_bytes = pdf_buffer.getvalue()

with patch(
    "backend.main.extract_invoice_with_gemini",
    side_effect=RuntimeError("Simulated Gemini outage"),
):
    response = client.post(
        "/api/v1/invoices/extract-structured",
        files={
            "file": (
                "fallback_api_test_008.pdf",
                pdf_bytes,
                "application/pdf",
            )
        },
    )

print("HTTP status:", response.status_code)
print("Response:", response.json())
