
from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError

from backend import models


def test_create_invoice(db_session):
    invoice = models.Invoice(
        invoice_number="TEST-INV-001",
        vendor_name="TEST VENDOR",
        currency="INR",
        subtotal=Decimal("1000.00"),
        tax_amount=Decimal("180.00"),
        total_amount=Decimal("1180.00"),
        status="extracted",
        requires_review=False,
    )

    db_session.add(invoice)
    db_session.flush()

    saved = (
        db_session.query(models.Invoice)
        .filter_by(invoice_number="TEST-INV-001")
        .one()
    )

    assert saved.vendor_name == "TEST VENDOR"
    assert saved.total_amount == Decimal("1180.00")


def test_duplicate_vendor_invoice_is_rejected(db_session):
    first = models.Invoice(
        invoice_number="TEST-DUP-001",
        vendor_name="DUPLICATE TEST VENDOR",
        currency="INR",
        total_amount=Decimal("500.00"),
        status="extracted",
        requires_review=False,
    )

    second = models.Invoice(
        invoice_number="TEST-DUP-001",
        vendor_name=" duplicate test vendor ",
        currency="INR",
        total_amount=Decimal("500.00"),
        status="extracted",
        requires_review=False,
    )

    db_session.add(first)
    db_session.flush()

    db_session.add(second)

    with pytest.raises(IntegrityError):
        db_session.flush()

    db_session.rollback()
