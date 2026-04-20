const tab1 = document.getElementById("tab1");
const tab2 = document.getElementById("tab2");
const btn1 = document.getElementById("tabBtn1");
const btn2 = document.getElementById("tabBtn2");

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
  document.getElementById("merchant").value = "kickstart";
  document.getElementById("currency").value = "AED";
  ["merchantError", "payerNameError", "refError", "amountError"].forEach(
    hideError,
  );
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
    const merchant = document.getElementById("merchant");
    const payerName = document.getElementById("payerName");
    const reference = document.getElementById("invoiceRef");
    const amountInput = document.getElementById("amount");
    const currency = document.getElementById("currency").value;
    const amount = parseFloat(amountInput.value);

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

    // if (!reference.value.trim()) {
    //   showError("refError", "Invoice reference is required");
    //   valid = false;
    // } else {
    //   hideError("refError");
    // }
    const referenceValue = reference.value.trim();
    const referencePattern = /^KSGQ\d+$/;

    if (!referenceValue) {
      showError("refError", "Invoice reference is required");
      valid = false;
    } else if (!referencePattern.test(referenceValue)) {
      showError(
        "refError",
        "Reference must start with KSGQ followed by digits (e.g., KSGQ0001)",
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

    try {
      const response = await fetch("/generate-quick-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
    }
  });

window.copyLink = copyLink;
window.resetForm = resetForm;
window.closeErrorDialog = closeErrorDialog;
