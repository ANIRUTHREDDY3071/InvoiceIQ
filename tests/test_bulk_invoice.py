
from io import BytesIO

from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import MagicMock

from backend.main import app
from unittest.mock import patch


def test_bulk_upload_rejects_more_than_20_files(client):
    files = [
        ("files", (f"invoice_{i}.pdf", BytesIO(b"%PDF-1.4 test"), "application/pdf"))
        for i in range(21)
    ]

    response = client.post("/api/v1/invoices/bulk-extract", files=files)

    assert response.status_code == 400
    assert "maximum of 20 PDFs" in response.json()["detail"]


def test_bulk_upload_rejects_non_pdf_file(client):
    files = [
        ("files", ("notes.txt", BytesIO(b"not a pdf"), "text/plain"))
    ]

    response = client.post("/api/v1/invoices/bulk-extract", files=files)

    assert response.status_code == 200

    data = response.json()
    assert data["total_files"] == 1
    assert data["failed"] == 1
    assert data["results"][0]["status"] == "failed"
    assert data["results"][0]["message"] == "Please upload a PDF file."


def test_bulk_upload_rejects_empty_pdf(client):
    files = [
        ("files", ("empty.pdf", BytesIO(b""), "application/pdf"))
    ]

    response = client.post("/api/v1/invoices/bulk-extract", files=files)

    assert response.status_code == 200

    data = response.json()
    assert data["failed"] == 1
    assert data["results"][0]["status"] == "failed"
    assert data["results"][0]["message"] == "The uploaded PDF is empty."


def test_bulk_upload_rejects_invalid_pdf(client):
    files = [
        ("files", ("broken.pdf", BytesIO(b"this is not a valid PDF"), "application/pdf"))
    ]

    response = client.post("/api/v1/invoices/bulk-extract", files=files)

    assert response.status_code == 200

    data = response.json()
    assert data["failed"] == 1
    assert data["results"][0]["status"] == "failed"
    assert data["results"][0]["message"] == "Unable to read this PDF."






def test_bulk_upload_processes_valid_invoice(client):
    from tests.test_invoice_errors import create_duplicate_test_pdf

    gemini_result = {
        "vendor_name": "BULK TEST SUPPLIES",
        "invoice_number": "BULK-TEST-001",
        "invoice_date": "2026-10-20",
        "due_date": "2026-11-20",
        "currency": "INR",
        "subtotal": 1000.0,
        "tax_amount": 180.0,
        "total_amount": 1180.0,
        "purchase_order_number": "PO-BULK-001",
    }

    with patch(
        "backend.main.extract_invoice_with_gemini",
        return_value=gemini_result,
    ):
        response = client.post(
            "/api/v1/invoices/bulk-extract",
            files=[
                (
                    "files",
                    (
                        "bulk_test_invoice.pdf",
                        create_duplicate_test_pdf(),
                        "application/pdf",
                    ),
                )
            ],
        )

    assert response.status_code == 200

    data = response.json()
    assert data["total_files"] == 1
    assert data["successful"] == 1
    assert data["failed"] == 0
    
    assert data["total_files"] == 1
    assert data["successful"] == 1
    assert data["failed"] == 0

    result = data["results"][0]

    assert result["status"] == "success"
    assert result["message"] == "Invoice extracted and saved."
    assert result["vendor_name"] == "BULK TEST SUPPLIES"
    assert result["invoice_number"] == "BULK-TEST-001"
    assert result["subtotal"] == 1000.0
    assert result["tax_amount"] == 180.0
    assert result["total_amount"] == 1180.0
    assert result["requires_review"] is False
    assert result["validation"]["is_valid"] is True

    assert data["results"][0]["status"] == "success"


def test_bulk_upload_identifies_duplicate_invoice(client):
    from unittest.mock import patch
    from tests.test_invoice_errors import create_duplicate_test_pdf

    gemini_result = {
        "vendor_name": "BLUEBIRD TEST SERVICES",
        "invoice_number": "BULK-DUPLICATE-001",
        "invoice_date": "2026-10-17",
        "due_date": "2026-11-16",
        "currency": "INR",
        "subtotal": 1000.0,
        "tax_amount": 180.0,
        "total_amount": 1180.0,
        "purchase_order_number": "PO-BULK-DUPLICATE",
    }

    with patch(
        "backend.main.extract_invoice_with_gemini",
        return_value=gemini_result,
    ):
        first_response = client.post(
            "/api/v1/invoices/bulk-extract",
            files=[
                (
                    "files",
                    (
                        "first_invoice.pdf",
                        create_duplicate_test_pdf(),
                        "application/pdf",
                    ),
                )
            ],
        )

        second_response = client.post(
            "/api/v1/invoices/bulk-extract",
            files=[
                (
                    "files",
                    (
                        "duplicate_invoice.pdf",
                        create_duplicate_test_pdf(),
                        "application/pdf",
                    ),
                )
            ],
        )

    assert first_response.status_code == 200
    assert first_response.json()["successful"] == 1

    assert second_response.status_code == 200
    data = second_response.json()

    assert data["total_files"] == 1
    assert data["duplicates"] == 1
    assert data["successful"] == 0
    assert data["results"][0]["status"] == "duplicate"
    assert data["results"][0]["invoice_number"] == "BULK-DUPLICATE-001"


def test_bulk_upload_processes_valid_file_when_another_file_fails(client):
    from unittest.mock import patch
    from tests.test_invoice_errors import create_duplicate_test_pdf

    gemini_result = {
        "vendor_name": "MIXED BATCH SUPPLIES",
        "invoice_number": "MIXED-BATCH-001",
        "invoice_date": "2026-10-20",
        "due_date": "2026-11-20",
        "currency": "INR",
        "subtotal": 1000.0,
        "tax_amount": 180.0,
        "total_amount": 1180.0,
        "purchase_order_number": "PO-MIXED-001",
    }

    with patch(
        "backend.main.extract_invoice_with_gemini",
        return_value=gemini_result,
    ):
        response = client.post(
            "/api/v1/invoices/bulk-extract",
            files=[
                (
                    "files",
                    (
                        "valid_mixed_invoice.pdf",
                        create_duplicate_test_pdf(),
                        "application/pdf",
                    ),
                ),
                (
                    "files",
                    (
                        "invalid_mixed_invoice.pdf",
                        b"This is not a valid PDF",
                        "application/pdf",
                    ),
                ),
            ],
        )

    assert response.status_code == 200

    data = response.json()
    assert data["total_files"] == 2
    assert data["successful"] == 1
    assert data["failed"] == 1
    assert data["results"][0]["status"] == "success"
    assert data["results"][0]["invoice_number"] == "MIXED-BATCH-001"
    assert data["results"][1]["status"] == "failed"

