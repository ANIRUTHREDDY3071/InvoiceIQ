from io import BytesIO
from unittest.mock import patch
from reportlab.pdfgen import canvas

def test_upload_non_pdf_file_is_rejected(client):
    response = client.post(
        "/api/v1/invoices/extract-structured",
        files={
            "file": (
                "invoice.txt",
                b"This is not a PDF file.",
                "text/plain",
            )
        },
    )

    assert response.status_code == 400
    assert "PDF" in response.json()["detail"]

def test_invalid_pdf_file_is_rejected(client):
    response = client.post(
        "/api/v1/invoices/extract-structured",
        files={
            "file": (
                "invalid_invoice.pdf",
                b"This is not valid PDF content.",
                "application/pdf",
            )
        },
    )

    
    assert response.status_code == 400



from unittest.mock import patch


def test_duplicate_invoice_upload_is_rejected(client):
    from tests.test_invoice_api import create_test_pdf

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
        first_response = client.post(
            "/api/v1/invoices/extract-structured",
            files={
                "file": (
                    "api_test_invoice.pdf",
                    create_test_pdf(),
                    "application/pdf",
                )
            },
        )

        second_response = client.post(
            "/api/v1/invoices/extract-structured",
            files={
                "file": (
                    "api_test_invoice.pdf",
                    create_test_pdf(),
                    "application/pdf",
                )
            },
        )

    assert first_response.status_code == 200
    assert second_response.status_code == 409
    assert "already exists" in second_response.json()["detail"]["message"]


def create_duplicate_test_pdf():
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





def test_missing_invoice_number_is_rejected(client):
    gemini_result = {
        "vendor_name": "BLUEBIRD TEST SERVICES",
        "invoice_number": None,
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
                    "missing_invoice_number.pdf",
                    create_duplicate_test_pdf(),
                    "application/pdf",
                )
            },
        )

    assert response.status_code == 422

    detail = response.json()["detail"]
    assert (
        detail["message"]
        == "Invoice number or vendor name could not be extracted."
    )
    assert "Invoice number is missing." in detail["validation"]["errors"]


def test_missing_vendor_name_is_rejected(client):
    gemini_result = {
        "vendor_name": None,
        "invoice_number": "MISSING-VENDOR-001",
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
                    "missing_vendor.pdf",
                    create_duplicate_test_pdf(),
                    "application/pdf",
                )
            },
        )

    assert response.status_code == 422

    detail = response.json()["detail"]
    assert (
        detail["message"]
        == "Invoice number or vendor name could not be extracted."
    )
    assert "Vendor name is missing." in detail["validation"]["errors"]


def test_gemini_failure_uses_rule_based_fallback(client):
    with patch(
        "backend.main.extract_invoice_with_gemini",
        side_effect=RuntimeError("Simulated Gemini failure"),
    ):
        response = client.post(
            "/api/v1/invoices/extract-structured",
            files={
                "file": (
                    "fallback_test_invoice.pdf",
                    create_duplicate_test_pdf(),
                    "application/pdf",
                )
            },
        )

    assert response.status_code == 200

    data = response.json()
    assert data["invoice"]["invoice_number"] == "API-TEST-001"
    assert data["invoice"]["vendor_name"] == "BLUEBIRD TEST SERVICES"
    assert data["validation"]["extraction_method"] == "rule_based"

def test_incorrect_invoice_total_is_flagged_for_review(client):
    gemini_result = {
        "vendor_name": "BLUEBIRD TEST SERVICES",
        "invoice_number": "API-ARITHMETIC-001",
        "invoice_date": "2026-10-17",
        "due_date": "2026-11-16",
        "currency": "INR",
        "subtotal": 1000.0,
        "tax_amount": 180.0,
        "total_amount": 1250.0,
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
                    "incorrect_total_invoice.pdf",
                    create_duplicate_test_pdf(),
                    "application/pdf",
                )
            },
        )

    assert response.status_code == 200

    data = response.json()

    assert data["invoice"]["requires_review"] is True
    assert data["invoice"]["status"] == "requires_review"
    assert data["validation"]["is_valid"] is False
    assert data["validation"]["requires_review"] is True
    assert (
        "Subtotal plus tax does not match the total amount."
        in data["validation"]["errors"]
    )

def test_missing_invoice_date_requires_review(client):
    gemini_result = {
        "vendor_name": "BLUEBIRD TEST SERVICES",
        "invoice_number": "API-MISSING-DATE-001",
        "invoice_date": None,
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
                    "missing_invoice_date.pdf",
                    create_duplicate_test_pdf(),
                    "application/pdf",
                )
            },
        )

    assert response.status_code == 200

    data = response.json()
    assert data["invoice"]["invoice_date"] is None
    assert data["invoice"]["requires_review"] is True
    assert data["invoice"]["status"] == "requires_review"
    assert data["validation"]["requires_review"] is True
    assert any(
        "Invoice date is missing." in warning
        for warning in data["validation"]["warnings"]
    )

def test_empty_pdf_file_is_rejected(client):
    response = client.post(
        "/api/v1/invoices/extract-structured",
        files={
            "file": (
                "empty_invoice.pdf",
                b"",
                "application/pdf",
            )
        },
    )

    assert response.status_code == 400
    assert "empty" in response.json()["detail"].lower()
