# This is backend/run.py
import os
from dotenv import load_dotenv

# Force load environment variables from .env file before anything else runs
load_dotenv(override=True)

from app import create_app

app = create_app()

if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    debug = os.getenv("FLASK_ENV", "development") != "production"
    app.run(debug=debug, host="0.0.0.0", port=port)