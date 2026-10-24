
def test_created_invoice_can_be_listed_and_retrieved(client):
    invoice_payload = {
        "invoice_number": "RETRIEVAL-TEST-001",
        "vendor_name": "RETRIEVAL TEST SERVICES",
        "invoice_date": "2026-10-17T00:00:00",
        "due_date": "2026-11-16T00:00:00",
        "currency": "INR",
        "subtotal": "1000.00",
        "tax_amount": "180.00",
        "total_amount": "1180.00",
        "purchase_order_number": "PO-RETRIEVAL-001",
        "source_filename": "retrieval_test.pdf",
    }

    # Step 1: Create an invoice.
    create_response = client.post(
        "/api/v1/invoices",
        json=invoice_payload,
    )

    assert create_response.status_code == 201

    created_invoice = create_response.json()
    invoice_id = created_invoice["id"]

    assert created_invoice["invoice_number"] == "RETRIEVAL-TEST-001"
    assert created_invoice["vendor_name"] == "RETRIEVAL TEST SERVICES"

    # Step 2: Retrieve the invoice by its ID.
    detail_response = client.get(
        f"/api/v1/invoices/{invoice_id}"
    )

    assert detail_response.status_code == 200

    retrieved_invoice = detail_response.json()
    assert retrieved_invoice["id"] == invoice_id
    assert retrieved_invoice["invoice_number"] == "RETRIEVAL-TEST-001"
    assert retrieved_invoice["purchase_order_number"] == "PO-RETRIEVAL-001"

    # Step 3: Verify the invoice appears in the invoice list.
    list_response = client.get("/api/v1/invoices")

    assert list_response.status_code == 200

    listed_invoices = list_response.json()
    assert any(
        invoice["id"] == invoice_id
        for invoice in listed_invoices
    )

def test_nonexistent_invoice_returns_404(client):
    response = client.get("/api/v1/invoices/999999")

    assert response.status_code == 404
    assert response.json()["detail"] == "Invoice not found."
