
from pathlib import Path

from pypdf import PdfReader
from backend.gemini_extraction import extract_invoice_with_gemini


def main():
    pdf_path = Path("sample_invoice_002.pdf")

    if not pdf_path.exists():
        print(f"PDF not found: {pdf_path.resolve()}")
        print("Update pdf_path to the location of your sample invoice.")
        return

    reader = PdfReader(str(pdf_path))
    invoice_text = "\n".join(
        page.extract_text() or "" for page in reader.pages
    )

    if not invoice_text.strip():
        print("No selectable text found in the PDF.")
        print("This test requires a text-based PDF, not a scanned image.")
        return

    try:
        result = extract_invoice_with_gemini(invoice_text)

        print("\nGemini extraction successful!")
        print("-" * 40)

        for field, value in result.items():
            print(f"{field}: {value}")

    except Exception as exc:
        print("\nGemini extraction failed.")
        print("Error type:", type(exc).__name__)
        print("Error:", str(exc))


if __name__ == "__main__":
    main()
