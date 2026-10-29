const SALES_KEY = "silver-pos-sales";
const PRODUCTS_KEY = "silver-pos-products";
const money = value => `\u20B1${Number(value || 0).toFixed(2)}`;
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
let cart = [];
let page = 0;
let activeSaleId = null;
let visibleProducts = [];
let activeQrPaymentId = null;
let qrPaymentPollTimer = null;
const pageSize = 8;
const el = id => document.getElementById(id);
const read = key => { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; } };
const saveSales = sales => localStorage.setItem(SALES_KEY, JSON.stringify(sales));
let dialogAction = null;
let voidConfirmAction = null;
function showDialog(message, { title = "Notice", confirm = false, onConfirm = null } = {}) {
  el("posDialogTitle").textContent = title;
  el("posDialogMessage").textContent = message;
  el("posDialogCancel").classList.toggle("hidden", !confirm);
  el("posDialogConfirm").textContent = confirm ? "Confirm" : "OK";
  dialogAction = onConfirm;
  el("posDialog").classList.remove("hidden");
  el("posDialog").classList.add("flex");
}
function closeDialog(accepted = false) {
  el("posDialog").classList.add("hidden");
  el("posDialog").classList.remove("flex");
  const action = dialogAction;
  dialogAction = null;
  if (accepted && action) action();
}
function showVoidConfirmation(title, message, action) {
  el("voidConfirmTitle").textContent = title;
  el("voidConfirmMessage").textContent = message;
  voidConfirmAction = action;
  el("voidConfirmModal").classList.remove("hidden");
  el("voidConfirmModal").classList.add("flex");
}
function closeVoidConfirmation(accepted = false) {
  el("voidConfirmModal").classList.add("hidden");
  el("voidConfirmModal").classList.remove("flex");
  const action = voidConfirmAction;
  voidConfirmAction = null;
  if (accepted && action) action();
}
function openVoidModal(saleId) {
  activeSaleId = saleId;
  const sale = read(SALES_KEY).find(item => item.id === saleId);
  if (!sale) return;
  el("voidTitle").textContent = `Void Transaction � ${sale.id}`;
  renderVoidItems(sale);
  el("voidModal").classList.remove("hidden");
  el("voidModal").classList.add("flex");
}
function renderVoidItems(sale) {
  const items = sale.items || [];
  el("void-entire-button").classList.toggle("hidden", !items.length || sale.status === "Voided");
  el("voidItems").innerHTML = items.length ? items.map((item, index) => `<div class="flex items-center justify-between gap-4 rounded-xl bg-slate-50 p-4"><div><p class="font-black text-gray-800">${escapeHtml(item.name)}</p><p class="text-sm text-gray-500">Qty: ${item.quantity} � ${money(item.price)}</p></div><button class="rounded-lg bg-red-500 px-4 py-2 text-xs font-black text-white hover:bg-red-600" data-void-item="${index}">Void Item</button></div>`).join("") : `<p class="py-8 text-center text-sm text-gray-500">No products remain in this transaction.</p>`;
}
function closeVoidModal() {
  el("voidModal").classList.add("hidden");
  el("voidModal").classList.remove("flex");
  activeSaleId = null;
}
function voidSaleItem(saleId, index) {
  const sales = read(SALES_KEY);
  const sale = sales.find(item => item.id === saleId);
  if (!sale || !sale.items?.[index]) return;
  const [removed] = sale.items.splice(index, 1);
  const originalSubtotal = Number(sale.subtotal || 0);
  const discountRate = originalSubtotal ? Number(sale.discount || 0) / originalSubtotal : 0;
  const amount = Number(removed.price) * Number(removed.quantity);
  sale.subtotal = Math.max(0, originalSubtotal - amount);
  sale.discount = sale.subtotal * discountRate;
  sale.total = Math.max(0, sale.subtotal - sale.discount);
  if (!sale.items.length) sale.status = "Voided";
  saveSales(sales);
  renderSales();
  closeVoidModal();
}
function voidEntireTransaction() {
  const saleId = activeSaleId;
  if (!saleId) return;
  showVoidConfirmation("Confirm Transaction Void", `Are you sure you want to void the entire transaction ${saleId}?`, () => {
    const sales = read(SALES_KEY);
    const sale = sales.find(item => item.id === saleId);
    if (!sale) return;
    sale.status = "Voided";
    sale.subtotal = 0;
    sale.discount = 0;
    sale.total = 0;
    saveSales(sales);
    closeVoidModal();
    renderSales();
    showDialog(`${saleId} was voided.`, { title: "Transaction Voided" });
  });
}

function renderSales() {
  const all = read(SALES_KEY).sort((a, b) => new Date(b.date) - new Date(a.date));
  const date = el("sales-date").value;
  const query = el("sales-search").value.trim().toLowerCase();
  const productMatches = query ? read(PRODUCTS_KEY).filter(product => [product.name, product.productName, product.barcode, product.sku, product.code, product.category].some(value => String(value || "").toLowerCase().includes(query))) : [];
  if (productMatches.length) {
    renderProductResults(productMatches, query);
    return;
  }
  el("results-title").textContent = "All Transactions";
  el("results-columns").innerHTML = `<th class="p-4">Sales ID</th><th class="p-4">Date</th><th class="p-4">Customer</th><th class="p-4 text-right">Total</th><th class="p-4">Status</th><th class="p-4 text-right">Action</th>`;
  const daily = all.filter(sale => String(sale.date).slice(0, 10) === (date || today()));
  const todaySales = all.filter(sale => String(sale.date).slice(0, 10) === today() && sale.status !== "Voided").reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  el("today-total").textContent = `TODAY: ${money(todaySales)}`;
  const filtered = all.filter(sale => (!date || String(sale.date).slice(0, 10) === date) &&
    [sale.id, sale.customer, sale.status, ...(sale.items || []).flatMap(item => [item.name, item.barcode])]
      .some(value => String(value || "").toLowerCase().includes(query)));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  page = Math.min(page, pages - 1);
  const visible = filtered.slice(page * pageSize, (page + 1) * pageSize);
  el("sales-rows").innerHTML = visible.length ? visible.map(sale => {
    const displayStatus = sale.status === "Voided" ? "Voided" : (sale.paymentStatus || "Completed");
    const voidAction = sale.status === "Voided" ? "" : `<button class="rounded-xl bg-red-50 px-4 py-2 text-[10px] font-black uppercase text-red-500 hover:bg-red-100" data-void-sale="${escapeHtml(sale.id)}">Void</button>`;
    return `<tr class="border-t border-slate-100 hover:bg-slate-50"><td class="p-4 font-bold">${escapeHtml(sale.id)}</td><td class="p-4">${new Date(sale.date).toLocaleString([], { month: "short", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}</td><td class="p-4">${escapeHtml(sale.customer || "Walk-in Customer")}</td><td class="p-4 text-right font-bold">${money(sale.total)}</td><td class="p-4"><span class="font-black uppercase ${sale.status === "Voided" ? "text-red-500" : "text-emerald-600"}">${escapeHtml(displayStatus)}</span></td><td class="p-4 text-right"><div class="flex justify-end gap-2"><button class="rounded-xl bg-slate-100 px-4 py-2 text-[10px] font-black uppercase text-slate-600 hover:bg-slate-200" data-view-sale="${escapeHtml(sale.id)}">View</button>${voidAction}</div></td></tr>`;
  }).join("") : `<tr><td colspan="6" class="p-12 text-center text-gray-400">${query || date ? "No sales match your search." : "No completed sales yet."}</td></tr>`;
  const selectedTotal = filtered.filter(sale => sale.status !== "Voided").reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  el("sales-summary").textContent = date ? `Showing transactions for ${new Date(`${date}T00:00:00`).toLocaleDateString([], { month: "short", day: "2-digit", year: "numeric" })}.` : `${filtered.length} transaction${filtered.length === 1 ? "" : "s"}`;
  el("pagination-label").textContent = filtered.length ? `Showing ${page * pageSize + 1}�${Math.min((page + 1) * pageSize, filtered.length)} of ${filtered.length}` : "No transactions";
  el("previous-page").disabled = page === 0;
  el("next-page").disabled = page >= pages - 1;
  el("pagination-label").textContent = filtered.length ? `SELECTED DAY SALES: ${money(selectedTotal)} � TOTAL SALES TODAY: ${money(todaySales)} � Page ${page + 1} of ${pages} � ${filtered.length} transaction${filtered.length === 1 ? "" : "s"}` : `No transactions � TOTAL SALES TODAY: ${money(todaySales)}`;
}
function viewSale(saleId) {
  const sale = read(SALES_KEY).find(item => item.id === saleId);
  if (!sale) return;
  const items = (sale.items || []).map(item => `- ${item.name} x${item.quantity} - ${money(Number(item.price) * Number(item.quantity))}`);
  const details = [`Transaction: ${sale.id}`, `Date: ${new Date(sale.date).toLocaleString()}`, `Customer: ${sale.customer || "Walk-in Customer"}`, "Items:", ...(items.length ? items : ["- No items"]), `Subtotal: ${money(sale.subtotal)}`, `Discount: ${money(sale.discount)}`, `Total: ${money(sale.total)}`, `Payment Method: ${sale.paymentMethod || "Cash"}`, `Reference Number: ${sale.paymentReference || "-"}`, `Payment Status: ${sale.paymentStatus || (sale.status === "Voided" ? "Voided" : "Paid")}`, `Transaction Status: ${sale.status || "Completed"}`];
  showDialog(details.join("\n"), { title: "Transaction Details" });
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }
function renderProductResults(products, query) {
  visibleProducts = products;
  el("results-title").textContent = "Product Search Results";
  el("sales-summary").textContent = `Matching products for "${query}"`;
  el("results-columns").innerHTML = `<th class="p-4">Barcode</th><th class="p-4">Product</th><th class="p-4">Category</th><th class="p-4 text-right">Stock</th><th class="p-4 text-right">Price</th><th class="p-4 text-right">Action</th>`;
  el("sales-rows").innerHTML = products.map((product, index) => {
    const barcode = product.barcode ?? product.sku ?? product.code ?? "";
    const name = product.name ?? product.productName ?? "Unnamed product";
    const category = product.category ?? "�";
    const rawStock = product.stock ?? product.quantity;
    const stock = rawStock == null ? null : Number(rawStock);
    const price = Number(product.price ?? product.unitPrice ?? 0);
    return `<tr class="border-t border-slate-100 hover:bg-slate-50"><td class="p-4 font-mono text-xs">${escapeHtml(barcode)}</td><td class="p-4 font-black">${escapeHtml(name)}</td><td class="p-4 text-gray-500">${escapeHtml(category)}</td><td class="p-4 text-right font-bold">${stock == null ? "�" : stock}</td><td class="p-4 text-right font-black">${money(price)}</td><td class="p-4 text-right"><button class="rounded-lg bg-emerald-800 px-4 py-2 text-xs font-black uppercase text-white disabled:cursor-not-allowed disabled:opacity-40" data-add-product="${index}" ${stock !== null && stock <= 0 ? "disabled" : ""}>Add</button></td></tr>`;
  }).join("");
  el("pagination-label").textContent = `${products.length} matching product${products.length === 1 ? "" : "s"}`;
  el("previous-page").disabled = true;
  el("next-page").disabled = true;
}
function addProduct(product) {
  const barcode = String(product.barcode ?? product.sku ?? product.code ?? product.name ?? product.productName);
  const name = product.name ?? product.productName ?? "Unnamed product";
  const price = Number(product.price ?? product.unitPrice ?? 0);
  const rawStock = product.stock ?? product.quantity;
  const stock = rawStock == null ? null : Number(rawStock);
  const existing = cart.find(item => item.barcode === barcode);
  if (stock !== null && (existing?.quantity || 0) >= stock) return showDialog(`${name} is out of stock.`, { title: "Stock limit reached" });
  if (existing) existing.quantity++;
  else cart.push({ barcode, name, price, quantity: 1 });
  renderCart();
}
function renderCart() {
  el("item-count").textContent = `${cart.reduce((sum, item) => sum + item.quantity, 0)} Items added`;
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  el("subtotal").textContent = money(subtotal);
  el("total-amount").textContent = money(subtotal);
  el("cart-items").innerHTML = cart.length ? cart.map(item => `<div class="flex justify-between gap-3 border-b py-3"><div><p class="font-bold">${escapeHtml(item.name)}</p><p class="text-xs text-gray-400">${money(item.price)} � ${item.quantity}</p></div><div class="flex items-center gap-2"><button class="px-2" data-qty="${escapeHtml(item.barcode)}" data-delta="-1">-</button><button class="px-2" data-qty="${escapeHtml(item.barcode)}" data-delta="1">+</button></div></div>`).join("") : `<div class="h-full flex flex-col items-center justify-center text-gray-300 space-y-4"><i class="fa-solid fa-cart-shopping text-6xl"></i><p class="text-[10px] font-black uppercase tracking-widest">Select items to begin</p></div>`;
  document.querySelectorAll("[data-qty]").forEach(button => button.addEventListener("click", () => adjustItem(button.dataset.qty, Number(button.dataset.delta))));
}
function adjustItem(barcode, delta) {
  const item = cart.find(row => row.barcode === barcode);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity < 1) cart = cart.filter(row => row !== item);
  renderCart();
}
function addByBarcode(code) {
  const product = read(PRODUCTS_KEY).find(item => String(item.barcode).toLowerCase() === code.toLowerCase() || String(item.name).toLowerCase() === code.toLowerCase());
  if (!product) return false;
  const existing = cart.find(item => String(item.barcode) === String(product.barcode));
  if (existing) existing.quantity++;
  else cart.push({ barcode: String(product.barcode), name: product.name, price: Number(product.price), quantity: 1 });
  renderCart();
  return true;
}
function clearCart() {
  if (!cart.length) return;
  showDialog("Clear all items from the cart?", { title: "Clear cart", confirm: true, onConfirm: () => { cart = []; renderCart(); } });
}
function handleCheckout() {
  if (!cart.length) {
    return showDialog("Scan a product barcode to add items before payment.");
  }

  const subtotal = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  el("pay-subtotal").textContent = money(subtotal);
  el("paymentMethod").value = "cash";
  el("paymentAmount").value = "";

  el("paymentAmount").oninput = updatePayment;
  el("discountType").onchange = updatePayment;

  updatePaymentMethodFields();
  el("paymentModal").classList.remove("hidden");
  updatePayment();
}
function updatePaymentMethodFields() {
  const isQrPayment = el("paymentMethod").value === "qrph";

  el("cashPaymentFields").classList.toggle("hidden", isQrPayment);
  el("changeDisplay").classList.toggle("hidden", isQrPayment);
  el("walletPaymentFields").classList.toggle("hidden", !isQrPayment);

  el("paymentAmount").disabled = isQrPayment;

  el("paymentSubmitButton").classList.toggle("hidden", isQrPayment);
  el("paymentSubmitButton").textContent = "Done";

  if (isQrPayment) {
    el("walletQrImage").classList.add("hidden");
    el("qrPaymentPlaceholder").classList.remove("hidden");
    el("walletQrStatus").textContent = "Generate a QR to begin";
  }
}
function updatePayment() {
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discount = el("discountType").value === "none" ? 0 : subtotal * 0.2;
  const total = Math.max(0, subtotal - discount);
  el("pay-discount").textContent = money(discount);
  el("pay-total").textContent = money(total);
  el("pay-change").textContent = money(Math.max(0, Number(el("paymentAmount").value || 0) - total));
}
function closePaymentModal() { el("paymentModal").classList.add("hidden"); }
function submitPayment() {
  const subtotal = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const discount =
    el("discountType").value === "none" ? 0 : subtotal * 0.2;

  const total = Math.max(0, subtotal - discount);
  const method = el("paymentMethod").value;

  // QR payments must be verified separately.
  if (method === "qrph") {
    return generateWalletQr();
  }

  const paid = Number(el("paymentAmount").value);

  if (!Number.isFinite(paid) || paid < total) {
    return showDialog("Amount paid must cover the total due.", {
      title: "Payment incomplete"
    });
  }

  completePayment(subtotal, discount, total, "Cash", "");
}
function completePayment(subtotal, discount, total, paymentMethod, paymentReference) {
  const sales = read(SALES_KEY);
  const nextId = sales.reduce((max, sale) => Math.max(max, Number(String(sale.id).match(/\d+$/)?.[0] || 0)), 0) + 1;
  const id = `#SALES-${String(nextId).padStart(5, "0")}`;
  sales.push({ id, date: new Date().toISOString(), customer: "Walk-in Customer", items: cart, subtotal, discount, total, status: "Completed", paymentMethod, paymentReference, paymentStatus: "Paid" });
  saveSales(sales);
  el("sales-search").value = "";
  page = 0;
  cart = [];
  renderCart();
  closePaymentModal();
  renderSales();
  showDialog(`${id}\nTotal: ${money(total)}\nPayment recorded successfully.`, { title: "Transaction Completed", onConfirm: () => window.location.reload() });
}

async function generateWalletQr() {
  if (qrPaymentPollTimer) {
    clearInterval(qrPaymentPollTimer);
    qrPaymentPollTimer = null;
  }

  const subtotal = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const discount =
    el("discountType").value === "none" ? 0 : subtotal * 0.2;

  const total = Math.max(0, subtotal - discount);

  if (total < 1) {
    return showDialog("The QR payment amount must be at least ₱1.00.");
  }

  const button = el("generateWalletQrButton");
  button.disabled = true;
  button.textContent = "Generating QR...";

  el("walletQrStatus").textContent = "Creating payment request...";
  el("qrPaymentAmount").textContent = money(total);
  el("walletQrImage").classList.add("hidden");
  el("qrPaymentPlaceholder").classList.remove("hidden");

  try {
    // This endpoint must be implemented by your XianFire backend.
    const response = await fetch("/api/payments/qrph", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount: Math.round(total * 100),
        currency: "PHP",
        description: "SILVER-ERP POS checkout"
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Could not create QR payment.");
    }

    if (!result.paymentIntentId || !result.qrImageUrl) {
      throw new Error("The server did not return the payment ID and QR image.");
    }

    activeQrPaymentId = result.paymentIntentId;

    el("walletQrImage").src = result.qrImageUrl;
    el("walletQrImage").classList.remove("hidden");
    el("qrPaymentPlaceholder").classList.add("hidden");
    el("walletQrStatus").textContent =
      "Pending — waiting for customer payment";

    // Check payment status through your backend.
    qrPaymentPollTimer = setInterval(
      () => checkQrPaymentStatus(subtotal, discount, total),
      3000
    );

  } catch (error) {
    el("walletQrStatus").textContent = "QR generation failed";
    showDialog(error.message, { title: "Payment QR Error" });

  } finally {
    button.disabled = false;
    button.innerHTML =
      '<i class="fa-solid fa-qrcode mr-2"></i> Generate Payment QR';
  }
}

async function checkQrPaymentStatus(subtotal, discount, total) {
  if (!activeQrPaymentId) return;

  try {
    const response = await fetch(
      `/api/payments/qrph/${encodeURIComponent(activeQrPaymentId)}`
    );

    if (!response.ok) return;

    const result = await response.json();

    if (result.status === "succeeded" || result.status === "paid") {
      clearInterval(qrPaymentPollTimer);
      qrPaymentPollTimer = null;

      const paymentId = activeQrPaymentId;
      activeQrPaymentId = null;

      el("walletQrStatus").textContent = "Payment verified!";

      completePayment(
        subtotal,
        discount,
        total,
        "QR Ph",
        paymentId
      );
    } else if (
      result.status === "failed" ||
      result.status === "expired"
    ) {
      clearInterval(qrPaymentPollTimer);
      qrPaymentPollTimer = null;

      el("walletQrStatus").textContent =
        `Payment ${result.status}. Generate a new QR to retry.`;
    }
  } catch (error) {
    console.error("Unable to check QR payment status:", error);
  }
}

el("paymentMethod").addEventListener("change", updatePaymentMethodFields);
el("posDialogConfirm").addEventListener("click", () => closeDialog(true));
el("posDialogCancel").addEventListener("click", () => closeDialog(false));
el("posDialog").addEventListener("click", event => { if (event.target === el("posDialog")) closeDialog(false); });
el("voidModal").addEventListener("click", event => { if (event.target === el("voidModal")) closeVoidModal(); });
el("voidItems").addEventListener("click", event => {
  const button = event.target.closest("[data-void-item]");
  if (!button) return;
  const sale = read(SALES_KEY).find(item => item.id === activeSaleId);
  const item = sale?.items?.[Number(button.dataset.voidItem)];
  if (!item) return;
  const saleId = activeSaleId;
  showVoidConfirmation("Confirm Item Void", `Are you sure you want to void ${item.name}?`, () => voidSaleItem(saleId, Number(button.dataset.voidItem)));
});
el("voidConfirmAccept").addEventListener("click", () => closeVoidConfirmation(true));
el("voidConfirmCancel").addEventListener("click", () => closeVoidConfirmation(false));
el("voidConfirmModal").addEventListener("click", event => { if (event.target === el("voidConfirmModal")) closeVoidConfirmation(false); });
el("sales-rows").addEventListener("click", event => {
  const viewButton = event.target.closest("[data-view-sale]");
  if (viewButton) return viewSale(viewButton.dataset.viewSale);
  const addButton = event.target.closest("[data-add-product]");
  if (addButton) return addProduct(visibleProducts[Number(addButton.dataset.addProduct)]);
  const voidButton = event.target.closest("[data-void-sale]");
  if (voidButton) openVoidModal(voidButton.dataset.voidSale);
});
document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  if (!el("voidConfirmModal").classList.contains("hidden")) closeVoidConfirmation(false);
  else if (!el("posDialog").classList.contains("hidden")) closeDialog(false);
  else if (!el("voidModal").classList.contains("hidden")) closeVoidModal();
});
el("sales-search").addEventListener("input", () => { page = 0; renderSales(); });
el("sales-search").addEventListener("keydown", event => { if (event.key === "Enter") { const code = el("sales-search").value.trim(); if (addByBarcode(code)) { el("sales-search").value = ""; renderSales(); } } });
el("sales-date").addEventListener("change", () => { page = 0; renderSales(); });
el("previous-page").addEventListener("click", () => { page--; renderSales(); });
el("next-page").addEventListener("click", () => { page++; renderSales(); });
el("sales-date").value = today();
renderSales();
renderCart();
