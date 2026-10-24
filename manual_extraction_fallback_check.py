
from unittest.mock import patch

from backend.extraction import extract_invoice_fields
from backend.gemini_extraction import extract_invoice_with_gemini


sample_text = """
ORBIT TEST SUPPLIES
Invoice Number: FALLBACK-TEST-001
Invoice Date: 2026-10-17
Due Date: 2026-11-16
Subtotal: 1000.00
GST: 180.00
Total: 1180.00
"""

with patch(
    "backend.gemini_extraction.client.models.generate_content",
    side_effect=RuntimeError("Simulated Gemini outage"),
):
    try:
        extract_invoice_with_gemini(sample_text)
    except Exception as exc:
            # Log the failure for debugging without exposing secrets.
        print(
            f"Gemini extraction failed: "
            f"{type(exc).__name__}: {exc}"
        )

        # Fall back to the existing rule-based extractor.
        extraction_method = "rule_based"
        extracted = extract_invoice_fields(text)
