# InvoiceIQ — Intelligent Invoice Management System

**A web-based invoice processing and management application with an interactive dashboard, automated data extraction, and review workflows.**

[**🚀 Live Demo**](https://invoice-iq-beta.vercel.app/)

InvoiceIQ is a full-stack application designed to simplify invoice processing by allowing users to upload invoice documents, extract invoice information, review and correct extracted data, and manage invoice records through a centralized dashboard.

The project combines a React frontend, a FastAPI backend, and a PostgreSQL database, with separate frontend and backend deployments.

## 📌 Project Overview

Processing invoices manually can be time-consuming, particularly when invoice information must be reviewed, corrected, searched, and tracked across multiple documents.

InvoiceIQ provides a centralized interface for handling invoice data and reviewing extracted information before relying on it for reporting or further processing.

### Key Features

- **Invoice Upload:** Upload invoice documents through the web interface.
- **Invoice Data Extraction:** Extract relevant invoice fields from uploaded documents.
- **Invoice Management:** View, search, and manage saved invoice records.
- **Review Workflow:** Identify invoices requiring review and correct extracted information.
- **Dashboard Analytics:** View invoice counts, financial summaries, and invoice-related metrics.
- **Data Persistence:** Store invoice records in a PostgreSQL database.
- **REST API:** Communicate between the frontend and backend through FastAPI endpoints.
- **Cloud Deployment:** Access the application online through Vercel and Render.

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React |
| Frontend Tooling | Vite |
| Backend | Python, FastAPI |
| Database | PostgreSQL |
| Database ORM | SQLAlchemy |
| Data Validation | Pydantic |
| AI Integration | Google GenAI SDK |
| Frontend Hosting | Vercel |
| Backend Hosting | Render |
| API Documentation | FastAPI / OpenAPI |
| Version Control | Git and GitHub |

## 🏗️ System Architecture

```text
                 User
                  |
                  v
        React + Vite Frontend
              (Vercel)
                  |
             REST API
                  |
                  v
           FastAPI Backend
              (Render)
             /         \
            v           v
    Invoice Processing  PostgreSQL
    and Review Logic     Database
```

### Application Flow

1. The user uploads an invoice through the frontend.
2. The backend processes the uploaded document and extracts available invoice information.
3. Extracted information is stored as an invoice record.
4. Invoices that require attention can be reviewed and corrected.
5. The dashboard retrieves invoice data through the API and displays relevant metrics.

## 🚀 Live Application

- **Frontend:** [https://invoice-iq-beta.vercel.app/](https://invoice-iq-beta.vercel.app/)
- **Backend Health Check:** [https://invoiceiq-bsy9.onrender.com/health](https://invoiceiq-bsy9.onrender.com/health)
- **API Documentation:** [https://invoiceiq-bsy9.onrender.com/docs](https://invoiceiq-bsy9.onrender.com/docs)

The frontend and backend are deployed independently. The frontend communicates with the backend using the `VITE_API_URL` environment variable.

## 💻 Run Locally

### Prerequisites

- Python 3.10 or a compatible version supported by the project dependencies
- Node.js and npm
- PostgreSQL
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/ANIRUTHREDDY3071/InvoiceIQ.git
cd InvoiceIQ
```

### 2. Configure the Backend

Create and activate a Python virtual environment.

**Windows PowerShell:**

```powershell
cd backend

python -m venv .venv
.\.venv\Scripts\Activate.ps1

pip install -r requirements.txt
```

Create a `.env` file in the backend directory with the required configuration:

```env
DATABASE_URL=your_postgresql_connection_string
```

Configure any additional environment variables required by the application. If your AI integration requires an API key, configure it locally and keep it private.

Ensure PostgreSQL is running and the configured database is available.

### 3. Start the Backend

From the `backend` directory, run:

```powershell
uvicorn main:app --reload --host 127.0.0.1 --port 8001
```

The backend should be available at:

- API: `http://127.0.0.1:8001`
- Interactive API documentation: `http://127.0.0.1:8001/docs`
- Health check: `http://127.0.0.1:8001/health`

### 4. Configure the Frontend

Open a new terminal:

```powershell
cd frontend
npm install
```

Create a `.env` file inside the `frontend` directory:

```env
VITE_API_URL=http://127.0.0.1:8001
```

### 5. Start the Frontend

```powershell
npm run dev
```

Open the local URL printed by Vite, typically:

`http://localhost:5173`

> **Note:** These instructions assume the repository contains the `backend` and `frontend` directories and that the backend dependencies and environment configuration match the deployed version. Adjust the setup if the repository structure has changed.

## ⚙️ Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string used by the backend |
| `VITE_API_URL` | Base URL of the backend API used by the frontend |
| AI provider credentials, if required | Authenticate requests to the configured AI service |

**Security:** Never commit `.env` files, database credentials, API keys, or other secrets to GitHub. Keep production environment variables configured in the relevant hosting platform.

## ☁️ Deployment

InvoiceIQ uses separate hosting services for the frontend and backend.

### Frontend — Vercel

- Connected to the GitHub repository.
- Built using Vite.
- Configured with `VITE_API_URL` pointing to the deployed backend.

### Backend — Render

- Runs the FastAPI application.
- Uses PostgreSQL for persistent invoice data.
- Exposes API endpoints and a health-check route.
- Configures Cross-Origin Resource Sharing (CORS) to allow requests from the deployed frontend.

## 📁 Repository Structure

```text
InvoiceIQ/
├── backend/
│   ├── main.py
│   ├── database.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.js
├── .gitignore
└── README.md
```

This is a representative overview. Update it to match the exact files and folders in the current repository.

## 🔒 Reliability and Data Handling

- Validate extracted invoice information before relying on it.
- Review uncertain or incomplete fields before finalizing records.
- Keep production credentials out of source control.
- Use a properly configured PostgreSQL database for persistent production records.
- Test invoice creation, editing, deletion, and review workflows before important demonstrations.

## 🎯 Skills Demonstrated

- Full-stack web application development
- REST API development with FastAPI
- Relational database integration using PostgreSQL and SQLAlchemy
- Frontend and backend integration
- Document-processing workflows
- Data correction and review workflows
- Cloud deployment and environment configuration
- Git-based version control and project documentation

## 🔮 Potential Future Enhancements

- User authentication and role-based access control
- Improved extraction confidence indicators
- Duplicate invoice detection
- Advanced search and filtering
- Invoice export to CSV and Excel
- Automated testing and continuous integration
- More detailed analytics and reporting

## 👨‍💻 Author

**Aniruth Reddy**

Computer Science and Engineering

GitHub: [ANIRUTHREDDY3071](https://github.com/ANIRUTHREDDY3071)

---

*InvoiceIQ is a software project for invoice processing and management. Extracted financial information should be reviewed for accuracy before being used for accounting or payment decisions.*
