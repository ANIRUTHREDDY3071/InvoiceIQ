import io
import os
from pypdf import PdfReader


from datetime import datetime, timezone
from decimal import Decimal

from fastapi import FastAPI, Depends, HTTPException, status, File, UploadFile
from typing import Annotated
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from backend.database import Base, engine, get_db
from backend import models

from backend.extraction import extract_invoice_fields
from sqlalchemy.exc import IntegrityError

from backend.gemini_extraction import extract_invoice_with_gemini
from fastapi.middleware.cors import CORSMiddleware
from fastapi import File, UploadFile
from fastapi.openapi.utils import get_openapi


if os.getenv("INVOICEIQ_SKIP_CREATE_ALL") != "1":
    Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="InvoiceIQ API",
    description="AI-powered intelligent invoice processing and reconciliation system",
    version="0.2.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://invoice-iq-beta.vercel.app",
        "https://invoice-oh29y65nj-aniruthreddy3071s-projects.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request schema: fields supplied when creating an invoice
class InvoiceCreate(BaseModel):
    invoice_number: str = Field(min_length=1, max_length=100)
    vendor_name: str = Field(min_length=1, max_length=255)
    invoice_date: datetime | None = None
    due_date: datetime | None = None
    currency: str = Field(default="INR", min_length=3, max_length=3)
    subtotal: Decimal | None = Field(default=None, ge=0)
    tax_amount: Decimal | None = Field(default=None, ge=0)
    total_amount: Decimal | None = Field(default=None, ge=0)
    purchase_order_number: str | None = None
    source_filename: str | None = None


class ResolvePurchaseOrderRequest(BaseModel):
    purchase_order_number: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
    )
    vendor_name: str | None = Field(
        default=None,
        min_length=1,
        max_length=255,
    )
    invoice_number: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
    )
    invoice_date: datetime | None = None
    due_date: datetime | None = None
    subtotal: Decimal | None = Field(default=None, ge=0)
    tax_amount: Decimal | None = Field(default=None, ge=0)
    total_amount: Decimal | None = Field(default=None, ge=0)

# Response schema: fields returned to API clients
class InvoiceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    invoice_number: str
    vendor_name: str
    invoice_date: datetime | None
    due_date: datetime | None
    currency: str
    subtotal: Decimal | None
    tax_amount: Decimal | None
    total_amount: Decimal | None
    purchase_order_number: str | None
    source_filename: str | None
    status: str
    requires_review: bool
    exception_reason: str | None
    created_at: datetime
    updated_at: datetime



# Response schema: fields returned to API clients
class InvoiceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    invoice_number: str
    vendor_name: str
    invoice_date: datetime | None
    due_date: datetime | None
    currency: str
    subtotal: Decimal | None
    tax_amount: Decimal | None
    total_amount: Decimal | None
    purchase_order_number: str | None
    source_filename: str | None
    status: str
    requires_review: bool
    exception_reason: str | None
    created_at: datetime
    updated_at: datetime


@app.get("/")
def home():
    return {
        "message": "Welcome to InvoiceIQ",
        "status": "running",
        "version": "0.2.0",
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "InvoiceIQ API",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/v1")
def api_info():
    return {
        "project": "InvoiceIQ",
        "purpose": "Intelligent invoice processing and reconciliation",
        "features": [
            "Invoice data extraction",
            "Duplicate invoice detection",
            "Purchase order reconciliation",
            "Exception management",
            "Human approval workflow",
        ],
    }



@app.post(
    "/api/v1/invoices",
    response_model=InvoiceResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Invoices"],
)
def create_invoice(
    invoice: InvoiceCreate,
    db: Session = Depends(get_db),
):
    normalized_vendor = invoice.vendor_name.strip().casefold()
    normalized_number = invoice.invoice_number.strip()

    existing = (
        db.query(models.Invoice)
        .filter(
            models.Invoice.invoice_number == normalized_number,
            models.Invoice.vendor_name.ilike(normalized_vendor),
        )
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An invoice with this vendor and invoice number already exists.",
        )

    invoice_data = invoice.model_dump()
    invoice_data["vendor_name"] = invoice.vendor_name.strip()
    invoice_data["invoice_number"] = normalized_number

    new_invoice = models.Invoice(**invoice_data)

    try:
        db.add(new_invoice)
        db.commit()
        db.refresh(new_invoice)
        return new_invoice
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An invoice with this vendor and invoice number already exists.",
        ) from exc


@app.get(
    "/api/v1/invoices",
    response_model=list[InvoiceResponse],
    tags=["Invoices"],
)
def list_invoices(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    if skip < 0 or not 1 <= limit <= 500:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="skip must be non-negative and limit must be between 1 and 500.",
        )

    return (
        db.query(models.Invoice)
        .order_by(models.Invoice.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@app.get(
    "/api/v1/invoices/{invoice_id}",
    response_model=InvoiceResponse,
    tags=["Invoices"],
)
def get_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
):
    invoice = db.query(models.Invoice).filter(
        models.Invoice.id == invoice_id
    ).first()

    if invoice is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invoice not found.",
        )

    return invoice



@app.patch(
    "/api/v1/invoices/{invoice_id}/resolve-review",
    tags=["Invoices"],
)

def resolve_invoice_review(
    invoice_id: int,
    payload: ResolvePurchaseOrderRequest,
    db: Session = Depends(get_db),
):
    invoice = (
        db.query(models.Invoice)
        .filter(models.Invoice.id == invoice_id)
        .first()
    )

    if invoice is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invoice not found.",
        )

    updates = payload.model_dump(exclude_unset=True)

    if not updates:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide at least one field to correct.",
        )

    # Validate supplied text fields.
    for field in (
        "vendor_name",
        "invoice_number",
        "purchase_order_number",
    ):
        if field in updates:
            value = updates[field]
            if value is not None:
                value = value.strip()
                if not value:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"{field} cannot be empty.",
                    )
                updates[field] = value

    # Do not allow required invoice identifiers to be cleared.
    for field in ("vendor_name", "invoice_number"):
        if field in updates and updates[field] is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{field} cannot be empty.",
            )

    # Save the submitted invoice fields.
    for field, value in updates.items():
        setattr(invoice, field, value)

    # Keep the stored extraction snapshot consistent.
    extracted_data = dict(invoice.extracted_data or {})

    for field, value in updates.items():
        extracted_data[field] = (
            value.isoformat()
            if isinstance(value, datetime)
            else str(value)
            if isinstance(value, Decimal)
            else value
        )

    validation_data = dict(extracted_data.get("validation") or {})
    warnings = list(validation_data.get("warnings") or [])

    # Remove only warnings that explicitly refer to a corrected field
    # and indicate that the field was missing or not found.
    field_terms = {
        "vendor_name": ("vendor", "supplier", "vendor_name"),
        "invoice_number": ("invoice number", "invoice no", "invoice_number"),
        "invoice_date": ("invoice date", "invoice_date"),
        "due_date": ("due date", "due_date"),
        "purchase_order_number": (
            "purchase order number",
            "purchase order",
            "purchase_order_number",
        ),
        "subtotal": ("subtotal", "sub total"),
        "tax_amount": ("tax amount", "tax_amount", "tax"),
        "total_amount": ("total amount", "invoice total", "total_amount"),
    }

    missing_terms = (
    "missing",
    "not found",
    "could not be extracted",
    "could not extract",
    "not extracted",
    "is required",
    )

    for field in updates:
        terms = field_terms.get(field, ())
        if not terms:
            continue

        warnings = [
            warning
            for warning in warnings
            if not (
                any(term in warning.lower() for term in terms)
                and any(term in warning.lower() for term in missing_terms)
            )
        ]

    # Check whether the corrected monetary values reconcile.
    subtotal = invoice.subtotal
    tax = invoice.tax_amount
    total = invoice.total_amount

    if subtotal is not None and tax is not None and total is not None:
        if abs(subtotal + tax - total) > Decimal("0.02"):
            mismatch_warning = (
                "Subtotal plus tax does not match the invoice total."
            )
            if not any(
                "subtotal" in warning.lower()
                and "total" in warning.lower()
                for warning in warnings
            ):
                warnings.append(mismatch_warning)
        else:
            warnings = [
                warning
                for warning in warnings
                if not (
                    "subtotal" in warning.lower()
                    and "total" in warning.lower()
                    and (
                        "match" in warning.lower()
                        or "mismatch" in warning.lower()
                        or "reconcil" in warning.lower()
                    )
                )
            ]

    # Clear only validation errors that explicitly identify a corrected field
    # as missing/unextracted. Keep format, arithmetic, and unrelated errors.
    errors = list(validation_data.get("errors") or [])

    for field in updates:
        terms = field_terms.get(field, ())
        if not terms:
            continue

        errors = [
            error
            for error in errors
            if not (
                isinstance(error, str)
                and any(term in error.lower() for term in terms)
                and any(term in error.lower() for term in missing_terms)
            )
        ]

    validation_data["errors"] = errors
    validation_data["warnings"] = warnings
    validation_data["requires_review"] = bool(errors or warnings)
    validation_data["is_valid"] = not bool(errors)
    extracted_data["validation"] = validation_data
    invoice.extracted_data = extracted_data

    # Preserve unrelated exceptions and unresolved validation errors.
    remaining_reasons = [
        reason.strip()
        for reason in (invoice.exception_reason or "").split(";")
        if reason.strip()
    ]

    for field in updates:
        terms = field_terms.get(field, ())
        if not terms:
            continue

        remaining_reasons = [
            reason
            for reason in remaining_reasons
            if not (
                any(term in reason.lower() for term in terms)
                and any(term in reason.lower() for term in missing_terms)
            )
        ]

    invoice.exception_reason = (
        "; ".join(remaining_reasons) if remaining_reasons else None
    )

    invoice.requires_review = bool(
        remaining_reasons
        or validation_data.get("errors")
        or warnings
    )
    invoice.status = (
        "requires_review" if invoice.requires_review else "extracted"
    )

    try:
        db.commit()
        db.refresh(invoice)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to save the review correction.",
        )

    return {
        "message": (
            "Invoice corrections saved. "
            + (
                "Other review issues remain."
                if invoice.requires_review
                else "Invoice review resolved."
            )
        ),
        "invoice": invoice,
    }

@app.post("/api/v1/invoices/extract-pdf", tags=["Invoice Processing"])
async def extract_invoice_pdf(file: UploadFile = File(...)):
    # Validate the file extension
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Please upload a PDF file.",
        )

    # Read the uploaded file into memory
    content = await file.read()

    if not content:
        raise HTTPException(
            status_code=400,
            detail="The uploaded PDF is empty.",
        )

    # Limit upload size to 10 MB
    max_size = 10 * 1024 * 1024
    if len(content) > max_size:
        raise HTTPException(
            status_code=413,
            detail="PDF size must not exceed 10 MB.",
        )

    
    
    try:
        try:
            reader = PdfReader(io.BytesIO(content))

            if reader.is_encrypted:
                raise HTTPException(
                    status_code=400,
                    detail="Password-protected PDFs are not supported.",
                )

            text = "\n".join(
                page.extract_text() or "" for page in reader.pages
            ).strip()

        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail="The uploaded file is not a valid or readable PDF.",
            ) from exc

        if not text:
            raise HTTPException(
                status_code=422,
                detail="No selectable text found. OCR is needed for this PDF.",
            )


        if reader.is_encrypted:
            raise HTTPException(
                status_code=400,
                detail="Password-protected PDFs are not supported.",
            )

        text = "\n".join(
            page.extract_text() or "" for page in reader.pages
        ).strip()

        if not text:
            return {
                "filename": file.filename,
                "page_count": len(reader.pages),
                "extracted_text": "",
                "message": (
                    "No selectable text found. "
                    "This may be a scanned PDF requiring OCR."
                ),
            }

        return {
            "filename": file.filename,
            "page_count": len(reader.pages),
            "extracted_text": text,
            "message": "PDF text extracted successfully.",
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail="Unable to read this PDF. Please upload a valid PDF.",
        ) from exc
    finally:
        await file.close()



@app.post(
    "/api/v1/invoices/extract-structured",
    tags=["Invoice Processing"],
)
async def extract_structured_invoice(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Please upload a PDF file.",
        )

    content = await file.read()

    if not content:
        raise HTTPException(
            status_code=400,
            detail="The uploaded PDF is empty.",
        )

    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail="PDF size must not exceed 10 MB.",
        )

    
    try:
        try:
            reader = PdfReader(io.BytesIO(content))

            if reader.is_encrypted:
                raise HTTPException(
                    status_code=400,
                    detail="Password-protected PDFs are not supported.",
                )

            text = "\n".join(
                page.extract_text() or "" for page in reader.pages
            ).strip()

        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail="Unable to read this PDF. Please upload a valid PDF.",
            ) from exc


        if not text:
            raise HTTPException(
                status_code=422,
                detail="No selectable text found. OCR is needed for this PDF.",
            )

        
        
        # Extract invoice fields using Gemini, with rule-based fallback.
        extraction_method = "gemini"

        try:
            extracted = extract_invoice_with_gemini(text)

        except Exception:
            # Fall back to the existing rule-based extractor.
            extraction_method = "rule_based"
            extracted = extract_invoice_fields(text)

        # Ensure both extraction methods provide validation data.
        if extraction_method == "rule_based":
            validation = extracted["validation"]
            errors = list(validation.get("errors", []))
            warnings = list(validation.get("warnings", []))
        else:
            # Validate Gemini output before saving.
            errors = []
            warnings = []

        if not extracted.get("vendor_name"):
            errors.append("Vendor name is missing.")

        if not extracted.get("invoice_number"):
            errors.append("Invoice number is missing.")

        for field in ("subtotal", "tax_amount", "total_amount"):
            if extracted.get(field) is None:
                warnings.append(f"{field} is missing.")

            if not extracted.get("invoice_date"):
                warnings.append("Invoice date is missing.")

        subtotal = extracted.get("subtotal")
        tax_amount = extracted.get("tax_amount")
        total_amount = extracted.get("total_amount")

        if (
            subtotal is not None
            and tax_amount is not None
            and total_amount is not None
            and abs(subtotal + tax_amount - total_amount) > Decimal("0.02")
        ):
            errors.append(
                "Subtotal plus tax does not match the total amount."
            )

        # Validate extracted dates without crashing on malformed values.
        for field in ("invoice_date", "due_date"):
            value = extracted.get(field)
            if value:
                try:
                    datetime.fromisoformat(value)
                except (ValueError, TypeError):
                    errors.append(f"{field} has an invalid date.")
                    extracted[field] = None

        validation = {
            "is_valid": not errors,
            "requires_review": bool(errors or warnings),
            "errors": errors,
            "warnings": warnings,
            "extraction_method": extraction_method,
        }


        invoice_number = extracted.get("invoice_number")
        vendor_name = extracted.get("vendor_name")

        invoice_number = invoice_number.strip() if invoice_number else None
        vendor_name = vendor_name.strip() if vendor_name else None

        # Do not save records without the required identifying fields.
        if not invoice_number or not vendor_name:
            raise HTTPException(
                status_code=422,
                detail={
                    "message": "Invoice number or vendor name could not be extracted.",
                    "validation": validation,
                },
            )

        # Prevent duplicate records for the same vendor and invoice number.
        
        existing = (
            db.query(models.Invoice)
            .filter(
                models.Invoice.invoice_number == invoice_number.strip(),
                models.Invoice.vendor_name.ilike(vendor_name.strip()),
            )
            .first()
        )


        if existing:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "This invoice already exists.",
                    "invoice_id": existing.id,
                    "invoice_number": existing.invoice_number,
                    "vendor_name": existing.vendor_name,
                },
            )

        # Convert extracted dates to Python datetime objects.
        invoice_date = (
            datetime.fromisoformat(extracted["invoice_date"])
            if extracted.get("invoice_date")
            else None
        )
        due_date = (
            datetime.fromisoformat(extracted["due_date"])
            if extracted.get("due_date")
            else None
        )

        requires_review = validation["requires_review"]

        # JSON columns must contain JSON-compatible values.
        extracted_json = {
            key: (
                float(value)
                if isinstance(value, Decimal)
                else value
            )
            for key, value in extracted.items()
        }

        new_invoice = models.Invoice(
            invoice_number=invoice_number,
            vendor_name=vendor_name,
            invoice_date=invoice_date,
            due_date=due_date,
            currency=(
            "INR"
            if extracted.get("currency") in ("₹", "Rs", "Rs.", "INR", None, "")
            else extracted.get("currency").upper()
            ),
            subtotal=extracted.get("subtotal"),
            tax_amount=extracted.get("tax_amount"),
            total_amount=extracted.get("total_amount"),
            purchase_order_number=extracted.get(
                "purchase_order_number"
            ),
            source_filename=file.filename,
            status="requires_review" if requires_review else "extracted",
            requires_review=requires_review,
            exception_reason=(
                "; ".join(errors + warnings) if requires_review else None
            ),
            extracted_data=extracted_json,
        )

        
        db.add(new_invoice)

        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(
                status_code=409,
                detail="This invoice already exists for this vendor.",
            ) from exc

        db.refresh(new_invoice)


        return {
            "message": "Invoice extracted and saved successfully.",
            "filename": file.filename,
            "page_count": len(reader.pages),
            "invoice": {
                "id": new_invoice.id,
                "invoice_number": new_invoice.invoice_number,
                "vendor_name": new_invoice.vendor_name,
                "invoice_date": (
                    new_invoice.invoice_date.date().isoformat()
                    if new_invoice.invoice_date else None
                ),
                "due_date": (
                    new_invoice.due_date.date().isoformat()
                    if new_invoice.due_date else None
                ),
                "currency": new_invoice.currency,
                "subtotal": (
                    float(new_invoice.subtotal)
                    if new_invoice.subtotal is not None else None
                ),
                "tax_amount": (
                    float(new_invoice.tax_amount)
                    if new_invoice.tax_amount is not None else None
                ),
                "total_amount": (
                    float(new_invoice.total_amount)
                    if new_invoice.total_amount is not None else None
                ),
                "purchase_order_number": new_invoice.purchase_order_number,
                "source_filename": new_invoice.source_filename,
                "status": new_invoice.status,
                "requires_review": new_invoice.requires_review,
                "exception_reason": new_invoice.exception_reason,
            },
            "validation": validation,
        }

    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to extract and save this invoice. Check the server logs.",
        ) from exc
    finally:
        await file.close()



@app.post(
    "/api/v1/invoices/bulk-extract",
    tags=["Invoice Processing"],
)
async def bulk_extract_invoices(
    files: Annotated[list[UploadFile], File()],
    db: Session = Depends(get_db),
):
    """Extract multiple PDF invoices and report each file independently."""

    max_files = 20
    max_file_size = 10 * 1024 * 1024

    if not files:
        raise HTTPException(
            status_code=400,
            detail="Please upload at least one PDF file.",
        )

    if len(files) > max_files:
        raise HTTPException(
            status_code=400,
            detail=f"A maximum of {max_files} PDFs is allowed per batch.",
        )

    results = []

    try:
        for file in files:
            filename = file.filename or "unnamed.pdf"

            try:
                if not filename.lower().endswith(".pdf"):
                    results.append({
                        "filename": filename,
                        "status": "failed",
                        "message": "Please upload a PDF file.",
                    })
                    continue

                content = await file.read()

                if not content:
                    results.append({
                        "filename": filename,
                        "status": "failed",
                        "message": "The uploaded PDF is empty.",
                    })
                    continue

                if len(content) > max_file_size:
                    results.append({
                        "filename": filename,
                        "status": "failed",
                        "message": "PDF size must not exceed 10 MB.",
                    })
                    continue

                try:
                    reader = PdfReader(io.BytesIO(content))

                    if reader.is_encrypted:
                        results.append({
                            "filename": filename,
                            "status": "failed",
                            "message": "Password-protected PDFs are not supported.",
                        })
                        continue

                    text = "\n".join(
                        page.extract_text() or ""
                        for page in reader.pages
                    ).strip()

                except Exception:
                    results.append({
                        "filename": filename,
                        "status": "failed",
                        "message": "Unable to read this PDF.",
                    })
                    continue

                if not text:
                    results.append({
                        "filename": filename,
                        "status": "failed",
                        "message": (
                            "No selectable text found. OCR is needed "
                            "for this PDF."
                        ),
                    })
                    continue

                # Reuse the existing extraction services.
                extraction_method = "gemini"

                try:
                    extracted = extract_invoice_with_gemini(text)
                except Exception:
                    extraction_method = "rule_based"
                    extracted = extract_invoice_fields(text)

                validation = extracted.get("validation", {})
                errors = list(validation.get("errors", []))
                warnings = list(validation.get("warnings", []))

                vendor_name = extracted.get("vendor_name")
                invoice_number = extracted.get("invoice_number")

                vendor_name = (
                    vendor_name.strip()
                    if isinstance(vendor_name, str) and vendor_name.strip()
                    else None
                )
                invoice_number = (
                    invoice_number.strip()
                    if isinstance(invoice_number, str) and invoice_number.strip()
                    else None
                )

                if not vendor_name:
                    errors.append("Vendor name is missing.")

                if not invoice_number:
                    errors.append("Invoice number is missing.")

                for field in ("subtotal", "tax_amount", "total_amount"):
                    if extracted.get(field) is None:
                        warnings.append(f"{field} is missing.")

                if not extracted.get("invoice_date"):
                    warnings.append("Invoice date is missing.")

                subtotal = extracted.get("subtotal")
                tax_amount = extracted.get("tax_amount")
                total_amount = extracted.get("total_amount")

                if (
                    subtotal is not None
                    and tax_amount is not None
                    and total_amount is not None
                    and abs(
                        subtotal + tax_amount - total_amount
                    ) > Decimal("0.02")
                ):
                    errors.append(
                        "Subtotal plus tax does not match the total amount."
                    )

                for field in ("invoice_date", "due_date"):
                    value = extracted.get(field)
                    if value:
                        try:
                            datetime.fromisoformat(value)
                        except (ValueError, TypeError):
                            errors.append(f"{field} has an invalid date.")
                            extracted[field] = None

                validation = {
                    "is_valid": not errors,
                    "requires_review": bool(errors or warnings),
                    "errors": errors,
                    "warnings": warnings,
                    "extraction_method": extraction_method,
                }

                if not vendor_name or not invoice_number:
                    results.append({
                        "filename": filename,
                        "status": "failed",
                        "message": (
                            "Vendor name or invoice number could not "
                            "be extracted."
                        ),
                        "validation": validation,
                    })
                    continue

                existing = (
                    db.query(models.Invoice)
                    .filter(
                        models.Invoice.invoice_number == invoice_number,
                        models.Invoice.vendor_name.ilike(vendor_name),
                    )
                    .first()
                )

                
                if existing:
                    results.append({
                        "filename": filename,
                        "status": "duplicate",
                        "message": "This invoice already exists.",
                        "invoice_id": existing.id,
                        "invoice_number": existing.invoice_number,
                        "vendor_name": existing.vendor_name,
                        "invoice_date": (
                            existing.invoice_date.isoformat()
                            if existing.invoice_date else None
                        ),
                        "due_date": (
                            existing.due_date.isoformat()
                            if existing.due_date else None
                        ),
                        "currency": existing.currency,
                        "subtotal": existing.subtotal,
                        "tax_amount": existing.tax_amount,
                        "total_amount": existing.total_amount,
                        "purchase_order_number": existing.purchase_order_number,
                        "requires_review": existing.requires_review,
                        "exception_reason": existing.exception_reason,
                        "validation": {
                            "is_valid": not existing.requires_review,
                            "requires_review": existing.requires_review,
                            "errors": [],
                            "warnings": [],
                            "extraction_method": "existing_record",
                        },
                    })
                    continue


                invoice_date = (
                    datetime.fromisoformat(extracted["invoice_date"])
                    if extracted.get("invoice_date")
                    else None
                )
                due_date = (
                    datetime.fromisoformat(extracted["due_date"])
                    if extracted.get("due_date")
                    else None
                )

                requires_review = validation["requires_review"]

                extracted_json = {
                    key: (
                        float(value)
                        if isinstance(value, Decimal)
                        else value
                    )
                    for key, value in extracted.items()
                }
                extracted_json["validation"] = validation

                currency = extracted.get("currency")
                if currency in ("₹", "Rs", "Rs.", "INR", None, ""):
                    currency = "INR"
                elif isinstance(currency, str):
                    currency = currency.upper()
                else:
                    currency = "INR"

                new_invoice = models.Invoice(
                    invoice_number=invoice_number,
                    vendor_name=vendor_name,
                    invoice_date=invoice_date,
                    due_date=due_date,
                    currency=currency,
                    subtotal=subtotal,
                    tax_amount=tax_amount,
                    total_amount=total_amount,
                    purchase_order_number=extracted.get(
                        "purchase_order_number"
                    ),
                    source_filename=filename,
                    status=(
                        "requires_review"
                        if requires_review
                        else "extracted"
                    ),
                    requires_review=requires_review,
                    exception_reason=(
                        "; ".join(errors + warnings)
                        if requires_review
                        else None
                    ),
                    extracted_data=extracted_json,
                )

                db.add(new_invoice)

                try:
                    db.commit()
                    db.refresh(new_invoice)
                except IntegrityError:
                    db.rollback()

                    results.append({
                        "filename": filename,
                        "status": "duplicate",
                        "message": (
                            "This invoice already exists for this vendor."
                        ),
                        "invoice_number": invoice_number,
                        "vendor_name": vendor_name,
                    })
                    continue

                results.append({
                    "filename": filename,
                    "status": (
                        "requires_review"
                        if requires_review
                        else "success"
                    ),
                    "message": "Invoice extracted and saved.",
                    "invoice_id": new_invoice.id,
                    "invoice_number": new_invoice.invoice_number,
                    "vendor_name": new_invoice.vendor_name,
                    "invoice_date": (
                        new_invoice.invoice_date.date().isoformat()
                        if new_invoice.invoice_date
                        else None
                    ),
                    "due_date": (
                        new_invoice.due_date.date().isoformat()
                        if new_invoice.due_date
                        else None
                    ),
                    "currency": new_invoice.currency,
                    "subtotal": (
                        float(new_invoice.subtotal)
                        if new_invoice.subtotal is not None
                        else None
                    ),
                    "tax_amount": (
                        float(new_invoice.tax_amount)
                        if new_invoice.tax_amount is not None
                        else None
                    ),
                    "total_amount": (
                        float(new_invoice.total_amount)
                        if new_invoice.total_amount is not None
                        else None
                    ),
                    "purchase_order_number": (
                        new_invoice.purchase_order_number
                    ),
                    "requires_review": new_invoice.requires_review,
                    "exception_reason": new_invoice.exception_reason,
                    "validation": validation,
                })

            except Exception:
                db.rollback()
                results.append({
                    "filename": filename,
                    "status": "failed",
                    "message": (
                        "Unable to process this invoice. "
                        "Check the server logs."
                    ),
                })

            finally:
                await file.close()

    finally:
        # Close any remaining files if processing was interrupted.
        for file in files:
            if not file.file.closed:
                await file.close()

    return {
        "message": "Bulk invoice processing completed.",
        "total_files": len(files),
        "successful": sum(
            item["status"] == "success" for item in results
        ),
        "requires_review": sum(
            item["status"] == "requires_review" for item in results
        ),
        "duplicates": sum(
            item["status"] == "duplicate" for item in results
        ),
        "failed": sum(
            item["status"] == "failed" for item in results
        ),
        "results": results,
    }


@app.delete("/api/v1/invoices/{invoice_id}", tags=["Invoices"])
def delete_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
):
    invoice = (
        db.query(models.Invoice)
        .filter(models.Invoice.id == invoice_id)
        .first()
    )

    if invoice is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invoice not found.",
        )

    try:
        db.delete(invoice)
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to delete the invoice.",
        ) from exc

    return {
        "message": "Invoice deleted successfully.",
        "invoice_id": invoice_id,
    }


def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema

    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )

    # Tell Swagger UI that each item in the files array is a file.
    for component in schema.get("components", {}).get("schemas", {}).values():
        for prop in component.get("properties", {}).values():
            if prop.get("type") == "array":
                items = prop.get("items", {})

                if items.get("contentMediaType") == "application/octet-stream":
                    items.pop("contentMediaType", None)
                    items["type"] = "string"
                    items["format"] = "binary"

    # Use OpenAPI 3.0 so Swagger UI renders binary file inputs.
    schema["openapi"] = "3.0.3"

    app.openapi_schema = schema
    return app.openapi_schema


app.openapi = custom_openapi
