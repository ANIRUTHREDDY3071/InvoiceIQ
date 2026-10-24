
from io import BytesIO
from unittest.mock import patch

from reportlab.pdfgen import canvas


def create_test_pdf():
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer)

    lines = [
        "BLUEBIRD TEST SERVICES",
        "Invoice Number: API-TEST-001",
        "Invoice Date: 2026-10-17",
        "Due Date: 2026-11-16",
        "PO Number: PO-API-001",
        "Subtotal: 1000.00",
        "GST: 180.00",
        "Total: 1180.00",
    ]

    y = 780
    for line in lines:
        pdf.drawString(60, y, line)
        y -= 20

    pdf.save()
    return buffer.getvalue()


def test_extract_invoice_api_saves_invoice(client):
    gemini_result = {
        "vendor_name": "BLUEBIRD TEST SERVICES",
        "invoice_number": "API-TEST-001",
        "invoice_date": "2026-10-17",
        "due_date": "2026-11-16",
        "currency": "INR",
        "subtotal": 1000.0,
        "tax_amount": 180.0,
        "total_amount": 1180.0,
        "purchase_order_number": "PO-API-001",
    }

    with patch(
        "backend.main.extract_invoice_with_gemini",
        return_value=gemini_result,
    ):
        response = client.post(
            "/api/v1/invoices/extract-structured",
            files={
                "file": (
                    "api_test_invoice.pdf",
                    create_test_pdf(),
                    "application/pdf",
                )
            },
        )

    assert response.status_code == 200

    data = response.json()
    assert data["invoice"]["invoice_number"] == "API-TEST-001"
    assert data["invoice"]["vendor_name"] == "BLUEBIRD TEST SERVICES"
    assert data["invoice"]["total_amount"] == 1180.0
    assert data["invoice"]["purchase_order_number"] == "PO-API-001"
    assert data["invoice"]["requires_review"] is False
    assert data["validation"]["extraction_method"] == "gemini"
