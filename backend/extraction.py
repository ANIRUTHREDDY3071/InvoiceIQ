
import re
from datetime import datetime
from decimal import Decimal, InvalidOperation


def find_text(pattern: str, text: str) -> str | None:
    match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
    return match.group(1).strip() if match else None


def find_amount(label: str, text: str) -> Decimal | None:
    pattern = (
        rf"^\s*{re.escape(label)}\s*"
        rf"(?:\([^)]*\))?\s*[:\-]?\s*₹?\s*"
        rf"([\d,]+(?:\.\d{{1,2}})?)\s*$"
    )
    value = find_text(pattern, text)

    if value is None:
        return None

    try:
        return Decimal(value.replace(",", ""))
    except InvalidOperation:
        return None


def parse_date(value: str | None) -> str | None:
    if not value:
        return None

    for fmt in ("%d %B %Y", "%d %b %Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            continue

    return None


def extract_invoice_fields(text: str) -> dict:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    vendor_name = lines[0] if lines else None

    invoice_number = find_text(
        r"^\s*Invoice\s+Number\s*:?\s*([A-Z0-9][A-Z0-9/-]*)\s*$",
        text,
    )

    invoice_date_raw = find_text(
        r"^\s*Invoice\s+Date\s*:?\s*(.+?)\s*$", text
    )
    due_date_raw = find_text(
        r"^\s*Due\s+Date\s*:?\s*(.+?)\s*$", text
    )
   
    
    purchase_order_number = find_text(
        r"\b(?:P\.?\s*O\.?\s*(?:Number|No\.?)?|Purchase\s+Order(?:\s+(?:Number|No\.?))?)\s*:?\s*([A-Z0-9][A-Z0-9/-]*)",
        text,
    )


    subtotal = find_amount("Subtotal", text)
    tax_amount = find_amount("GST", text)
    total_amount = find_amount("Total", text)

    errors = []
    warnings = []

    required_fields = {
        "vendor_name": vendor_name,
        "invoice_number": invoice_number,
        "invoice_date": parse_date(invoice_date_raw),
        "subtotal": subtotal,
        "tax_amount": tax_amount,
        "total_amount": total_amount,
    }

    for field, value in required_fields.items():
        if value is None or value == "":
            errors.append(f"Could not extract {field}.")

    if subtotal is not None and tax_amount is not None and total_amount is not None:
        if subtotal + tax_amount != total_amount:
            errors.append(
                "Subtotal plus tax does not equal the invoice total."
            )

    invoice_date = parse_date(invoice_date_raw)
    due_date = parse_date(due_date_raw)

    if invoice_date_raw and invoice_date is None:
        warnings.append("Invoice date format was not recognized.")

    if due_date_raw and due_date is None:
        warnings.append("Due date format was not recognized.")

    if purchase_order_number is None:
        warnings.append("Purchase order number was not found.")

    return {
        "vendor_name": vendor_name,
        "invoice_number": invoice_number,
        "invoice_date": invoice_date,
        "due_date": due_date,
        "purchase_order_number": purchase_order_number,
        "currency": "INR" if "₹" in text or "GST" in text else None,
        "subtotal": subtotal,
        "tax_amount": tax_amount,
        "total_amount": total_amount,
        "validation": {
            "is_valid": len(errors) == 0,
            "requires_review": len(errors) > 0 or len(warnings) > 0,
            "errors": errors,
            "warnings": warnings,
        },
    }
