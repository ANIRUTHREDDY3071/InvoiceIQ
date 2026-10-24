
import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import "./App.css";

const API_URL = (
  import.meta.env.VITE_API_URL ||
  "http://127.0.0.1:8001"
).replace(/\/+$/, "");

function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getInvoiceStatus(invoice) {
  if (invoice.requires_review || invoice.status === "requires_review") {
    return {
      label: "Review required",
      className: "review-required",
    };
  }

  if (invoice.status === "extracted") {
    return {
      label: "Extracted",
      className: "approved",
    };
  }

  if (invoice.status === "approved") {
    return {
      label: "Approved",
      className: "approved",
    };
  }

  return {
    label: invoice.status || "Unknown",
    className: "processing",
  };
}

function App() {
  const [invoices, setInvoices] = useState([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [apiError, setApiError] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [lastExtractionResult, setLastExtractionResult] = useState(null);
  const invoiceForValidation = lastExtractionResult?.invoice;

const validationChecks = invoiceForValidation
  ? [
      {
        label: "Vendor name",
        valid: Boolean(invoiceForValidation.vendor_name?.trim()),
      },
      {
        label: "Invoice number",
        valid: Boolean(invoiceForValidation.invoice_number?.trim()),
      },
      {
        label: "Invoice date",
        valid: Boolean(invoiceForValidation.invoice_date),
      },
      {
        label: "Subtotal",
        valid:
          invoiceForValidation.subtotal != null &&
          Number(invoiceForValidation.subtotal) > 0,
      },
      {
        label: "Total amount",
        valid:
          invoiceForValidation.total_amount != null &&
          Number(invoiceForValidation.total_amount) > 0,
      },
    ]
  : [];

const subtotalForValidation = Number(invoiceForValidation?.subtotal);
const taxForValidation = Number(
  invoiceForValidation?.tax_amount ?? invoiceForValidation?.tax
);
const totalForValidation = Number(invoiceForValidation?.total_amount);

const hasAmountsForValidation =
  invoiceForValidation?.subtotal != null &&
  (invoiceForValidation?.tax_amount != null ||
    invoiceForValidation?.tax != null) &&
  invoiceForValidation?.total_amount != null &&
  [subtotalForValidation, taxForValidation, totalForValidation].every(
    Number.isFinite
  );

const hasAmountMismatch =
  hasAmountsForValidation &&
  Math.abs(
    subtotalForValidation + taxForValidation - totalForValidation
  ) > 0.02;

const missingValidationFields = validationChecks.filter(
  (check) => !check.valid
);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [bulkFiles, setBulkFiles] = useState([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResults, setBulkResults] = useState(null);
  const [bulkError, setBulkError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [monthlyMetric, setMonthlyMetric] = useState("count");
  const [dateRange, setDateRange] = useState("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [issueFilter, setIssueFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("date");
  const [sortOrder, setSortOrder] = useState("desc");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [correctionForm, setCorrectionForm] = useState({
  vendor_name: "",
  invoice_number: "",
  invoice_date: "",
  due_date: "",
  purchase_order_number: "",
  subtotal: "",
  tax_amount: "",
  total_amount: "",
});

const [correctionSaving, setCorrectionSaving] = useState(false);
const [correctionMessage, setCorrectionMessage] = useState("");
const [correctionError, setCorrectionError] = useState("");
const [deletingInvoice, setDeletingInvoice] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadInvoices() {
      try {
        const response = await fetch(
          `${API_URL}/api/v1/invoices?skip=0&limit=500`
        );

        if (!response.ok) {
          throw new Error(`API request failed: ${response.status}`);
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
          throw new Error("The API returned an unexpected response.");
        }

        if (!cancelled) {
          setInvoices(data);
          setApiError("");
        }
      } catch (error) {
        if (!cancelled) {
          setApiError(
            "Unable to load invoices. Check that the InvoiceIQ backend is running on port 8001."
          );
        }

        console.error("Failed to load invoices:", error);
      } finally {
        if (!cancelled) {
          setLoadingInvoices(false);
        }
      }
    }

    loadInvoices();

    return () => {
      cancelled = true;
    };
  }, []);

  function handleFileChange(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      window.alert("Please select a PDF file.");
      event.target.value = "";
      return;
    }

    setSelectedFile(file);
  }

  
function handleDragOver(event) {
  event.preventDefault();
  setIsDraggingFile(true);
}

function handleDragLeave(event) {
  event.preventDefault();
  setIsDraggingFile(false);
}

function handleDrop(event) {
  event.preventDefault();
  setIsDraggingFile(false);

  const file = event.dataTransfer.files?.[0];

  if (!file) return;

  if (
    file.type !== "application/pdf" &&
    !file.name.toLowerCase().endsWith(".pdf")
  ) {
    setUploadError("Please drop a PDF invoice file.");
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    setUploadError("The PDF file must be 10 MB or smaller.");
    return;
  }

  setUploadError("");
  setUploadMessage("");
  setSelectedFile(file);
}


async function handleUpload() {
  if (!selectedFile) {
    setUploadError("Please choose a PDF file first.");
    return;
  }

  setUploading(true);
  setUploadMessage("");
  setUploadError("");
  setLastExtractionResult(null);

  try {
    const formData = new FormData();
    formData.append("file", selectedFile);

    const response = await fetch(
      `${API_URL}/api/v1/invoices/extract-structured`,
      {
        method: "POST",
        body: formData,
      }
    );

    const result = await response.json();
    setLastExtractionResult(result);

    if (!response.ok) {
      const detail = result?.detail;
      throw new Error(
        typeof detail === "string"
          ? detail
          : detail?.message || "Invoice processing failed."
      );
    }

    const invoiceNumber = result?.invoice?.invoice_number;

    setUploadMessage(
      `Invoice ${invoiceNumber || selectedFile.name} processed successfully${
        result.validation?.requires_review
          ? " — flagged for review."
          : "."
      }`
    );

    setSelectedFile(null);

    // Refresh the invoice list from PostgreSQL through FastAPI.
    const listResponse = await fetch(
      `${API_URL}/api/v1/invoices?skip=0&limit=500`
    );

    if (listResponse.ok) {
      const data = await listResponse.json();

      if (Array.isArray(data)) {
        setInvoices(data);
      }
    }
  } catch (error) {
    setUploadError(
      error instanceof Error
        ? error.message
        : "Unable to process the invoice."
    );
  } finally {
    setUploading(false);
  }
}

async function handleBulkUpload() {
  if (bulkFiles.length === 0) {
    setBulkError("Please select at least one PDF invoice.");
    return;
  }

  if (bulkFiles.length > 20) {
    setBulkError("You can upload a maximum of 20 PDFs at a time.");
    return;
  }

  setBulkUploading(true);
  setBulkError("");
  setBulkResults(null);

  try {
    const formData = new FormData();

    bulkFiles.forEach((file) => {
      formData.append("files", file);
    });

    const response = await fetch(
      `${API_URL}/api/v1/invoices/bulk-extract`,
      {
        method: "POST",
        body: formData,
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        typeof data?.detail === "string"
          ? data.detail
          : "Bulk invoice processing failed."
      );
    }

    setBulkResults(data);

    const listResponse = await fetch(
      `${API_URL}/api/v1/invoices?skip=0&limit=500`
    );

    if (listResponse.ok) {
      const invoicesData = await listResponse.json();

      if (Array.isArray(invoicesData)) {
        setInvoices(invoicesData);
      }
    }
  } catch (error) {
    setBulkError(
      error instanceof Error
        ? error.message
        : "Unable to process the selected PDFs."
    );
  } finally {
    setBulkUploading(false);
  }
}

function downloadBulkExcel() {
  if (!bulkResults || !Array.isArray(bulkResults.results)) {
    return;
  }

  const results = bulkResults.results;

  const summaryRows = results.map((item) => ({
    "Source File": item.filename || "",
    "Invoice Number": item.invoice_number || "",
    "Vendor Name": item.vendor_name || "",
    "Invoice Date": item.invoice_date || "",
    "Due Date": item.due_date || "",
    Currency: item.currency || "",
    Subtotal: item.subtotal ?? "",
    "Tax Amount": item.tax_amount ?? "",
    "Total Amount": item.total_amount ?? "",
    "Purchase Order": item.purchase_order_number || "",
    Status: item.status || "",
    "Requires Review": item.requires_review ? "Yes" : "No",
    "Exception Reason": item.exception_reason || "",
    Message: item.message || "",
  }));

  const exceptionRows = results
    .filter(
      (item) =>
        item.status !== "success" ||
        item.requires_review ||
        item.exception_reason
    )
    .map((item) => ({
      "Source File": item.filename || "",
      "Invoice Number": item.invoice_number || "",
      "Vendor Name": item.vendor_name || "",
      Status: item.status || "",
      "Exception Reason": item.exception_reason || "",
      Message: item.message || "",
    }));

  const logRows = results.map((item) => ({
    "Source File": item.filename || "",
    Status: item.status || "",
    Message: item.message || "",
    "Invoice ID": item.invoice_id ?? "",
    "Extraction Method":
      item.validation?.extraction_method || "",
    "Validation Errors": (
      item.validation?.errors || []
    ).join("; "),
    "Validation Warnings": (
      item.validation?.warnings || []
    ).join("; "),
  }));

  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(summaryRows),
    "Invoice Summary"
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      exceptionRows.length > 0
        ? exceptionRows
        : [{ Message: "No exceptions reported." }]
    ),
    "Exceptions"
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(logRows),
    "Processing Log"
  );

  XLSX.writeFile(
    workbook,
    `InvoiceIQ_Bulk_Report_${new Date()
      .toISOString()
      .slice(0, 10)}.xlsx`
  );
}


async function openInvoiceDetails(invoiceId) {
  setSelectedInvoiceId(invoiceId);
  setSelectedInvoice(null);
  setDetailError("");
  setDetailLoading(true);
  setCorrectionMessage("");
  setCorrectionError("");

  try {
    const response = await fetch(
      `${API_URL}/api/v1/invoices/${invoiceId}`
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data?.detail || "Unable to load invoice details."
      );
    }

    setSelectedInvoice(data);

    setCorrectionForm({
      vendor_name: data.vendor_name || "",
      invoice_number: data.invoice_number || "",
      invoice_date: data.invoice_date
        ? data.invoice_date.slice(0, 10)
        : "",
      due_date: data.due_date
        ? data.due_date.slice(0, 10)
        : "",
      purchase_order_number:
        data.purchase_order_number || "",
      subtotal: data.subtotal ?? "",
      tax_amount: data.tax_amount ?? "",
      total_amount: data.total_amount ?? "",
    });
  } catch (error) {
    setDetailError(
      error instanceof Error
        ? error.message
        : "Unable to load invoice details."
    );
  } finally {
    setDetailLoading(false);
  }
}



async function handleDeleteInvoice() {
  if (!selectedInvoiceId || deletingInvoice) return;

  const invoiceLabel =
    selectedInvoice?.invoice_number || `ID ${selectedInvoiceId}`;

  const confirmed = window.confirm(
    `Are you sure you want to delete invoice ${invoiceLabel}?\n\n` +
    "This will permanently remove the invoice from the database. " +
    "This action cannot be undone."
  );

  if (!confirmed) return;

  setDeletingInvoice(true);
  setCorrectionError("");
  setCorrectionMessage("");

  try {
    const response = await fetch(
      `${API_URL}/api/v1/invoices/${selectedInvoiceId}`,
      { method: "DELETE" }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        typeof data?.detail === "string"
          ? data.detail
          : "Unable to delete the invoice."
      );
    }

    // Refresh dashboard and invoice list from the backend.
    await refreshInvoices();

    // Close the details panel after successful deletion.
    closeInvoiceDetails();
  } catch (error) {
    setCorrectionError(
      error instanceof Error
        ? error.message
        : "Unable to delete the invoice."
    );
  } finally {
    setDeletingInvoice(false);
  }
}


async function saveInvoiceCorrections() {
  if (!selectedInvoiceId) {
    setCorrectionError("No invoice is selected.");
    return;
  }

  setCorrectionSaving(true);
  setCorrectionMessage("");
  setCorrectionError("");

  const payload = {};

  for (const field of [
    "vendor_name",
    "invoice_number",
    "invoice_date",
    "due_date",
    "purchase_order_number",
    "subtotal",
    "tax_amount",
    "total_amount",
  ]) {
    const value = correctionForm[field];

    if (value === "") {
      if (
        field === "vendor_name" ||
        field === "invoice_number"
      ) {
        setCorrectionError(
          `${field === "vendor_name" ? "Vendor name" : "Invoice number"} cannot be empty.`
        );
        setCorrectionSaving(false);
        return;
      }

      // Empty optional fields are omitted rather than clearing saved values.
      continue;
    }

    if (
      field === "subtotal" ||
      field === "tax_amount" ||
      field === "total_amount"
    ) {
      const numberValue = Number(value);

      if (!Number.isFinite(numberValue) || numberValue < 0) {
        setCorrectionError(
          `${field.replaceAll("_", " ")} must be a valid non-negative number.`
        );
        setCorrectionSaving(false);
        return;
      }

      payload[field] = numberValue;
    } else if (
      field === "invoice_date" ||
      field === "due_date"
    ) {
      payload[field] = `${value}T00:00:00`;
    } else {
      payload[field] = value.trim();
    }
  }

  try {
    const response = await fetch(
      `${API_URL}/api/v1/invoices/${selectedInvoiceId}/resolve-review`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        typeof data?.detail === "string"
          ? data.detail
          : "Unable to save invoice corrections."
      );
    }

    if (data.invoice) {
      setSelectedInvoice(data.invoice);

      setCorrectionForm({
        vendor_name: data.invoice.vendor_name || "",
        invoice_number: data.invoice.invoice_number || "",
        invoice_date: data.invoice.invoice_date
          ? data.invoice.invoice_date.slice(0, 10)
          : "",
        due_date: data.invoice.due_date
          ? data.invoice.due_date.slice(0, 10)
          : "",
        purchase_order_number:
          data.invoice.purchase_order_number || "",
        subtotal: data.invoice.subtotal ?? "",
        tax_amount: data.invoice.tax_amount ?? "",
        total_amount: data.invoice.total_amount ?? "",
      });
    }

    setCorrectionMessage(
      data.message || "Invoice corrections saved."
    );

    // Refresh the invoice list so its status and values stay current.
    const listResponse = await fetch(
      `${API_URL}/api/v1/invoices`
    );

    if (listResponse.ok) {
      const refreshedInvoices = await listResponse.json();
      setInvoices(refreshedInvoices);
    }
  } catch (error) {
    setCorrectionError(
      error instanceof Error
        ? error.message
        : "Unable to save invoice corrections."
    );
  } finally {
    setCorrectionSaving(false);
  }
}



function closeInvoiceDetails() {
  setSelectedInvoiceId(null);
  setSelectedInvoice(null);
  setDetailError("");
  setDetailLoading(false);
}

  
  
  const filteredByDateInvoices = (() => {
    const now = new Date();
    let startDate = null;
    let endDate = new Date(now);

    endDate.setHours(23, 59, 59, 999);

    if (dateRange === "7days") {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 6);
      startDate.setHours(0, 0, 0, 0);
    } else if (dateRange === "30days") {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 29);
      startDate.setHours(0, 0, 0, 0);
    } else if (dateRange === "3months") {
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 3);
      startDate.setHours(0, 0, 0, 0);
    } else if (dateRange === "thisYear") {
      startDate = new Date(now.getFullYear(), 0, 1);
      startDate.setHours(0, 0, 0, 0);
    } else if (dateRange === "custom") {
      if (customStartDate) {
        startDate = new Date(`${customStartDate}T00:00:00`);
      }

      if (customEndDate) {
        endDate = new Date(`${customEndDate}T23:59:59.999`);
      } else {
        endDate = null;
      }
    }

    return invoices.filter((invoice) => {
      if (dateRange === "all") return true;
      if (!invoice.invoice_date) return false;

      const invoiceDate = new Date(invoice.invoice_date);

      if (Number.isNaN(invoiceDate.getTime())) return false;

      if (startDate && invoiceDate < startDate) return false;
      if (endDate && invoiceDate > endDate) return false;

      return true;
    });
  })();

 const totalInvoiceValue = filteredByDateInvoices.reduce(
  (sum, invoice) => sum + Number(invoice.total_amount ?? 0),
  0
);

  const reviewCount = invoices.filter(
    (invoice) =>
      invoice.requires_review || invoice.status === "requires_review"
  ).length;

  const processedCount = filteredByDateInvoices.filter(
  (invoice) =>
    !invoice.requires_review &&
    invoice.status !== "requires_review" &&
    (
      invoice.status === "extracted" ||
      invoice.status === "approved"
    )
).length;
  

const filteredInvoices = invoices.filter((invoice) => {
  const query = searchTerm.trim().toLowerCase();

  const matchesSearch =
    !query ||
    (invoice.invoice_number || "").toLowerCase().includes(query) ||
    (invoice.vendor_name || "").toLowerCase().includes(query);

  const matchesStatus =
    statusFilter === "all" ||
    (statusFilter === "review" &&
      (invoice.requires_review ||
        invoice.status === "requires_review")) ||
    (statusFilter === "extracted" &&
      invoice.status === "extracted") ||
    (statusFilter === "other" &&
      invoice.status !== "extracted" &&
      invoice.status !== "requires_review" &&
      !invoice.requires_review);

  const subtotal = Number(invoice.subtotal);
  const tax = Number(invoice.tax_amount ?? invoice.tax);
  const total = Number(invoice.total_amount);

  const amountsAvailable =
    invoice.subtotal != null &&
    (invoice.tax_amount != null || invoice.tax != null) &&
    invoice.total_amount != null &&
    [subtotal, tax, total].every(Number.isFinite);

  const hasAmountMismatch =
    amountsAvailable &&
    Math.abs(subtotal + tax - total) > 0.02;

  const isMissingVendor = !invoice.vendor_name?.trim();
  const isMissingNumber = !invoice.invoice_number?.trim();
  const isMissingDate = !invoice.invoice_date;

  const matchesIssue =
    activeNav !== "Review queue" ||
    issueFilter === "all" ||
    (issueFilter === "vendor" && isMissingVendor) ||
    (issueFilter === "number" && isMissingNumber) ||
    (issueFilter === "date" && isMissingDate) ||
    (issueFilter === "amount" && hasAmountMismatch);

  return matchesSearch && matchesStatus && matchesIssue;
});


const displayedInvoices =
  activeNav === "Review queue"
    ? filteredInvoices.filter(
        (invoice) =>
          invoice.requires_review ||
          invoice.status === "requires_review"
      )
    : activeNav === "All invoices"
      ? filteredInvoices
      : filteredInvoices.slice(0, 4);

const sortedInvoices = [...displayedInvoices].sort((a, b) => {
  let comparison = 0;

  if (sortBy === "date") {
    comparison =
      new Date(a.invoice_date || 0).getTime() -
      new Date(b.invoice_date || 0).getTime();
  } else if (sortBy === "vendor") {
    comparison = (a.vendor_name || "").localeCompare(
      b.vendor_name || ""
    );
  } else if (sortBy === "amount") {
    comparison =
      Number(a.total_amount || 0) -
      Number(b.total_amount || 0);
  } else if (sortBy === "status") {
    comparison = (a.status || "").localeCompare(
      b.status || ""
    );
  }

  return sortOrder === "asc" ? comparison : -comparison;
});


const totalPages = Math.max(
  1,
  Math.ceil(sortedInvoices.length / pageSize)
);

const safeCurrentPage = Math.min(currentPage, totalPages);

const paginatedInvoices = sortedInvoices.slice(
  (safeCurrentPage - 1) * pageSize,
  safeCurrentPage * pageSize
);


  const dashboardInvoices = [...filteredByDateInvoices].sort(
    (a, b) =>
      new Date(b.invoice_date || 0).getTime() -
      new Date(a.invoice_date || 0).getTime()
  );

 
const processedInvoices = filteredByDateInvoices.filter(
  (invoice) =>
    !invoice.requires_review &&
    invoice.status !== "requires_review" &&
    (
      invoice.status === "extracted" ||
      invoice.status === "approved"
    )
);


  const otherInvoices = filteredByDateInvoices.filter(
    (invoice) =>
      !invoice.requires_review &&
      invoice.status !== "requires_review" &&
      invoice.status !== "extracted" &&
      invoice.status !== "approved"
  );

  const filteredReviewCount = filteredByDateInvoices.filter(
  (invoice) =>
    invoice.requires_review ||
    invoice.status === "requires_review"
).length;

const reviewPercentage =
  filteredByDateInvoices.length > 0
    ? Math.round(
        (filteredReviewCount / filteredByDateInvoices.length) * 100
      )
    : 0;

  const monthlyAnalytics = (() => {
    const months = [];

    for (let offset = 5; offset >= 0; offset--) {
      const date = new Date();
      date.setDate(1);
      date.setMonth(date.getMonth() - offset);

      const year = date.getFullYear();
      const month = date.getMonth();

      const monthInvoices = filteredByDateInvoices.filter((invoice) => {
        if (!invoice.invoice_date) return false;

        const invoiceDate = new Date(invoice.invoice_date);

        return (
          !Number.isNaN(invoiceDate.getTime()) &&
          invoiceDate.getFullYear() === year &&
          invoiceDate.getMonth() === month
        );
      });

      months.push({
        label: date.toLocaleDateString("en-IN", {
          month: "short",
        }),
        count: monthInvoices.length,
        value: monthInvoices.reduce(
          (sum, invoice) =>
            sum + Number(invoice.total_amount ?? 0),
          0
        ),
      });
    }

    return months;
  })();

 const monthlyMetricValues = monthlyAnalytics.map((month) =>
  monthlyMetric === "count" ? month.count : month.value
);

const maxMonthlyMetric = Math.max(1, ...monthlyMetricValues);

  const vendorAnalytics = Object.values(
     filteredByDateInvoices.reduce((vendors, invoice) => {
      const name = invoice.vendor_name?.trim() || "Unknown vendor";

      if (!vendors[name]) {
        vendors[name] = { name, count: 0, value: 0 };
      }

      vendors[name].count += 1;
      vendors[name].value += Number(invoice.total_amount ?? 0);

      return vendors;
    }, {})
  )
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const maxVendorValue = Math.max(
    1,
    ...vendorAnalytics.map((vendor) => vendor.value)
  );

  const dashboardSearchResults = searchTerm.trim()
    ? invoices.filter((invoice) => {
        const query = searchTerm.trim().toLowerCase();

        return (
          (invoice.invoice_number || "").toLowerCase().includes(query) ||
          (invoice.vendor_name || "").toLowerCase().includes(query)
        );
      })
    : [];


  const stats = [
    {
      label: "Total invoices",
      value: loadingInvoices ? "…" : filteredByDateInvoices.length.toLocaleString("en-IN"),
      note: "Loaded from the API",
      icon: "▤",
    },
    {
      label: "Total invoice value",
      value: loadingInvoices ? "…" : formatMoney(totalInvoiceValue),
      note: "Sum of loaded invoice totals",
      icon: "₹",
    },
    {
      label: "Needs review",
      value: loadingInvoices ? "…" : String(filteredReviewCount).padStart(2, "0"),
      note: "Require attention",
      icon: "!",
    },
    {
      label: "Processed invoices",
      value: loadingInvoices ? "…" : String(processedCount).padStart(2, "0"),
      note: "Extraction results saved",
      icon: "✓",
    },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">IQ</div>
          <div>
            <h2>InvoiceIQ</h2>
            <p>Intelligent finance</p>
          </div>
        </div>

        <p className="nav-heading">WORKSPACE</p>

        <nav className="navigation">
          {[
            ["▦", "Dashboard"],
            ["▤", "All invoices"],
            ["↑", "Upload invoice"],
            ["▣", "Invoice-to-Excel"],
            ["✓", "Review queue"],
          ].map(([icon, label]) => (
            <button
              key={label}
              className={`nav-item ${activeNav === label ? "active" : ""}`}
              onClick={() => setActiveNav(label)}
              type="button"
            >
              <span className="nav-icon">{icon}</span>
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="security-icon">✓</div>
          <h3>Secure processing</h3>
          <p>Your invoices are stored in your application database.</p>
          <div className="connection-status">
            <span
              className="status-dot"
              style={{ background: apiError ? "#e66b76" : "#63d59b" }}
            />
            {loadingInvoices
              ? "Connecting..."
              : apiError
                ? "API unavailable"
                : "API connected"}
          </div>
        </div>

        <div className="profile">
          <div className="avatar">IQ</div>
          <div>
            <strong>InvoiceIQ Admin</strong>
            <span>Workspace admin</span>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">YOUR WORKSPACE</p>
            <h1>{activeNav}</h1>
            <p className="page-description">
              Monitor invoices and identify items that need attention.
            </p>
          </div>

          <span className="demo-badge">
            {loadingInvoices
              ? "CONNECTING"
              : apiError
                ? "API OFFLINE"
                : "LIVE DATA"}
          </span>
        </header>

        
{activeNav === "Dashboard" && (
  <section className="panel dashboard-search-panel">
    <h2>Find an invoice</h2>
    <p>Search your saved invoices by invoice number or vendor name.</p>

    <div className="dashboard-search-row">
      <input
        type="search"
        placeholder="e.g. invoice number or vendor name..."
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.target.value)}
        aria-label="Search saved invoices"
      />

      <button
        type="button"
        onClick={() => {
          setActiveNav("All invoices");
          setCurrentPage(1);
        }}
      >
        View results
      </button>
    </div>

    {searchTerm.trim() && (
      <div className="dashboard-recent-list">
        {dashboardSearchResults.length === 0 ? (
          <p className="dashboard-empty-state">
            No matching invoices found.
          </p>
        ) : (
          dashboardSearchResults.slice(0, 5).map((invoice) => (
            <div
              className="dashboard-recent-row"
              key={invoice.id}
              role="button"
              tabIndex={0}
              onClick={() => openInvoiceDetails(invoice.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openInvoiceDetails(invoice.id);
                }
              }}
            >
              <div>
                <div className="dashboard-recent-number">
                  {invoice.invoice_number || "Invoice number unavailable"}
                </div>
                <div className="dashboard-recent-vendor">
                  {invoice.vendor_name || "Unknown vendor"}
                </div>
              </div>

              <div className="dashboard-recent-amount">
                {formatMoney(invoice.total_amount)}
              </div>
            </div>
          ))
        )}
      </div>
    )}
  </section>
)}


  

  
{activeNav === "Dashboard" && (
  <section className="panel date-filter-panel">
    <div className="date-filter-header">
      <div className="date-filter-title">
        <div className="date-filter-icon">▦</div>
        <div>
          <h2>Analytics date range</h2>
          <p>Choose a period to explore your invoice performance.</p>
        </div>
      </div>

      <div className="date-filter-control">
        <label htmlFor="invoice-date-range">Reporting period</label>
        <select
          id="invoice-date-range"
          value={dateRange}
          onChange={(event) => setDateRange(event.target.value)}
        >
          <option value="all">All time</option>
          <option value="7days">Last 7 days</option>
          <option value="30days">Last 30 days</option>
          <option value="3months">Last 3 months</option>
          <option value="thisYear">This year</option>
          <option value="custom">Custom range</option>
        </select>
      </div>
    </div>

    {dateRange === "custom" && (
      <div className="date-filter-custom">
        <div className="date-filter-control">
          <label htmlFor="custom-start-date">Start date</label>
          <input
            id="custom-start-date"
            type="date"
            value={customStartDate}
            max={customEndDate || undefined}
            onChange={(event) =>
              setCustomStartDate(event.target.value)
            }
          />
        </div>

        <div className="date-filter-control">
          <label htmlFor="custom-end-date">End date</label>
          <input
            id="custom-end-date"
            type="date"
            value={customEndDate}
            min={customStartDate || undefined}
            onChange={(event) =>
              setCustomEndDate(event.target.value)
            }
          />
        </div>
      </div>
    )}
  </section>
)}


        
{activeNav === "Invoice-to-Excel" && (
  <section className="excel-workspace">
    <div className="excel-page-heading">
      <div>
        <span className="excel-eyebrow">DOCUMENT AUTOMATION</span>
        <h2>Invoice-to-Excel</h2>
        <p>
          Extract invoice data from multiple PDFs and export everything
          into a structured Excel workbook.
        </p>
      </div>

      <div className="excel-heading-icon">↗</div>
    </div>

    <div className="excel-feature-strip">
      <div className="excel-feature-item">
        <span className="excel-feature-icon">PDF</span>
        <div>
          <strong>Bulk PDF processing</strong>
          <p>Up to 20 files per batch</p>
        </div>
      </div>

      <div className="excel-feature-item">
        <span className="excel-feature-icon">✓</span>
        <div>
          <strong>Data validation</strong>
          <p>Identify exceptions and duplicates</p>
        </div>
      </div>

      <div className="excel-feature-item">
        <span className="excel-feature-icon">XLS</span>
        <div>
          <strong>Excel export</strong>
          <p>Three organized worksheets</p>
        </div>
      </div>
    </div>

    <div className="excel-upload-card">
      <div className="excel-section-heading">
        <div>
          <h3>Upload your invoices</h3>
          <p>Select the PDF invoices you want to convert.</p>
        </div>

        <span className="excel-limit-badge">MAX 20 FILES</span>
      </div>

      <label
        className={`excel-dropzone ${
          bulkUploading ? "excel-dropzone-disabled" : ""
        }`}
        htmlFor="excel-pdf-input"
      >
        <span className="excel-upload-icon">↑</span>

        <strong>Choose PDF invoices</strong>

        <span>
          Click here to browse files from your computer
        </span>

        <span className="excel-file-hint">
          PDF format · Maximum 10 MB per file · Up to 20 files
        </span>

        <input
          id="excel-pdf-input"
          className="excel-file-input"
          type="file"
          accept=".pdf,application/pdf"
          multiple
          disabled={bulkUploading}
          onChange={(event) => {
            const files = Array.from(event.target.files || []);

            const validFiles = files.filter(
              (file) =>
                file.type === "application/pdf" ||
                file.name.toLowerCase().endsWith(".pdf")
            );

            setBulkFiles(validFiles);
            setBulkResults(null);

            setBulkError(
              validFiles.length !== files.length
                ? "Only PDF files are allowed."
                : files.length > 20
                  ? "Select no more than 20 PDF files."
                  : validFiles.some(
                      (file) => file.size > 10 * 1024 * 1024
                    )
                    ? "Each PDF file must be 10 MB or smaller."
                    : ""
            );
          }}
        />
      </label>

      {bulkFiles.length > 0 && (
        <div className="excel-selected-files">
          <div className="excel-selected-heading">
            <div>
              <h4>Selected files</h4>
              <p>
                {bulkFiles.length} PDF
                {bulkFiles.length === 1 ? "" : "s"} selected
              </p>
            </div>

            <button
              type="button"
              className="excel-clear-button"
              disabled={bulkUploading}
              onClick={() => {
                setBulkFiles([]);
                setBulkError("");
                setBulkResults(null);

                const input = document.getElementById("excel-pdf-input");
                if (input) input.value = "";
              }}
            >
              Clear all
            </button>
          </div>

          <div className="excel-file-list">
            {bulkFiles.map((file, index) => (
              <div
                className="excel-file-row"
                key={`${file.name}-${index}`}
              >
                <span className="excel-file-icon">PDF</span>

                <div className="excel-file-details">
                  <strong title={file.name}>{file.name}</strong>
                  <span>
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </div>

                <button
                  type="button"
                  className="excel-remove-file"
                  aria-label={`Remove ${file.name}`}
                  disabled={bulkUploading}
                  onClick={() => {
                    setBulkFiles((previous) =>
                      previous.filter((_, fileIndex) => fileIndex !== index)
                    );
                    setBulkResults(null);
                    setBulkError("");
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {bulkError && (
        <p className="excel-error-message" role="alert">
          <strong>!</strong> {bulkError}
        </p>
      )}

      <div className="excel-upload-actions">
        <div className="excel-upload-note">
          <span>🔒</span>
          <span>Your files are processed by your InvoiceIQ backend.</span>
        </div>

        <button
          className="excel-primary-button"
          type="button"
          onClick={handleBulkUpload}
          disabled={
            bulkUploading ||
            bulkFiles.length === 0 ||
            bulkFiles.length > 20 ||
            bulkFiles.some(
              (file) => file.size > 10 * 1024 * 1024
            )
          }
        >
          {bulkUploading ? (
            <>
              <span className="excel-loading-dot" />
              Processing invoices...
            </>
          ) : (
            <>↑ Upload and extract</>
          )}
        </button>
      </div>
    </div>

    {bulkResults && (
      <>
        <div className="excel-results-heading">
          <div>
            <h3>Processing results</h3>
            <p>Review the extraction outcome for each uploaded PDF.</p>
          </div>

          <span className="excel-completed-badge">Batch completed</span>
        </div>

        <div className="excel-summary-grid">
          <div className="excel-summary-card">
            <span className="excel-summary-label">Total files</span>
            <strong>{bulkResults.total_files ?? bulkResults.results?.length ?? 0}</strong>
            <span className="excel-summary-caption">Files processed</span>
          </div>

          <div className="excel-summary-card excel-summary-success">
            <span className="excel-summary-label">Successful</span>
            <strong>{bulkResults.successful ?? 0}</strong>
            <span className="excel-summary-caption">Extracted successfully</span>
          </div>

          <div className="excel-summary-card excel-summary-review">
            <span className="excel-summary-label">Review required</span>
            <strong>{bulkResults.requires_review ?? 0}</strong>
            <span className="excel-summary-caption">Need your attention</span>
          </div>

          <div className="excel-summary-card excel-summary-failed">
            <span className="excel-summary-label">Exceptions</span>
            <strong>
              {(bulkResults.duplicates ?? 0) + (bulkResults.failed ?? 0)}
            </strong>
            <span className="excel-summary-caption">Duplicates and failures</span>
          </div>
        </div>

        <div className="excel-results-card">
          <div className="excel-section-heading">
            <div>
              <h3>Extracted invoice data</h3>
              <p>
                Check the extracted values before downloading the workbook.
              </p>
            </div>
          </div>

          <div className="table-wrapper excel-results-table-wrapper">
            <table className="excel-results-table">
              <thead>
                <tr>
                  <th>Source file</th>
                  <th>Invoice number</th>
                  <th>Vendor</th>
                  <th>Invoice date</th>
                  <th>Subtotal</th>
                  <th>Tax</th>
                  <th>Total amount</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {(bulkResults.results || []).map((item, index) => {
                  const status = String(item.status || "unknown")
                    .toLowerCase()
                    .replaceAll("-", "_")
                    .replaceAll(" ", "_");

                  const statusClass =
                    status === "success"
                      ? "success"
                      : status === "requires_review"
                        ? "review"
                        : status === "duplicate"
                          ? "duplicate"
                          : status === "failed"
                            ? "failed"
                            : "unknown";

                  const statusLabel =
                    status === "success"
                      ? "Successful"
                      : status === "requires_review"
                        ? "Review required"
                        : status === "duplicate"
                          ? "Duplicate"
                          : status === "failed"
                            ? "Failed"
                            : item.status || "Unknown";

                  return (
                    <tr key={`${item.filename}-${index}`}>
                      <td className="excel-source-file">
                        {item.filename || "—"}
                      </td>
                      <td>{item.invoice_number || "—"}</td>
                      <td>{item.vendor_name || "—"}</td>
                      <td>{formatDate(item.invoice_date)}</td>
                      <td>
                        {item.subtotal != null
                          ? formatMoney(item.subtotal)
                          : "—"}
                      </td>
                      <td>
                        {item.tax_amount != null
                          ? formatMoney(item.tax_amount)
                          : "—"}
                      </td>
                      <td className="excel-total-cell">
                        {item.total_amount != null
                          ? formatMoney(item.total_amount)
                          : "—"}
                      </td>
                      <td>
                        <span className={`excel-status-badge ${statusClass}`}>
                          {statusLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="excel-export-panel">
            <div className="excel-export-icon">XLS</div>

            <div className="excel-export-details">
              <h4>Your Excel workbook is ready</h4>
              <p>
                Includes Invoice Summary, Exceptions, and Processing Log
                worksheets.
              </p>
            </div>

            <button
              type="button"
              className="excel-download-button"
              onClick={downloadBulkExcel}
            >
              ↓ Download Excel
            </button>
          </div>
        </div>
      </>
    )}
  </section>
)}


        {apiError && (
          <div
            role="alert"
            style={{
              padding: "14px 16px",
              marginBottom: 20,
              borderRadius: 10,
              background: "#fff0f0",
              color: "#a83232",
              fontSize: 13,
            }}
          >
            {apiError}
          </div>
        )}

        {activeNav === "Dashboard" && (
  <section className="stats-grid">
          





          {stats.map((stat) => (
            <article className="stat-card" key={stat.label}>
              <div className="stat-top">
                <span>{stat.label}</span>
                <span className="stat-icon">{stat.icon}</span>
              </div>
              <h2>{stat.value}</h2>
              <p>{stat.note}</p>
            </article>
          ))}
        </section>)}

        
{activeNav === "Dashboard" && (
  <>
    <section className="dashboard-analytics-grid">
      <article className="dashboard-panel">
        <div className="dashboard-panel-heading">
          <div>
            
<div>
  <h2>Monthly invoice trends</h2>
  <p>
    {monthlyMetric === "count"
      ? "Invoice count for the last six calendar months"
      : "Total invoice value for the last six calendar months"}
  </p>
</div>

<div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
  <button
    type="button"
    onClick={() => setMonthlyMetric("count")}
    style={{
      padding: "7px 10px",
      borderRadius: 7,
      border: "1px solid #e5e7ef",
      background: monthlyMetric === "count" ? "#6c5bd3" : "#fff",
      color: monthlyMetric === "count" ? "#fff" : "#454b61",
      cursor: "pointer",
      fontSize: 11,
    }}
  >
    Count
  </button>

  <button
    type="button"
    onClick={() => setMonthlyMetric("value")}
    style={{
      padding: "7px 10px",
      borderRadius: 7,
      border: "1px solid #e5e7ef",
      background: monthlyMetric === "value" ? "#6c5bd3" : "#fff",
      color: monthlyMetric === "value" ? "#fff" : "#454b61",
      cursor: "pointer",
      fontSize: 11,
    }}
  >
    Value
  </button>
</div>

          </div>
        </div>

        {loadingInvoices ? (
          <div className="dashboard-chart-empty">
            Loading invoice trends...
          </div>
        ) : (
          <div className="dashboard-chart">
            {monthlyAnalytics.map((month) => (
              <div className="dashboard-chart-column" key={month.label}>
                <strong style={{ fontSize: 11, color: "#51468f" }}>
                  {monthlyMetric === "count"
                    ? month.count
                    : formatMoney(month.value)}
                </strong>

                <div
                  className="dashboard-chart-bar"
                  title={
                          monthlyMetric === "count"
                            ? `${month.count} invoices`
                            : formatMoney(month.value)
                        }
                  style={{
                    height: `${
                    monthlyMetricValues[monthlyAnalytics.indexOf(month)] === 0
                      ? 3
                      : Math.max(
                          12,
                          (monthlyMetricValues[monthlyAnalytics.indexOf(month)] /
                            maxMonthlyMetric) *
                            125
                        )
                  }px`,
                  }}
                />

                <span className="dashboard-chart-label">
                  {month.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </article>

      <article className="dashboard-panel">
        <div className="dashboard-panel-heading">
          <div>
            <h2>Invoice status breakdown</h2>
            <p>Distribution of saved invoice records</p>
          </div>
        </div>

        {loadingInvoices ? (
          <div className="dashboard-chart-empty">
            Loading invoice statuses...
          </div>
        ) : (
          <div className="dashboard-status-list">
            {[
              {
                label: "Processed",
                count: processedInvoices.length,
                className: "processed",
              },
              {
              label: "Review required",
              count: filteredReviewCount,
              className: "review",
              },
              {
                label: "Other statuses",
                count: otherInvoices.length,
                className: "other",
              },
            ].map((item) => (
              <div className="dashboard-status-item" key={item.label}>
                <div className="dashboard-status-label">
                  <span>{item.label}</span>
                  <strong>
                    {item.count} (
                    {invoices.length
                      ? Math.round(
                          (item.count / invoices.length) * 100
                        )
                      : 0}
                    %)
                  </strong>
                </div>

                <div className="dashboard-status-track">
                  <div
                    className={`dashboard-status-fill ${item.className}`}
                    style={{
                      width: `${
                        invoices.length
                          ? (item.count / invoices.length) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>

    <section className="dashboard-insight-grid">
      <article className="dashboard-insight-card">
        <span>Invoices requiring review</span>
        <strong>{loadingInvoices ? "…" : `${reviewPercentage}%`}</strong>
        <p>
          {filteredReviewCount} of {filteredByDateInvoices.length} invoices
          in this period need attention.
        </p>
      </article>

      <article className="dashboard-insight-card">
        <span>Average invoice value</span>
        <strong>
          {loadingInvoices
          ? "…"
          : formatMoney(
              filteredByDateInvoices.length
                ? totalInvoiceValue / filteredByDateInvoices.length
                : 0
            )}
        </strong>
        <p>Average total amount per saved invoice.</p>
      </article>

      <article className="dashboard-insight-card">
        <span>Unique vendors</span>
        <strong>
          
      {loadingInvoices
        ? "…"
            : new Set(
      filteredByDateInvoices
        .map((invoice) => invoice.vendor_name?.trim().toLowerCase())
        .filter(Boolean)
    ).size}

        </strong>
        <p>Distinct vendor names in the loaded records.</p>
      </article>
    </section>

    <section className="dashboard-analytics-grid">
      <article className="dashboard-panel">
        <div className="dashboard-panel-heading">
          <div>
            <h2>Top vendors by invoice value</h2>
            <p>Ranked by total amount across saved invoices</p>
          </div>
        </div>

        {vendorAnalytics.length === 0 ? (
          <div className="dashboard-empty-state">
            No vendor data available yet.
          </div>
        ) : (
          <div className="dashboard-vendor-list">
            {vendorAnalytics.map((vendor) => (
              <div className="dashboard-vendor-item" key={vendor.name}>
                <div className="dashboard-vendor-info">
                  <span className="dashboard-vendor-name">
                    {vendor.name}
                  </span>
                  <strong>{formatMoney(vendor.value)}</strong>
                </div>

                <div className="dashboard-vendor-track">
                  <div
                    className="dashboard-vendor-fill"
                    style={{
                      width: `${(vendor.value / maxVendorValue) * 100}%`,
                    }}
                  />
                </div>

                <span style={{ color: "#9297a9", fontSize: 10 }}>
                  {vendor.count} invoice(s)
                </span>
              </div>
            ))}
          </div>
        )}
      </article>

      <article className="dashboard-panel">
        <div className="dashboard-panel-heading">
          <div>
            <h2>Recent invoices</h2>
            <p>Latest invoice dates in your saved records</p>
          </div>

          <button
            className="text-button"
            type="button"
            onClick={() => setActiveNav("All invoices")}
          >
            View all →
          </button>
        </div>

        {loadingInvoices ? (
          <div className="dashboard-empty-state">Loading invoices...</div>
        ) : dashboardInvoices.length === 0 ? (
          <div className="dashboard-empty-state">
            No invoices saved yet.
          </div>
        ) : (
          <div className="dashboard-recent-list">
            {dashboardInvoices.slice(0, 5).map((invoice) => (
              <div
                className="dashboard-recent-row"
                key={invoice.id}
                role="button"
                tabIndex={0}
                onClick={() => openInvoiceDetails(invoice.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openInvoiceDetails(invoice.id);
                  }
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div className="dashboard-recent-number">
                    {invoice.invoice_number || "Invoice number unavailable"}
                  </div>
                  <div className="dashboard-recent-vendor">
                    {invoice.vendor_name || "Unknown vendor"} ·{" "}
                    {formatDate(invoice.invoice_date)}
                  </div>
                </div>

                <div className="dashboard-recent-amount">
                  {formatMoney(invoice.total_amount)}
                </div>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  </>
)}


{activeNav === "Review queue" && (
  <section className="review-summary-section">
    <div className="review-summary-heading">
      <div>
        <span className="review-summary-eyebrow">
          INVOICE CONTROL CENTER
        </span>
        <h2>Review overview</h2>
        <p>
          Identify incomplete invoices and resolve outstanding issues.
        </p>
      </div>

      <button
        type="button"
        className="review-refresh-button"
        onClick={() => {
          setStatusFilter("review");
          setSearchTerm("");
          setCurrentPage(1);
        }}
      >
        <span>↻</span> Focus on pending
      </button>
    </div>

    <div className="review-summary-grid">
      <article className="review-summary-card review-card-purple">
        <div className="review-card-top">
          <span>Pending review</span>
          <span className="review-card-icon">!</span>
        </div>
        <strong>
          {invoices.filter(
            (invoice) =>
              getInvoiceStatus(invoice).label === "Review required"
          ).length}
        </strong>
        <p>Invoices needing attention</p>
      </article>

      <article className="review-summary-card review-card-amber">
        <div className="review-card-top">
          <span>Missing information</span>
          <span className="review-card-icon">⌕</span>
        </div>
        <strong>
          {invoices.filter(
            (invoice) =>
              getInvoiceStatus(invoice).label === "Review required" &&
              (
                !invoice.vendor_name?.trim() ||
                !invoice.invoice_number?.trim() ||
                !invoice.invoice_date
              )
          ).length}
        </strong>
        <p>Missing vendor, number, or date</p>
      </article>

      <article className="review-summary-card review-card-blue">
        <div className="review-card-top">
          <span>Amount under review</span>
          <span className="review-card-icon">₹</span>
        </div>
        <strong>
          {formatMoney(
            invoices
              .filter(
                (invoice) =>
                  getInvoiceStatus(invoice).label === "Review required"
              )
              .reduce(
                (sum, invoice) =>
                  sum + Number(invoice.total_amount ?? 0),
                0
              )
          )}
        </strong>
        <p>Total value awaiting review</p>
      </article>

      <article className="review-summary-card review-card-green">
        <div className="review-card-top">
          <span>Other invoices</span>
          <span className="review-card-icon">✓</span>
        </div>
        <strong>
          {invoices.filter(
            (invoice) =>
              getInvoiceStatus(invoice).label !== "Review required"
          ).length}
        </strong>
        <p>Not currently flagged for review</p>
      </article>
    </div>
  </section>
)}


        {(activeNav === "All invoices" ||
  activeNav === "Review queue") && (
  <section className="content-grid">
          
          <article className="panel invoices-panel">
            <div className="panel-heading">
              <div>
                <h2>Recent invoices</h2>
                <p>Your latest saved invoice records</p>
              </div>
              <button
                className="text-button"
                type="button"
                onClick={() => setActiveNav("All invoices")}
              >
                View all →
              </button>
            </div>
            
          {(activeNav === "All invoices" ||
            activeNav === "Review queue") && (
            <div className="invoice-toolbar">
              <input
                className="invoice-search"
                type="search"
                placeholder="Search invoice number or vendor..."
                value={searchTerm}
                onChange={(event) => {
  setSearchTerm(event.target.value);
  setCurrentPage(1);
}}
                aria-label="Search invoices by invoice number or vendor"
              />

              <select
                className="invoice-status-filter"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                aria-label="Filter invoices by status"
              >
                <option value="all">All statuses</option>
                <option value="extracted">Extracted</option>
                <option value="review">Review required</option>
                <option value="other">Other statuses</option>
              </select>

              
{activeNav === "Review queue" && (
  <select
    className="invoice-status-filter review-issue-filter"
    value={issueFilter}
    onChange={(event) => {
      setIssueFilter(event.target.value);
      setCurrentPage(1);
    }}
    aria-label="Filter review invoices by issue"
  >
    <option value="all">All review issues</option>
    <option value="vendor">Missing vendor</option>
    <option value="number">Missing invoice number</option>
    <option value="date">Missing invoice date</option>
    <option value="amount">Amount mismatch</option>
  </select>
)}
 
              
            <div className="sort-controls">
              <select
                value={sortBy}
                onChange={(event) => {
                  setSortBy(event.target.value);
                  setCurrentPage(1);
                }}
                aria-label="Sort invoices by"
              >
                <option value="date">Sort by Date</option>
                <option value="vendor">Sort by Vendor</option>
                <option value="amount">Sort by Amount</option>
                <option value="status">Sort by Status</option>
              </select>

              <select
                value={sortOrder}
                onChange={(event) => {
                  setSortOrder(event.target.value);
                  setCurrentPage(1);
                }}
                aria-label="Sort order"
              >
                <option value="desc">
                  {sortBy === "date" ? "Newest first" : "Descending"}
                </option>
                <option value="asc">
                  {sortBy === "date" ? "Oldest first" : "Ascending"}
                </option>
              </select>
            </div>

            </div>
          )}

            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>INVOICE</th>
                    <th>VENDOR</th>
                    <th>DATE</th>
                    <th>AMOUNT</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingInvoices ? (
                    <tr>
                      <td colSpan={5}>Loading invoices…</td>
                    </tr>
                  ) : apiError ? (
                    <tr>
                      <td colSpan={5}>
                        Invoice records are currently unavailable.
                      </td>
                    </tr>
                  ) : displayedInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        No invoices found. Upload a PDF to get started.
                      </td>
                    </tr>
                  ) : (
                    paginatedInvoices.map((invoice) => {
                      const status = getInvoiceStatus(invoice);

                      return (
                        <tr
                            key={invoice.id}
                            className="invoice-row"
                            tabIndex={0}
                            onClick={() => openInvoiceDetails(invoice.id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                openInvoiceDetails(invoice.id);
                              }
                            }}
                          >
                          <td className="invoice-number">
                            {invoice.invoice_number}
                          </td>
                          <td>{invoice.vendor_name}</td>
                          <td>{formatDate(invoice.invoice_date)}</td>
                          <td className="amount">
                            {formatMoney(invoice.total_amount)}
                          </td>
                          <td>
                            <span
                              className={`status-badge ${status.className}`}
                            >
                              {status.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            
            <div className="table-footer pagination-footer">
              <span>
                {displayedInvoices.length === 0
                  ? "No matching invoices"
                  : `Showing ${
                      (safeCurrentPage - 1) * pageSize + 1
                    }–${Math.min(
                      safeCurrentPage * pageSize,
                      displayedInvoices.length
                    )} of ${displayedInvoices.length} invoices`}
              </span>

              
              <div className="page-size-control">
                <label htmlFor="page-size">Rows per page</label>
                <select
                  id="page-size"
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setCurrentPage(1);
                  }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>


              <div className="pagination-controls">
                <button
                  type="button"
                  disabled={safeCurrentPage === 1}
                  onClick={() => setCurrentPage(safeCurrentPage - 1)}
                >
                  Previous
                </button>

                <span>
                  Page {safeCurrentPage} of {totalPages}
                </span>

                <button
                  type="button"
                  disabled={safeCurrentPage === totalPages}
                  onClick={() => setCurrentPage(safeCurrentPage + 1)}
                >
                  Next
                </button>
              </div>
            </div>

          </article>
        
          <aside className="invoice-insights-panel">
            <div className="invoice-insights-heading">
              <span className="invoice-insights-icon">✦</span>
              <div>
                <h2>Invoice insights</h2>
                <p>A quick overview of your records</p>
              </div>
            </div>

            <div className="invoice-insight-metric">
              <span>Total invoices</span>
              <strong>{displayedInvoices.length}</strong>
            </div>

            <div className="invoice-insight-metric">
              <span>Total invoice value</span>
              <strong>
                {formatMoney(
                  displayedInvoices.reduce(
                    (sum, invoice) =>
                      sum + Number(invoice.total_amount ?? 0),
                    0
                  )
                )}
              </strong>
            </div>

            <div className="invoice-insight-metric">
              <span>Average invoice value</span>
              <strong>
                {formatMoney(
                  displayedInvoices.length
                    ? displayedInvoices.reduce(
                        (sum, invoice) =>
                          sum + Number(invoice.total_amount ?? 0),
                        0
                      ) / displayedInvoices.length
                    : 0
                )}
              </strong>
            </div>

            <div className="invoice-insights-divider" />

            <h3>Processing overview</h3>

            {[
              {
                label: "Extracted",
                count: displayedInvoices.filter(
                  (invoice) => getInvoiceStatus(invoice).label === "Extracted"
                ).length,
                color: "extracted",
              },
              {
                label: "Review required",
                count: displayedInvoices.filter(
                  (invoice) =>
                    getInvoiceStatus(invoice).label === "Review required"
                ).length,
                color: "review",
              },
              {
                label: "Other statuses",
                count: displayedInvoices.filter(
                  (invoice) =>
                    !["Extracted", "Review required"].includes(
                      getInvoiceStatus(invoice).label
                    )
                ).length,
                color: "other",
              },
            ].map((item) => (
              <div className="invoice-insight-status" key={item.label}>
                <div className="invoice-insight-status-label">
                  <span>{item.label}</span>
                  <strong>{item.count}</strong>
                </div>

                <div className="invoice-insight-track">
                  <div
                    className={`invoice-insight-fill ${item.color}`}
                    style={{
                      width: `${
                        displayedInvoices.length
                          ? (item.count / displayedInvoices.length) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            ))}

            <div className="invoice-insights-divider" />

            <h3>Quick actions</h3>

            <button
              className="invoice-insight-action"
              type="button"
              onClick={() => setActiveNav("Upload invoice")}
            >
              <span>↑</span>
              Upload an invoice
              <span className="invoice-insight-arrow">→</span>
            </button>

            <button
              className="invoice-insight-action"
              type="button"
              onClick={() => setActiveNav("Invoice-to-Excel")}
            >
              <span>▦</span>
              Export to Excel
              <span className="invoice-insight-arrow">→</span>
            </button>

            <button
              className="invoice-insight-action"
              type="button"
              onClick={() => {
                setActiveNav("Review queue");
                setStatusFilter("review");
                setCurrentPage(1);
              }}
            >
              <span>✓</span>
              Review queue
              <span className="invoice-insight-arrow">→</span>
            </button>
          </aside>

          
        </section>)}
        

{activeNav === "Upload invoice" && (
  <section className="upload-workspace">
    <article className="panel upload-panel">
      <div className="upload-workspace-heading">
        <div>
          <span className="upload-eyebrow">SINGLE INVOICE</span>
          <h2>Upload an invoice</h2>
          <p className="upload-description">
            Extract invoice details automatically and save them to your workspace.
          </p>
        </div>
        <div className="upload-icon">↑</div>
      </div>

      <label
        className={`upload-dropzone ${isDraggingFile ? "dragging" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <span className="upload-dropzone-icon">↑</span>
        <strong>Choose a PDF invoice</strong>
        <span>Click below to browse files from your computer</span>
        <span className="upload-file-hint">PDF files only · Maximum 10 MB</span>

        <input
          type="file"
          accept=".pdf,application/pdf"
          onChange={handleFileChange}
        />

        <span className="upload-browse-button">Browse files</span>
      </label>

      {selectedFile && (
        <div className="selected-file">
          <span className="file-check">✓</span>
          <span className="selected-file-details">
            <strong>{selectedFile.name}</strong>
            <span>
              {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
            </span>
          </span>
        </div>
      )}

      <button
        className="upload-button upload-submit"
        type="button"
        onClick={handleUpload}
        disabled={!selectedFile || uploading}
      >
        {uploading ? "Processing invoice..." : "Upload and extract"}
      </button>

      {uploadMessage && (
        <p className="upload-feedback success" role="status">
          {uploadMessage}
        </p>
      )}

      {uploadError && (
        <p className="upload-feedback error" role="alert">
          {uploadError}
        </p>
      )}

            {lastExtractionResult?.invoice && (
        <div className="extraction-result-card">
          <div className="extraction-result-heading">
            <div>
              <h3>Extraction Results</h3>
              <p>Review the details extracted from your invoice.</p>
            </div>

            <span
              className={`extraction-result-status ${
                lastExtractionResult.validation?.requires_review
                  ? "needs-review"
                  : "review-complete"
              }`}
            >
              {lastExtractionResult.validation?.requires_review
                ? "Needs review"
                : "Extracted"}
            </span>
          </div>

          <div className="extraction-result-grid">
            <div className="extraction-result-field">
              <span>Vendor</span>
              <strong>
                {lastExtractionResult.invoice.vendor_name || "Not found"}
              </strong>
            </div>

            <div className="extraction-result-field">
              <span>Invoice number</span>
              <strong>
                {lastExtractionResult.invoice.invoice_number || "Not found"}
              </strong>
            </div>

            <div className="extraction-result-field">
              <span>Invoice date</span>
              <strong>
                {lastExtractionResult.invoice.invoice_date || "Not found"}
              </strong>
            </div>

            <div className="extraction-result-field">
              <span>Subtotal</span>
              <strong>
                {formatMoney(
                  lastExtractionResult.invoice.subtotal ?? 0
                )}
              </strong>
            </div>

            <div className="extraction-result-field">
              <span>Tax amount</span>
              <strong>
                {formatMoney(
                  lastExtractionResult.invoice.tax_amount ??
                    lastExtractionResult.invoice.tax ?? 0
                )}
              </strong>
            </div>

            <div className="extraction-result-field">
              <span>Total amount</span>
              <strong>
                {formatMoney(
                  lastExtractionResult.invoice.total_amount ?? 0
                )}
              </strong>
            </div>
            
          <div className="extraction-result-field">
            <span>Total amount</span>
            <strong>
              {formatMoney(
                lastExtractionResult.invoice.total_amount ?? 0
              )}
            </strong>
          </div>
        </div>

        {/* Invoice validation panel */}
        <div className="invoice-validation-panel">
          <div className="invoice-validation-heading">
            <h4>Validation checks</h4>

            <span
              className={`validation-summary ${
                missingValidationFields.length > 0 || hasAmountMismatch
                  ? "validation-warning"
                  : "validation-success"
              }`}
            >
              {missingValidationFields.length > 0 || hasAmountMismatch
                ? "Needs attention"
                : "Checks passed"}
            </span>
          </div>

          {missingValidationFields.length > 0 && (
            <div className="validation-message validation-message-warning">
              <strong>Missing or invalid fields</strong>
              <p>
                {missingValidationFields
                  .map((check) => check.label)
                  .join(", ")}
              </p>
            </div>
          )}

          {hasAmountMismatch && (
            <div className="validation-message validation-message-warning">
              <strong>Amount mismatch detected</strong>
              <p>
                Subtotal plus tax does not match the invoice total.
                Please verify the amounts against the original PDF.
              </p>
            </div>
          )}

          {missingValidationFields.length === 0 && !hasAmountMismatch && (
            <div className="validation-message validation-message-success">
              <strong>Required fields and amount check passed</strong>
              <p>
                The required fields are present and the available amounts
                reconcile.
              </p>
            </div>
          )}

          <div className="validation-check-list">
            {validationChecks.map((check) => (
              <div className="validation-check-item" key={check.label}>
                <span
                  className={`validation-check-icon ${
                    check.valid ? "check-valid" : "check-invalid"
                  }`}
                >
                  {check.valid ? "✓" : "!"}
                </span>
                <span>{check.label}</span>
                <strong>
                  {check.valid ? "Present" : "Check required"}
                </strong>
              </div>
            ))}

            <div className="validation-check-item">
              <span
                className={`validation-check-icon ${
                  hasAmountsForValidation && !hasAmountMismatch
                    ? "check-valid"
                    : "check-invalid"
                }`}
              >
                {hasAmountsForValidation
                  ? hasAmountMismatch
                    ? "!"
                    : "✓"
                  : "—"}
              </span>
              <span>Subtotal + tax = total</span>
              <strong>
                {!hasAmountsForValidation
                  ? "Not verified"
                  : hasAmountMismatch
                    ? "Mismatch"
                    : "Matched"}
              </strong>
            </div>
          </div>
        </div>
      </div>
    )}

         

      <div className="upload-note">
        <span>ⓘ</span>
        <p>
          InvoiceIQ extracts available invoice fields, checks for potential
          issues, and saves the processing result.
        </p>
      </div>
    </article>

    <aside className="upload-side-panel">
      <article className="panel upload-side-card">
        <div className="upload-side-heading">
          <span className="upload-side-icon">▦</span>
          <div>
            <h2>Process multiple invoices</h2>
            <p>Save time when handling batches of PDFs.</p>
          </div>
        </div>

        <ul className="upload-feature-list">
          <li>Process multiple PDF invoices</li>
          <li>Identify duplicates and extraction issues</li>
          <li>Review individual processing results</li>
        </ul>

        <button
          className="upload-secondary-action"
          type="button"
          onClick={() => setActiveNav("Invoice-to-Excel")}
        >
          Open Invoice-to-Excel
          <span>→</span>
        </button>
      </article>

      <article className="panel upload-side-card">
        <div className="upload-side-heading">
          <span className="upload-side-icon">✓</span>
          <div>
            <h2>Processing workflow</h2>
            <p>What happens to your invoice?</p>
          </div>
        </div>

        <div className="upload-workflow-step">
          <span>1</span>
          <div>
            <strong>Upload PDF</strong>
            <p>Select your invoice file.</p>
          </div>
        </div>

        <div className="upload-workflow-step">
          <span>2</span>
          <div>
            <strong>Extract details</strong>
            <p>Read invoice fields and validate the results.</p>
          </div>
        </div>

        <div className="upload-workflow-step">
          <span>3</span>
          <div>
            <strong>Review and save</strong>
            <p>Inspect any issues that need attention.</p>
          </div>
        </div>
      </article>

      <article className="upload-requirements-card">
        <strong>Before you upload</strong>
        <p>Use a readable PDF invoice with selectable text where possible.</p>
        <p>Maximum file size: 10 MB per PDF.</p>
        <p>Scanned PDFs may require OCR support.</p>
      </article>
    </aside>
  </section>
)}



        
        {selectedInvoiceId !== null && (
          <div className="modal-backdrop" onClick={closeInvoiceDetails}>
            <section
              className="invoice-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="invoice-detail-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-header">
                <div>
                  <p className="eyebrow">INVOICE DETAILS</p>
                  <h2 id="invoice-detail-title">
                    {selectedInvoice?.invoice_number || "Invoice"}
                  </h2>
                </div>

                <button
                  className="modal-close"
                  type="button"
                  onClick={closeInvoiceDetails}
                  aria-label="Close invoice details"
                >
                  ×
                </button>
              </div>

              {detailLoading ? (
                <p>Loading invoice details…</p>
              ) : detailError ? (
                <p className="upload-feedback error" role="alert">
                  {detailError}
                </p>
              ) : selectedInvoice ? (
                <>
                  {selectedInvoice.requires_review && (
                    <div className="review-notice">
                      This invoice requires manual review.
                    </div>
                  )}

                  
                  <div className="detail-grid review-edit-grid">
                    <label>
                      Vendor name
                      <input
                        type="text"
                        value={correctionForm.vendor_name}
                        onChange={(event) =>
                          setCorrectionForm({
                            ...correctionForm,
                            vendor_name: event.target.value,
                          })
                        }
                        required
                      />
                    </label>

                    <label>
                      Invoice number
                      <input
                        type="text"
                        value={correctionForm.invoice_number}
                        onChange={(event) =>
                          setCorrectionForm({
                            ...correctionForm,
                            invoice_number: event.target.value,
                          })
                        }
                        required
                      />
                    </label>

                    <label>
                      Invoice date
                      <input
                        type="date"
                        value={correctionForm.invoice_date}
                        onChange={(event) =>
                          setCorrectionForm({
                            ...correctionForm,
                            invoice_date: event.target.value,
                          })
                        }
                      />
                    </label>

                    <label>
                      Due date
                      <input
                        type="date"
                        value={correctionForm.due_date}
                        onChange={(event) =>
                          setCorrectionForm({
                            ...correctionForm,
                            due_date: event.target.value,
                          })
                        }
                      />
                    </label>

                    <label>
                      Purchase order number
                      <input
                        type="text"
                        value={correctionForm.purchase_order_number}
                        onChange={(event) =>
                          setCorrectionForm({
                            ...correctionForm,
                            purchase_order_number: event.target.value,
                          })
                        }
                      />
                    </label>

                    <label>
                      Currency
                      <input
                        type="text"
                        value={selectedInvoice.currency || "INR"}
                        readOnly
                      />
                    </label>

                    <label>
                      Subtotal
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={correctionForm.subtotal}
                        onChange={(event) =>
                          setCorrectionForm({
                            ...correctionForm,
                            subtotal: event.target.value,
                          })
                        }
                      />
                    </label>

                    <label>
                      Tax amount
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={correctionForm.tax_amount}
                        onChange={(event) =>
                          setCorrectionForm({
                            ...correctionForm,
                            tax_amount: event.target.value,
                          })
                        }
                      />
                    </label>

                    <label>
                      Total amount
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={correctionForm.total_amount}
                        onChange={(event) =>
                          setCorrectionForm({
                            ...correctionForm,
                            total_amount: event.target.value,
                          })
                        }
                      />
                    </label>

                    <div>
                      <span>Current status</span>
                      <strong>{selectedInvoice.status || "—"}</strong>
                    </div>

                    <div>
                      <span>Source file</span>
                      <strong>{selectedInvoice.source_filename || "—"}</strong>
                    </div>
                  </div>

                  <div className="review-notes">
                    <h3>Review notes</h3>
                    <p>
                      {selectedInvoice.exception_reason ||
                        "No validation warnings recorded for this invoice."}
                    </p>
                  </div>

                  
                <div className="correction-feedback">
                  {correctionError && (
                    <p className="upload-feedback error" role="alert">
                      {correctionError}
                    </p>
                  )}

                  {correctionMessage && (
                    <p className="correction-success" role="status">
                      {correctionMessage}
                    </p>
                  )}
                </div>

                
                <div className="correction-actions">
                  <button
                    type="button"
                    className="correction-save-button"
                    onClick={saveInvoiceCorrections}
                    disabled={correctionSaving || deletingInvoice || detailLoading}
                  >
                    {correctionSaving ? "Saving corrections..." : "Save corrections"}
                  </button>

                  <button
                    type="button"
                    className="correction-delete-button"
                    onClick={handleDeleteInvoice}
                    disabled={correctionSaving || deletingInvoice || detailLoading}
                  >
                    {deletingInvoice ? "Deleting invoice..." : "Delete invoice"}
                  </button>
                </div>


                </>
              ) : null}
            </section>
          </div>
        )}


        <footer className="page-footer">
          <span>InvoiceIQ · Intelligent invoice processing</span>
          <span>Version 0.2.0</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
