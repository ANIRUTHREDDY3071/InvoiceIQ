from backend.gemini_service import test_gemini_connection

if __name__ == "__main__":
    try:
        result = test_gemini_connection()
        print("Gemini test successful!")
        print("Response:", result)
    except Exception as exc:
        print("Gemini test failed.")
        print("Error type:", type(exc).__name__)
        print("Error:", str(exc))