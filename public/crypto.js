const tab1 = document.getElementById("tab1");
const tab2 = document.getElementById("tab2");
const btn1 = document.getElementById("tabBtn1");
const btn2 = document.getElementById("tabBtn2");

// Organization -> merchant mapping (merchant is auto-selected and read-only)
const ORGANIZATIONS = {
  decisivezone: { merchant: "kickstart", prefix: "KSGQ", theme: "" },
  firmz: { merchant: "firmz", prefix: "FZQ", theme: "theme-firmz" },
};
const DEFAULT_PREFIX = "KSGQ";

const organizationSelect = document.getElementById("organization");
const merchantSelect = document.getElementById("merchant");
const referenceInput = document.getElementById("invoiceRef");

function getReferencePrefix() {
  const config = ORGANIZATIONS[organizationSelect.value];
  return config ? config.prefix : DEFAULT_PREFIX;
}

function applyOrganization() {
  const config = ORGANIZATIONS[organizationSelect.value];

  merchantSelect.value = config ? config.merchant : "";
  referenceInput.placeholder = `${getReferencePrefix()}0001`;

  document.body.classList.remove("theme-firmz");
  if (config && config.theme) {
    document.body.classList.add(config.theme);
  }

  if (config) {
    hideError("organizationError");
    hideError("merchantError");
  }
}

organizationSelect.addEventListener("change", applyOrganization);

function switchTab(tabNumber) {
  if (tabNumber === 1) {
    tab1.classList.remove("hidden");
    tab2.classList.add("hidden");
    btn1.classList.add("active");
    btn2.classList.remove("active");
    return;
  }

  if (!btn2.disabled) {
    tab1.classList.add("hidden");
    tab2.classList.remove("hidden");
    btn1.classList.remove("active");
    btn2.classList.add("active");
  }
}

function showError(id, message) {
  const element = document.getElementById(id);
  element.textContent = message;
  element.classList.add("error-show");
  clearTimeout(element.dataset.timeout);
  element.dataset.timeout = setTimeout(() => {
    element.classList.remove("error-show");
  }, 3000);
}

function hideError(id) {
  document.getElementById(id).classList.remove("error-show");
}

function showErrorDialog(message) {
  document.getElementById("errorMessage").textContent = message;
  document.getElementById("errorDialog").classList.remove("hidden");
}

function closeErrorDialog() {
  document.getElementById("errorDialog").classList.add("hidden");
}

async function copyLink() {
  const input = document.getElementById("generatedLink");
  const message = document.getElementById("copiedMsg");

  try {
    await navigator.clipboard.writeText(input.value);
  } catch (error) {
    input.select();
    document.execCommand("copy");
  }

  message.style.display = "block";
  setTimeout(() => {
    message.style.display = "none";
  }, 2000);
}

function resetForm() {
  document.getElementById("paymentRequestForm").reset();
  document.getElementById("currency").value = "AED";
  applyOrganization();
  [
    "organizationError",
    "merchantError",
    "payerNameError",
    "refError",
    "amountError",
  ].forEach(hideError);
  document.getElementById("generatedLink").value = "";
  btn2.disabled = true;
  switchTab(1);
}

async function parseJsonResponse(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return { error: text };
  }
}

function getErrorMessage(result) {
  if (!result) {
    return "Failed to generate quick invoice.";
  }

  const parts = [];

  if (result.error) {
    parts.push(result.error);
  }

  if (result.code) {
    parts.push(`Code: ${result.code}`);
  }

  if (result.detail && result.detail !== result.error) {
    parts.push(result.detail);
  }

  return parts.join(" | ") || "Failed to generate quick invoice.";
}

document
  .getElementById("paymentRequestForm")
  .addEventListener("submit", async (event) => {
    event.preventDefault();

    let valid = true;
    const merchant = merchantSelect;
    const payerName = document.getElementById("payerName");
    const reference = document.getElementById("invoiceRef");
    const amountInput = document.getElementById("amount");
    const currency = document.getElementById("currency").value;
    const amount = parseFloat(amountInput.value);

    if (organizationSelect.value === "") {
      showError("organizationError", "Please select your organization");
      valid = false;
    } else {
      hideError("organizationError");
    }

    if (merchant.value === "") {
      showError("merchantError", "Please select a merchant");
      valid = false;
    } else {
      hideError("merchantError");
    }

    if (!payerName.value.trim()) {
      showError("payerNameError", "Payer name is required");
      valid = false;
    } else {
      hideError("payerNameError");
    }

    const referenceValue = reference.value.trim();
    const prefix = getReferencePrefix();
    const referencePattern = new RegExp(`^${prefix}\\d+$`);

    if (!referenceValue) {
      showError("refError", "Invoice reference is required");
      valid = false;
    } else if (!referencePattern.test(referenceValue)) {
      showError(
        "refError",
        `Reference must start with ${prefix} followed by digits (e.g., ${prefix}0001)`,
      );
      valid = false;
    } else {
      hideError("refError");
    }

    if (Number.isNaN(amount) || amount < 1) {
      showError("amountError", "Amount must be at least 1.00");
      valid = false;
    } else {
      hideError("amountError");
    }

    if (!valid) {
      return;
    }

    // Prevent double-clicks from creating duplicate invoices
    const submitBtn = event.target.querySelector(".submit-btn");
    if (submitBtn.disabled) {
      return;
    }
    const originalBtnText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "Generating...";

    try {
      const response = await fetch("/generate-quick-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant: merchant.value,
          payerName: payerName.value,
          reference: reference.value,
          amount,
          currency,
        }),
      });

      const result = await parseJsonResponse(response);

      if (response.ok && result.hostedUrl) {
        document.getElementById("generatedLink").value = result.hostedUrl;
        btn2.disabled = false;
        switchTab(2);
        return;
      }

      showErrorDialog(getErrorMessage(result));
    } catch (error) {
      showErrorDialog(error.message || "Unexpected error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
    }
  });

window.copyLink = copyLink;
window.resetForm = resetForm;
window.closeErrorDialog = closeErrorDialog;