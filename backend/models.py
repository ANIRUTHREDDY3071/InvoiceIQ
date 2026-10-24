
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


def utc_now():
    return datetime.now(timezone.utc)


class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    invoice_number: Mapped[str] = mapped_column(String(100), index=True)
    vendor_name: Mapped[str] = mapped_column(String(255), index=True)
    invoice_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    currency: Mapped[str] = mapped_column(String(3), default="INR")
    subtotal: Mapped[float | None] = mapped_column(Numeric(14, 2))
    tax_amount: Mapped[float | None] = mapped_column(Numeric(14, 2))
    total_amount: Mapped[float | None] = mapped_column(Numeric(14, 2))

    purchase_order_number: Mapped[str | None] = mapped_column(String(100))
    source_filename: Mapped[str | None] = mapped_column(String(255))

    status: Mapped[str] = mapped_column(
        String(50), default="uploaded", index=True
    )
    requires_review: Mapped[bool] = mapped_column(Boolean, default=False)
    exception_reason: Mapped[str | None] = mapped_column(Text)

    extracted_data: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )
