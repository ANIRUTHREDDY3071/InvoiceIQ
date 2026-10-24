
import os

from dotenv import load_dotenv
from google import genai

# Locate the .env file in the InvoiceIQ project root
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))

API_KEY = os.getenv("GEMINI_API_KEY")

if not API_KEY:
    raise RuntimeError(
        "GEMINI_API_KEY is missing. Check the project-root .env file."
    )

client = genai.Client(api_key=API_KEY)

MODEL_NAME = "gemini-flash-latest"


def test_gemini_connection() -> str:
    """Test connectivity with the Gemini API."""
    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=(
            "Reply with exactly this text: "
            "InvoiceIQ Gemini connection successful."
        ),
    )

    if not response.text:
        raise RuntimeError("Gemini returned an empty response.")

    return response.text.strip()
