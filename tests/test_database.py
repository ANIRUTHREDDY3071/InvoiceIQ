
from sqlalchemy import inspect

from backend.database import Base
import backend.models


def test_invoice_table_exists_in_test_database(db_session):
    inspector = inspect(db_session.bind)

    assert "invoices" in inspector.get_table_names()
