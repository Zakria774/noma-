
import React, { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "noma-preview-v7";

type Screen = "login" | "home" | "sales" | "purchases" | "purchase_review" | "settings";
type InvoiceStatus = "draft" | "sent" | "paid";
type PurchaseStatus = "draft" | "booked";
type ThemeMode = "current" | "soft" | "mint" | "midnight";

type Invoice = {
  id: string;
  customer: string;
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  total: string;
  line: string;
  note: string;
  status: InvoiceStatus;
  createdAt: string;
};

type Purchase = {
  id: string;
  description: string;
  date: string;
  category: string;
  tax: string;
  amount: string;
  fileName: string;
  status: PurchaseStatus;
  createdAt: string;
};

type InvoiceDraft = Omit<Invoice, "id" | "createdAt">;
type PurchaseDraft = Omit<Purchase, "id" | "createdAt">;

type Settings = {
  businessName: string;
  currency: string;
  defaultTax: string;
  defaultInvoiceNote: string;
  autoDueDays: number;
  themeMode: ThemeMode;
};

type Notice = { id: number; message: string };
type ChartPoint = { label: string; revenue: number; purchases: number; net: number };
type AiInsight = { id: string; title: string; detail: string; tone: "neutral" | "good" | "warn" };

type ParsedAssistantAction =
  | { type: "create_invoice"; customer?: string; amount?: string; dueDate?: string; line?: string }
  | { type: "show_profit" }
  | { type: "show_unpaid" }
  | { type: "show_expenses" }
  | { type: "go_to"; screen: Exclude<Screen, "login"> }
  | { type: "mark_paid" }
  | { type: "create_purchase"; description?: string; amount?: string; category?: string }
  | { type: "fallback" };

type PersistedState = {
  invoices: Invoice[];
  purchases: Purchase[];
  settings: Settings;
  isLoggedIn: boolean;
  loginEmail: string;
};

const EMPTY_INVOICE: InvoiceDraft = {
  customer: "",
  invoiceNo: "",
  invoiceDate: "",
  dueDate: "",
  total: "",
  line: "",
  note: "",
  status: "draft",
};

const EMPTY_PURCHASE: PurchaseDraft = {
  description: "",
  date: "",
  category: "",
  tax: "",
  amount: "",
  fileName: "",
  status: "draft",
};

const DEFAULT_SETTINGS: Settings = {
  businessName: "Noma Studio",
  currency: "kr",
  defaultTax: "25%",
  defaultInvoiceNote: "Thank you for your business.",
  autoDueDays: 14,
  themeMode: "current",
};

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(base: string, days: number) {
  const d = new Date(base || todayString());
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function createId() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function parseMoney(value: string) {
  const cleaned = value.replace(/[^\d.,-]/g, "").replace(/,/g, ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number, currency = "kr") {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${currency}`;
}

function monthKey(value: string) {
  return (value || todayString()).slice(0, 7);
}

function palette(theme: ThemeMode) {
  if (theme === "midnight") {
    return {
      bg: "#09111d",
      surface: "#101b2e",
      soft: "#0d1728",
      sidebar: "#0c1626",
      assistant: "#0d1728",
      border: "rgba(70,90,120,.45)",
      text: "#eef4ff",
      muted: "#9cb0d0",
      accent: "#5b8cff",
      accentText: "#ffffff",
      positive: "#34d399",
      danger: "#f87171",
      warning: "#fbbf24",
      shadow: "0 16px 40px rgba(0,0,0,.28)",
    };
  }
  if (theme === "soft") {
    return {
      bg: "#fff8f3",
      surface: "#ffffff",
      soft: "#fff1e8",
      sidebar: "#fffaf6",
      assistant: "#fffaf6",
      border: "rgba(245,210,191,.95)",
      text: "#3c2d28",
      muted: "#8a746d",
      accent: "#df8d72",
      accentText: "#ffffff",
      positive: "#4aa57b",
      danger: "#d96b6b",
      warning: "#dd9f48",
      shadow: "0 12px 30px rgba(177,122,95,.10)",
    };
  }
  if (theme === "mint") {
    return {
      bg: "#f3fff9",
      surface: "#ffffff",
      soft: "#ebfff5",
      sidebar: "#f8fffb",
      assistant: "#f8fffb",
      border: "rgba(183,233,213,.95)",
      text: "#16352b",
      muted: "#5a7b71",
      accent: "#2f8f72",
      accentText: "#ffffff",
      positive: "#2f8f72",
      danger: "#de6d5a",
      warning: "#c9972f",
      shadow: "0 12px 30px rgba(47,143,114,.10)",
    };
  }
  return {
    bg: "#f6f8fb",
    surface: "#ffffff",
    soft: "#f8fafc",
    sidebar: "rgba(255,255,255,.92)",
    assistant: "#fcfdfc",
    border: "rgba(226,232,240,.95)",
    text: "#0f172a",
    muted: "#64748b",
    accent: "#123d6b",
    accentText: "#ffffff",
    positive: "#059669",
    danger: "#dc2626",
    warning: "#d97706",
    shadow: "0 10px 30px rgba(15,23,42,.05)",
  };
}

function cardStyle(theme: ThemeMode): React.CSSProperties {
  const p = palette(theme);
  return {
    background: p.surface,
    border: `1px solid ${p.border}`,
    borderRadius: 24,
    boxShadow: p.shadow,
  };
}

function inputStyle(theme: ThemeMode): React.CSSProperties {
  const p = palette(theme);
  return {
    width: "100%",
    borderRadius: 16,
    border: `1px solid ${p.border}`,
    padding: "12px 14px",
    background: p.soft,
    color: p.text,
    outline: "none",
    boxSizing: "border-box",
  };
}

function buttonStyle(kind: "primary" | "secondary" | "danger", theme: ThemeMode): React.CSSProperties {
  const p = palette(theme);
  if (kind === "primary") {
    return { borderRadius: 16, padding: "12px 16px", border: "none", background: p.accent, color: p.accentText, fontWeight: 700, cursor: "pointer" };
  }
  if (kind === "danger") {
    return { borderRadius: 16, padding: "12px 16px", border: "1px solid rgba(239,68,68,.28)", background: "transparent", color: p.danger, fontWeight: 700, cursor: "pointer" };
  }
  return { borderRadius: 16, padding: "12px 16px", border: `1px solid ${p.border}`, background: p.surface, color: p.text, fontWeight: 700, cursor: "pointer" };
}

function extractAmount(prompt: string) {
  const match = prompt.match(/(\d+[\d,.]*)/);
  return match ? match[1] : undefined;
}

function extractCustomer(prompt: string) {
  const forMatch = prompt.match(/for\s+([a-zA-Z][a-zA-Z\s]{1,30})/i);
  if (forMatch) return forMatch[1].trim();
  const clientMatch = prompt.match(/client\s+([a-zA-Z][a-zA-Z\s]{1,30})/i);
  if (clientMatch) return clientMatch[1].trim();
  return undefined;
}

function extractLine(prompt: string) {
  const lineMatch = prompt.match(/for\s+[a-zA-Z][a-zA-Z\s]{1,30}\s+(?:for|about)?\s*([a-zA-Z][a-zA-Z\s]{2,40})/i);
  return lineMatch ? lineMatch[1].trim() : undefined;
}

function extractDueDate(prompt: string) {
  const lower = prompt.toLowerCase();
  if (lower.includes("tomorrow")) return addDays(todayString(), 1);
  if (lower.includes("next week")) return addDays(todayString(), 7);
  const daysMatch = lower.match(/in\s+(\d+)\s+days?/);
  if (daysMatch) return addDays(todayString(), Number(daysMatch[1]));
  return undefined;
}

function parseAssistantIntent(prompt: string): ParsedAssistantAction {
  const lower = prompt.toLowerCase().trim();

  if ((lower.includes("create invoice") || lower.includes("make invoice") || lower.includes("new invoice")) && !lower.includes("unpaid")) {
    return {
      type: "create_invoice",
      customer: extractCustomer(prompt),
      amount: extractAmount(prompt),
      dueDate: extractDueDate(prompt),
      line: extractLine(prompt),
    };
  }
  if (lower.includes("profit") || lower.includes("net result") || lower.includes("how much did i make")) {
    return { type: "show_profit" };
  }
  if (lower.includes("unpaid") || lower.includes("haven't paid") || lower.includes("have not paid") || lower.includes("not paid")) {
    return { type: "show_unpaid" };
  }
  if (lower.includes("expenses") || lower.includes("costs") || lower.includes("money out")) {
    return { type: "show_expenses" };
  }
  if (lower.includes("mark") && lower.includes("paid")) {
    return { type: "mark_paid" };
  }
  if (lower.includes("purchase") || lower.includes("expense") || lower.includes("add expense")) {
    return {
      type: "create_purchase",
      description: /fuel|petrol|internet|hosting|travel|office/i.test(lower)
        ? prompt.match(/fuel|petrol|internet|hosting|travel|office/i)?.[0] ?? "Business expense"
        : "Business expense",
      amount: extractAmount(prompt),
      category: /travel|fuel|petrol/i.test(lower)
        ? "Travel"
        : /internet|hosting|software/i.test(lower)
          ? "Software"
          : "General",
    };
  }
  if (lower.includes("home") || lower.includes("dashboard")) return { type: "go_to", screen: "home" };
  if (lower.includes("sales")) return { type: "go_to", screen: "sales" };
  if (lower.includes("purchases")) return { type: "go_to", screen: "purchases" };
  if (lower.includes("settings") || lower.includes("theme")) return { type: "go_to", screen: "settings" };
  return { type: "fallback" };
}

function MiniChart({ data, theme }: { data: ChartPoint[]; theme: ThemeMode }) {
  const p = palette(theme);
  const maxValue = Math.max(1, ...data.flatMap((d: ChartPoint) => [d.revenue, d.purchases, Math.abs(d.net)]));

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 20, fontSize: 13, color: p.muted, flexWrap: "wrap" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, background: p.accent, borderRadius: 2, display: "inline-block" }} /> Income</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, background: p.positive, borderRadius: 2, display: "inline-block" }} /> Expenses</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, background: p.text, borderRadius: 2, display: "inline-block" }} /> Net</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(data.length, 1)}, 1fr)`, gap: 16, alignItems: "end", height: 220 }}>
        {data.map((item) => {
          const revenueH = (item.revenue / maxValue) * 160;
          const purchaseH = (item.purchases / maxValue) * 160;
          const netH = (Math.abs(item.net) / maxValue) * 160;
          return (
            <div key={item.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "end", gap: 6, height: 180 }}>
                <div title={`Income: ${item.revenue}`} style={{ width: 16, height: Math.max(revenueH, 6), background: p.accent, borderRadius: 6 }} />
                <div title={`Expenses: ${item.purchases}`} style={{ width: 16, height: Math.max(purchaseH, 6), background: p.positive, borderRadius: 6 }} />
                <div title={`Net: ${item.net}`} style={{ width: 16, height: Math.max(netH, 6), background: item.net < 0 ? p.danger : p.text, borderRadius: 6 }} />
              </div>
              <div style={{ fontSize: 11, color: p.muted }}>{Math.round(item.net)}</div>
              <div style={{ fontSize: 12, color: p.muted }}>{item.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function NomaPreviewFixed() {
  const [screen, setScreen] = useState<Screen>("login");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantResponse, setAssistantResponse] = useState("Try natural commands like: Create invoice for Ali 5000 due next week.");
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraft>(EMPTY_INVOICE);
  const [purchaseDraft, setPurchaseDraft] = useState<PurchaseDraft>(EMPTY_PURCHASE);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
  const [invoicePreviewOpen, setInvoicePreviewOpen] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [purchaseSearch, setPurchaseSearch] = useState("");
  const uploadRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      setInvoices(Array.isArray(parsed.invoices) ? parsed.invoices : []);
      setPurchases(Array.isArray(parsed.purchases) ? parsed.purchases : []);
      setSettings(parsed.settings ? { ...DEFAULT_SETTINGS, ...parsed.settings } : DEFAULT_SETTINGS);
      setIsLoggedIn(Boolean(parsed.isLoggedIn));
      setLoginEmail(typeof parsed.loginEmail === "string" ? parsed.loginEmail : "");
      if (parsed.isLoggedIn) setScreen("home");
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const state: PersistedState = {
      invoices,
      purchases,
      settings,
      isLoggedIn,
      loginEmail,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [invoices, purchases, settings, isLoggedIn, loginEmail]);

  const theme = settings.themeMode;
  const p = palette(theme);

  function pushNotice(message: string) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setNotices((prev) => [...prev, { id, message }]);
    window.setTimeout(() => {
      setNotices((prev) => prev.filter((n) => n.id !== id));
    }, 2400);
  }

  function handleLogin() {
    if (!loginEmail.trim() || !loginPassword.trim()) {
      pushNotice("Enter your email and password.");
      return;
    }
    setIsLoggedIn(true);
    setScreen("home");
    setLoginPassword("");
    setAssistantResponse(`Welcome back, ${loginEmail}.`);
    pushNotice("Logged in successfully.");
  }

  function handleLogout() {
    setIsLoggedIn(false);
    setScreen("login");
    setLoginPassword("");
    setAssistantResponse("You have been logged out.");
    pushNotice("Logged out.");
  }

  function newInvoice(prefill?: Partial<InvoiceDraft>) {
    const date = todayString();
    setScreen("sales");
    setEditingInvoiceId(null);
    setInvoiceDraft({
      ...EMPTY_INVOICE,
      invoiceNo: `INV-${String(invoices.length + 1).padStart(4, "0")}`,
      invoiceDate: date,
      dueDate: addDays(date, settings.autoDueDays),
      note: settings.defaultInvoiceNote,
      ...prefill,
    });
    pushNotice("New invoice ready.");
  }

  function newPurchase(prefill?: Partial<PurchaseDraft>) {
    setScreen("purchases");
    setEditingPurchaseId(null);
    setPurchaseDraft({ ...EMPTY_PURCHASE, date: todayString(), tax: settings.defaultTax, ...prefill });
    pushNotice("New purchase ready.");
  }

  function saveInvoice(status?: InvoiceStatus) {
    if (!invoiceDraft.customer || !invoiceDraft.invoiceNo || !invoiceDraft.invoiceDate) {
      pushNotice("Fill customer, invoice number, and date first.");
      return false;
    }
    const now = new Date().toISOString();
    const payload: Invoice = {
      id: editingInvoiceId || createId(),
      createdAt: editingInvoiceId ? invoices.find((i) => i.id === editingInvoiceId)?.createdAt || now : now,
      ...invoiceDraft,
      status: status || invoiceDraft.status,
    };
    setInvoices((prev) => (prev.some((i) => i.id === payload.id) ? prev.map((i) => (i.id === payload.id ? payload : i)) : [payload, ...prev]));
    setEditingInvoiceId(payload.id);
    setInvoiceDraft((prev) => ({ ...prev, status: payload.status }));
    return true;
  }

  function savePurchase(status?: PurchaseStatus) {
    if (!purchaseDraft.description || !purchaseDraft.date) {
      pushNotice("Fill description and date first.");
      return false;
    }
    const now = new Date().toISOString();
    const payload: Purchase = {
      id: editingPurchaseId || createId(),
      createdAt: editingPurchaseId ? purchases.find((q) => q.id === editingPurchaseId)?.createdAt || now : now,
      ...purchaseDraft,
      status: status || purchaseDraft.status,
    };
    setPurchases((prev) => (prev.some((q) => q.id === payload.id) ? prev.map((q) => (q.id === payload.id ? payload : q)) : [payload, ...prev]));
    setEditingPurchaseId(payload.id);
    setPurchaseDraft((prev) => ({ ...prev, status: payload.status }));
    return true;
  }

  function deleteInvoice() {
    if (!editingInvoiceId) return;
    setInvoices((prev) => prev.filter((i) => i.id !== editingInvoiceId));
    setEditingInvoiceId(null);
    setInvoiceDraft(EMPTY_INVOICE);
    pushNotice("Invoice deleted.");
  }

  function deletePurchase() {
    if (!editingPurchaseId) return;
    setPurchases((prev) => prev.filter((q) => q.id !== editingPurchaseId));
    setEditingPurchaseId(null);
    setPurchaseDraft(EMPTY_PURCHASE);
    pushNotice("Purchase deleted.");
  }

  function handleUpload(file?: File) {
    if (!file) return;
    setScreen("purchases");
    setPurchaseDraft((prev) => ({
      ...prev,
      fileName: file.name,
      description: prev.description || file.name.replace(/\.[^.]+$/, ""),
      date: prev.date || todayString(),
      category: prev.category || "Uncategorized",
      tax: prev.tax || settings.defaultTax,
    }));
    setAssistantResponse(`Attached ${file.name} and prepared the purchase draft.`);
    pushNotice(`${file.name} uploaded.`);
  }

  const revenueNumber = useMemo(
    () => invoices.filter((i) => i.status === "sent" || i.status === "paid").reduce((sum, i) => sum + parseMoney(i.total), 0),
    [invoices]
  );
  const bookedPurchasesNumber = useMemo(
    () => purchases.filter((q) => q.status === "booked").reduce((sum, q) => sum + parseMoney(q.amount), 0),
    [purchases]
  );
  const netNumber = revenueNumber - bookedPurchasesNumber;
  const unpaidInvoices = useMemo(() => invoices.filter((i) => i.status === "sent"), [invoices]);
  const unpaidCount = unpaidInvoices.length;
  const draftPurchasesCount = useMemo(() => purchases.filter((q) => q.status === "draft").length, [purchases]);

  const revenueValue = formatMoney(revenueNumber, settings.currency);
  const purchasesValue = formatMoney(bookedPurchasesNumber, settings.currency);
  const netValue = formatMoney(netNumber, settings.currency);

  const chartData: ChartPoint[] = useMemo(() => {
    const map = new Map<string, { revenue: number; purchases: number }>();
    invoices.forEach((i) => {
      const key = monthKey(i.invoiceDate || i.createdAt);
      const current = map.get(key) || { revenue: 0, purchases: 0 };
      if (i.status === "sent" || i.status === "paid") current.revenue += parseMoney(i.total);
      map.set(key, current);
    });
    purchases.forEach((q) => {
      const key = monthKey(q.date || q.createdAt);
      const current = map.get(key) || { revenue: 0, purchases: 0 };
      if (q.status === "booked") current.purchases += parseMoney(q.amount);
      map.set(key, current);
    });
    const rows = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    if (rows.length === 0) return [{ label: monthKey(todayString()), revenue: 0, purchases: 0, net: 0 }];
    return rows.map(([label, values]) => ({ label, revenue: values.revenue, purchases: values.purchases, net: values.revenue - values.purchases }));
  }, [invoices, purchases]);

  const aiInsights: AiInsight[] = useMemo(() => {
    const list: AiInsight[] = [];
    if (unpaidCount > 0) {
      list.push({
        id: "unpaid",
        title: `${unpaidCount} unpaid invoice${unpaidCount > 1 ? "s" : ""}`,
        detail: `Follow up with ${unpaidInvoices.slice(0, 2).map((i) => i.customer).join(", ")}${unpaidInvoices.length > 2 ? " and others" : ""}.`,
        tone: "warn",
      });
    }
    if (draftPurchasesCount > 0) {
      list.push({
        id: "draft-purchases",
        title: `${draftPurchasesCount} draft purchase${draftPurchasesCount > 1 ? "s" : ""}`,
        detail: "These are not affecting your dashboard until booked.",
        tone: "neutral",
      });
    }
    if (netNumber > 0) {
      list.push({
        id: "positive-net",
        title: "Positive net result",
        detail: `You are up ${netValue} based on sent/paid invoices and booked purchases.`,
        tone: "good",
      });
    } else if (netNumber < 0) {
      list.push({
        id: "negative-net",
        title: "Net result is negative",
        detail: `You are down ${netValue}. Consider following up on unpaid invoices.`,
        tone: "warn",
      });
    }
    const categoryTotals = new Map<string, number>();
    purchases.filter((q) => q.status === "booked").forEach((q) => {
      const key = q.category || "General";
      categoryTotals.set(key, (categoryTotals.get(key) || 0) + parseMoney(q.amount));
    });
    const topCategory = Array.from(categoryTotals.entries()).sort((a, b) => b[1] - a[1])[0];
    if (topCategory) {
      list.push({
        id: "top-category",
        title: `Top spending: ${topCategory[0]}`,
        detail: `${formatMoney(topCategory[1], settings.currency)} in booked purchases.`,
        tone: "neutral",
      });
    }
    if (list.length === 0) {
      list.push({
        id: "starter",
        title: "You are ready to start",
        detail: "Create an invoice or upload a receipt to get live AI insights.",
        tone: "neutral",
      });
    }
    return list.slice(0, 4);
  }, [draftPurchasesCount, netNumber, netValue, purchases, settings.currency, unpaidCount, unpaidInvoices]);

  const filteredInvoices = useMemo(
    () => invoices.filter((i) => `${i.customer} ${i.invoiceNo} ${i.total} ${i.status}`.toLowerCase().includes(invoiceSearch.toLowerCase())),
    [invoiceSearch, invoices]
  );
  const filteredPurchases = useMemo(
    () => purchases.filter((q) => `${q.description} ${q.category} ${q.amount} ${q.status}`.toLowerCase().includes(purchaseSearch.toLowerCase())),
    [purchaseSearch, purchases]
  );

  function runAssistantPrompt(prompt: string) {
    const action = parseAssistantIntent(prompt);

    if (action.type === "create_invoice") {
      const amount = action.amount ? `${action.amount} ${settings.currency}` : "";
      newInvoice({
        customer: action.customer || "New client",
        total: amount,
        line: action.line || "Services",
        dueDate: action.dueDate || addDays(todayString(), settings.autoDueDays),
      });
      setAssistantResponse(`Invoice draft created${action.customer ? ` for ${action.customer}` : ""}${action.amount ? ` with amount ${action.amount} ${settings.currency}` : ""}.`);
      return;
    }
    if (action.type === "show_profit") {
      setScreen("home");
      setAssistantResponse(`Your current profit view is: revenue ${revenueValue}, booked purchases ${purchasesValue}, net result ${netValue}.`);
      return;
    }
    if (action.type === "show_unpaid") {
      setScreen("sales");
      if (unpaidInvoices.length === 0) {
        setAssistantResponse("You have no unpaid invoices right now.");
      } else {
        const list = unpaidInvoices.slice(0, 4).map((i) => `${i.customer} (${i.total})`).join(", ");
        setAssistantResponse(`Unpaid invoices: ${list}.`);
      }
      return;
    }
    if (action.type === "show_expenses") {
      setScreen("home");
      setAssistantResponse(`Booked expenses are ${purchasesValue}. Draft purchases are ignored until booked.`);
      return;
    }
    if (action.type === "go_to") {
      setScreen(action.screen);
      setAssistantResponse(`Opened ${action.screen}.`);
      return;
    }
    if (action.type === "mark_paid") {
      if (!editingInvoiceId) {
        setScreen("sales");
        setAssistantResponse("Open an invoice first, then I can mark it as paid.");
        return;
      }
      if (saveInvoice("paid")) {
        setAssistantResponse("Marked the current invoice as paid.");
        pushNotice("Invoice marked as paid.");
      }
      return;
    }
    if (action.type === "create_purchase") {
      newPurchase({
        description: action.description || "Business expense",
        amount: action.amount ? `${action.amount} ${settings.currency}` : "",
        category: action.category || "General",
      });
      setAssistantResponse(`Prepared a purchase draft${action.amount ? ` for ${action.amount} ${settings.currency}` : ""}.`);
      return;
    }
    setAssistantResponse("Try commands like: Create invoice for Ali 5000 due next week, show unpaid invoices, show profit, or add expense 200 for fuel.");
  }

  function statCard(label: string, value: string, hint: string, tone?: "net") {
    const valueColor = tone === "net" ? (netNumber < 0 ? p.danger : p.positive) : p.text;
    return (
      <div style={{ ...cardStyle(theme), padding: 20 }}>
        <div style={{ color: p.muted, fontSize: 14 }}>{label}</div>
        <div style={{ marginTop: 8, fontSize: 30, fontWeight: 800, color: valueColor }}>{value}</div>
        <div style={{ marginTop: 8, fontSize: 14, color: p.muted }}>{hint}</div>
      </div>
    );
  }

  function insightCard(item: AiInsight) {
    const borderColor = item.tone === "good" ? p.positive : item.tone === "warn" ? p.warning : p.border;
    const iconBg = item.tone === "good" ? `${p.positive}18` : item.tone === "warn" ? `${p.warning}18` : p.soft;
    const iconColor = item.tone === "good" ? p.positive : item.tone === "warn" ? p.warning : p.accent;
    return (
      <div key={item.id} style={{ ...cardStyle(theme), padding: 16, background: p.soft, border: `1px solid ${borderColor}` }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ width: 36, height: 36, borderRadius: 12, background: iconBg, color: iconColor, display: "grid", placeItems: "center", fontWeight: 900 }}>
            {item.tone === "good" ? "↗" : item.tone === "warn" ? "!" : "AI"}
          </div>
          <div>
            <div style={{ fontWeight: 800 }}>{item.title}</div>
            <div style={{ marginTop: 6, color: p.muted, fontSize: 14 }}>{item.detail}</div>
          </div>
        </div>
      </div>
    );
  }

  const appGridColumns = assistantOpen && screen !== "login" ? "240px 1fr 340px" : "240px 1fr";

  return (
    <div style={{ minHeight: "100vh", background: p.bg, color: p.text, fontFamily: "Inter, system-ui, sans-serif" }}>
      <input ref={uploadRef} type="file" hidden accept=".pdf,image/*" onChange={(e) => handleUpload(e.target.files?.[0])} />

      <div style={{ position: "fixed", right: 18, top: 18, zIndex: 50, display: "grid", gap: 10 }}>
        {notices.map((n) => (
          <div key={n.id} style={{ ...cardStyle(theme), padding: "12px 14px", minWidth: 220 }}>{n.message}</div>
        ))}
      </div>

      {invoicePreviewOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.35)", display: "grid", placeItems: "center", padding: 24, zIndex: 40 }}>
          <div style={{ ...cardStyle(theme), width: "min(860px,100%)", padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>Invoice preview</div>
              <button onClick={() => setInvoicePreviewOpen(false)} style={buttonStyle("secondary", theme)}>Close</button>
            </div>
            <div style={{ display: "grid", gap: 16 }}>
              <div style={{ ...cardStyle(theme), padding: 18, background: p.soft }}>
                <div style={{ color: p.muted, fontSize: 13 }}>From</div>
                <div style={{ marginTop: 6, fontSize: 24, fontWeight: 800 }}>{settings.businessName}</div>
                <div style={{ color: p.muted, fontSize: 13, marginTop: 16 }}>Customer</div>
                <div style={{ marginTop: 6, fontSize: 20, fontWeight: 700 }}>{invoiceDraft.customer || "—"}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginTop: 18 }}>
                  <div>
                    <div style={{ color: p.muted, fontSize: 12 }}>Invoice no.</div>
                    <div style={{ marginTop: 6, fontWeight: 700 }}>{invoiceDraft.invoiceNo || "—"}</div>
                  </div>
                  <div>
                    <div style={{ color: p.muted, fontSize: 12 }}>Invoice date</div>
                    <div style={{ marginTop: 6, fontWeight: 700 }}>{invoiceDraft.invoiceDate || "—"}</div>
                  </div>
                  <div>
                    <div style={{ color: p.muted, fontSize: 12 }}>Due date</div>
                    <div style={{ marginTop: 6, fontWeight: 700 }}>{invoiceDraft.dueDate || "—"}</div>
                  </div>
                </div>
              </div>
              <div style={{ ...cardStyle(theme), padding: 18, background: p.soft }}>
                <div style={{ color: p.muted, fontSize: 13 }}>Line</div>
                <div style={{ marginTop: 6, fontWeight: 700 }}>{invoiceDraft.line || "—"}</div>
                <div style={{ color: p.muted, fontSize: 13, marginTop: 16 }}>Note</div>
                <div style={{ marginTop: 6, fontWeight: 700 }}>{invoiceDraft.note || "—"}</div>
                <div style={{ color: p.muted, fontSize: 13, marginTop: 16 }}>Total</div>
                <div style={{ marginTop: 6, fontSize: 28, fontWeight: 800 }}>{invoiceDraft.total || "—"}</div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button onClick={() => setInvoicePreviewOpen(false)} style={buttonStyle("secondary", theme)}>Close</button>
                <button onClick={() => { if (saveInvoice("sent")) { setInvoicePreviewOpen(false); pushNotice("Invoice sent."); } }} style={buttonStyle("primary", theme)}>Confirm send</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: appGridColumns, minHeight: "100vh" }}>
        <aside style={{ borderRight: `1px solid ${p.border}`, padding: 18, background: p.sidebar }}>
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1 }}>no<span style={{ color: p.accent }}>ma</span></div>
            <div style={{ color: p.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 2 }}>financial clarity</div>
          </div>
          {screen !== "login" && (["home", "sales", "purchases", "settings"] as const).map((item) => (
            <button key={item} onClick={() => setScreen(item)} style={{ width: "100%", textAlign: "left", padding: "14px 16px", borderRadius: 18, border: "none", marginBottom: 8, cursor: "pointer", background: screen === item ? p.accent : "transparent", color: screen === item ? p.accentText : p.text, fontWeight: 700, textTransform: "capitalize" }}>
              {item}
            </button>
          ))}
        </aside>

        <main>
          <div style={{ borderBottom: `1px solid ${p.border}`, padding: "16px 22px", display: "flex", justifyContent: "space-between", alignItems: "center", background: p.surface }}>
            <div style={{ ...cardStyle(theme), padding: "10px 14px", borderRadius: 16 }}>Theme: {settings.themeMode}</div>
            <div style={{ display: "flex", gap: 10 }}>
              {screen !== "login" && (
                <>
                  <button onClick={() => setAssistantOpen((v) => !v)} style={buttonStyle("secondary", theme)}>{assistantOpen ? "Hide assistant" : "Show assistant"}</button>
                  <button onClick={() => (screen === "purchases" || screen === "purchase_review") ? newPurchase() : newInvoice()} style={buttonStyle("primary", theme)}>New</button>
                  {isLoggedIn ? <button onClick={handleLogout} style={buttonStyle("secondary", theme)}>Logout</button> : null}
                </>
              )}
            </div>
          </div>

          <div style={{ padding: 22 }}>
            {screen === "login" && (
              <div style={{ minHeight: "calc(100vh - 150px)", display: "grid", placeItems: "center" }}>
                <div style={{ ...cardStyle(theme), width: "min(460px, 100%)", padding: 28 }}>
                  <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: -1 }}>Welcome to no<span style={{ color: p.accent }}>ma</span></div>
                  <div style={{ color: p.muted, marginTop: 8 }}>Sign in with your email and password.</div>
                  <div style={{ display: "grid", gap: 16, marginTop: 24 }}>
                    <div>
                      <div style={{ marginBottom: 8, color: p.muted }}>Email</div>
                      <input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} style={inputStyle(theme)} placeholder="you@example.com" />
                    </div>
                    <div>
                      <div style={{ marginBottom: 8, color: p.muted }}>Password</div>
                      <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} style={inputStyle(theme)} placeholder="Enter your password" onKeyDown={(e) => { if (e.key === "Enter") handleLogin(); }} />
                    </div>
                    <button onClick={handleLogin} style={{ ...buttonStyle("primary", theme), width: "100%" }}>Login</button>
                    <div style={{ color: p.muted, fontSize: 13, textAlign: "center" }}>Demo login page for hackathon presentation.</div>
                  </div>
                </div>
              </div>
            )}

            {screen === "home" && (
              <div style={{ display: "grid", gap: 20 }}>
                <div style={{ ...cardStyle(theme), padding: 18, background: netNumber < 0 ? `${p.danger}10` : `${p.positive}10`, border: `1px solid ${netNumber < 0 ? p.danger : p.positive}` }}>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{netNumber < 0 ? "⚠️ You are currently losing money" : "✅ Your business is doing well"}</div>
                  <div style={{ marginTop: 6, color: p.muted }}>{netNumber < 0 ? `Your net result is ${netValue}. Consider following up on unpaid invoices.` : `You are currently at ${netValue}. Keep tracking your growth.`}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
                  {statCard("Revenue", revenueValue, "Sent and paid invoices")}
                  {statCard("Purchases", purchasesValue, "Booked purchases only")}
                  {statCard("Net result", netValue, netNumber < 0 ? "Currently negative" : "Currently positive", "net")}
                  {statCard("Next action", unpaidCount > 0 ? "Follow up" : "Create", unpaidCount > 0 ? `${unpaidCount} unpaid invoices need attention` : "Start by creating an invoice")}
                </div>
                <div style={{ display: "grid", gap: 18 }}>
                  <div style={{ ...cardStyle(theme), padding: 20 }}>
                    <div style={{ fontSize: 22, fontWeight: 800 }}>Money in and out</div>
                    <div style={{ color: p.muted, marginTop: 6 }}>Simple view of your income, expenses, and net.</div>
                    <div style={{ marginTop: 18 }}><MiniChart data={chartData} theme={theme} /></div>
                  </div>
                  <div style={{ ...cardStyle(theme), padding: 20 }}>
                    <div style={{ fontSize: 22, fontWeight: 800 }}>AI insights</div>
                    <div style={{ color: p.muted, marginTop: 6 }}>Important things you should know.</div>
                    <div style={{ display: "grid", gap: 12, marginTop: 18 }}>{aiInsights.map(insightCard)}</div>
                  </div>
                </div>
              </div>
            )}

            {screen === "sales" && (
              <div style={{ display: "grid", gap: 18 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.6fr .8fr", gap: 18 }}>
                  <div style={{ ...cardStyle(theme), padding: 20 }}>
                    <div style={{ fontSize: 22, fontWeight: 800 }}>Invoice draft</div>
                    <div style={{ color: p.muted, marginTop: 6 }}>Create, edit, save, preview, send, and mark as paid.</div>
                    <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div><div style={{ marginBottom: 8, color: p.muted }}>Customer</div><input style={inputStyle(theme)} value={invoiceDraft.customer} onChange={(e) => setInvoiceDraft((prev) => ({ ...prev, customer: e.target.value }))} /></div>
                        <div><div style={{ marginBottom: 8, color: p.muted }}>Invoice no.</div><input style={inputStyle(theme)} value={invoiceDraft.invoiceNo} onChange={(e) => setInvoiceDraft((prev) => ({ ...prev, invoiceNo: e.target.value }))} /></div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div><div style={{ marginBottom: 8, color: p.muted }}>Date</div><input type="date" style={inputStyle(theme)} value={invoiceDraft.invoiceDate} onChange={(e) => setInvoiceDraft((prev) => ({ ...prev, invoiceDate: e.target.value }))} /></div>
                        <div><div style={{ marginBottom: 8, color: p.muted }}>Due date</div><input type="date" style={inputStyle(theme)} value={invoiceDraft.dueDate} onChange={(e) => setInvoiceDraft((prev) => ({ ...prev, dueDate: e.target.value }))} /></div>
                      </div>
                      <div style={{ ...cardStyle(theme), padding: 18, border: `2px solid ${p.accent}`, background: p.soft }}>
                        <div style={{ color: p.muted, marginBottom: 8, fontSize: 13, fontWeight: 700 }}>Invoice total amount</div>
                        <input style={{ ...inputStyle(theme), fontSize: 24, fontWeight: 800, padding: "16px 18px", background: p.surface }} value={invoiceDraft.total} onChange={(e) => setInvoiceDraft((prev) => ({ ...prev, total: e.target.value }))} placeholder={`Enter total amount e.g. 1250 ${settings.currency}`} />
                      </div>
                      <div><div style={{ marginBottom: 8, color: p.muted }}>Line</div><input style={inputStyle(theme)} value={invoiceDraft.line} onChange={(e) => setInvoiceDraft((prev) => ({ ...prev, line: e.target.value }))} /></div>
                      <div><div style={{ marginBottom: 8, color: p.muted }}>Note</div><textarea style={{ ...inputStyle(theme), minHeight: 90 }} value={invoiceDraft.note} onChange={(e) => setInvoiceDraft((prev) => ({ ...prev, note: e.target.value }))} /></div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button onClick={() => { if (saveInvoice()) pushNotice("Invoice saved."); }} style={buttonStyle("secondary", theme)}>Save</button>
                        <button onClick={() => setInvoicePreviewOpen(true)} style={buttonStyle("secondary", theme)}>Preview</button>
                        <button onClick={() => setInvoicePreviewOpen(true)} style={buttonStyle("primary", theme)}>Send invoice</button>
                        <button onClick={() => newInvoice()} style={buttonStyle("secondary", theme)}>New invoice</button>
                        <button onClick={() => { if (editingInvoiceId && saveInvoice("paid")) pushNotice("Invoice marked as paid."); }} style={buttonStyle("secondary", theme)}>Mark paid</button>
                        {editingInvoiceId ? <button onClick={deleteInvoice} style={buttonStyle("danger", theme)}>Delete</button> : null}
                      </div>
                    </div>
                  </div>
                  <div style={{ ...cardStyle(theme), padding: 20 }}>
                    <div style={{ fontSize: 22, fontWeight: 800 }}>Saved invoices</div>
                    <div style={{ color: p.muted, marginTop: 6 }}>Search, edit, and quickly see whether each invoice is draft, sent, or paid.</div>
                    <input placeholder="Search invoices" style={{ ...inputStyle(theme), marginTop: 16 }} value={invoiceSearch} onChange={(e) => setInvoiceSearch(e.target.value)} />
                    <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
                      {filteredInvoices.length === 0 ? <div style={{ ...cardStyle(theme), padding: 18, background: p.soft, color: p.muted }}>No invoices yet</div> : filteredInvoices.map((i) => (
                        <button key={i.id} onClick={() => { const { id, createdAt, ...rest } = i; setEditingInvoiceId(id); setInvoiceDraft(rest); }} style={{ ...cardStyle(theme), padding: 16, background: p.soft, textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                          <div>
                            <div style={{ fontWeight: 700 }}>{i.customer || "Untitled invoice"}</div>
                            <div style={{ color: p.muted, marginTop: 6, fontSize: 14 }}>{i.invoiceNo} · {i.total || "—"}</div>
                          </div>
                          <span style={{ padding: "7px 11px", borderRadius: 999, background: i.status === "paid" ? `${p.positive}18` : i.status === "sent" ? `${p.accent}18` : p.surface, color: i.status === "paid" ? p.positive : i.status === "sent" ? p.accent : p.text, fontWeight: 800, fontSize: 12, textTransform: "capitalize", border: `1px solid ${p.border}` }}>{i.status}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {screen === "purchases" && <div style={{ display: "grid", gap: 18 }}><div style={{ display: "grid", gridTemplateColumns: "0.85fr 1.4fr", gap: 18 }}><div style={{ ...cardStyle(theme), padding: 20 }}><div style={{ fontSize: 22, fontWeight: 800 }}>Receipt</div><div style={{ color: p.muted, marginTop: 6 }}>Upload and review one receipt at a time.</div><button onClick={() => uploadRef.current?.click()} style={{ marginTop: 18, width: "100%", padding: 28, borderRadius: 20, border: `1px dashed ${p.border}`, background: p.soft, cursor: "pointer", color: p.text }}>{purchaseDraft.fileName || "Drop file here or click to upload"}</button><button onClick={() => setScreen("purchase_review")} style={{ ...buttonStyle("secondary", theme), marginTop: 12, width: "100%" }}>Review extracted data</button></div><div style={{ ...cardStyle(theme), padding: 20 }}><div style={{ fontSize: 22, fontWeight: 800 }}>{editingPurchaseId ? "Edit purchase" : "Purchase draft"}</div><div style={{ color: p.muted, marginTop: 6 }}>Draft purchases do not affect the dashboard. Only booked purchases do.</div><div style={{ display: "grid", gap: 14, marginTop: 18 }}><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}><div><div style={{ marginBottom: 8, color: p.muted }}>Description</div><input style={inputStyle(theme)} value={purchaseDraft.description} onChange={(e) => setPurchaseDraft((prev) => ({ ...prev, description: e.target.value }))} /></div><div><div style={{ marginBottom: 8, color: p.muted }}>Date</div><input type="date" style={inputStyle(theme)} value={purchaseDraft.date} onChange={(e) => setPurchaseDraft((prev) => ({ ...prev, date: e.target.value }))} /></div></div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}><div><div style={{ marginBottom: 8, color: p.muted }}>Category</div><input style={inputStyle(theme)} value={purchaseDraft.category} onChange={(e) => setPurchaseDraft((prev) => ({ ...prev, category: e.target.value }))} /></div><div><div style={{ marginBottom: 8, color: p.muted }}>Tax</div><input style={inputStyle(theme)} value={purchaseDraft.tax} onChange={(e) => setPurchaseDraft((prev) => ({ ...prev, tax: e.target.value }))} /></div><div><div style={{ marginBottom: 8, color: p.muted }}>Amount</div><input style={inputStyle(theme)} value={purchaseDraft.amount} onChange={(e) => setPurchaseDraft((prev) => ({ ...prev, amount: e.target.value }))} /></div></div><div><div style={{ marginBottom: 8, color: p.muted }}>Status</div><select style={inputStyle(theme)} value={purchaseDraft.status} onChange={(e) => setPurchaseDraft((prev) => ({ ...prev, status: e.target.value as PurchaseStatus }))}><option value="draft">draft</option><option value="booked">booked</option></select></div><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><button onClick={() => { if (savePurchase()) pushNotice(editingPurchaseId ? "Purchase updated." : "Purchase saved."); }} style={buttonStyle("secondary", theme)}>{editingPurchaseId ? "Update" : "Save"}</button><button onClick={() => { if (savePurchase("booked")) pushNotice("Purchase booked."); }} style={buttonStyle("primary", theme)}>Book purchase</button><button onClick={() => uploadRef.current?.click()} style={buttonStyle("secondary", theme)}>Replace receipt</button>{editingPurchaseId ? <button onClick={deletePurchase} style={buttonStyle("danger", theme)}>Delete</button> : null}</div></div></div></div><div style={{ ...cardStyle(theme), padding: 20 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16 }}><div><div style={{ fontSize: 22, fontWeight: 800 }}>Saved purchases</div><div style={{ color: p.muted, marginTop: 6 }}>Open any purchase to edit it. Switching booked back to draft will reduce dashboard totals again.</div></div><input placeholder="Search purchases" style={{ ...inputStyle(theme), maxWidth: 260 }} value={purchaseSearch} onChange={(e) => setPurchaseSearch(e.target.value)} /></div><div style={{ display: "grid", gap: 10 }}>{filteredPurchases.length === 0 ? <div style={{ ...cardStyle(theme), padding: 18, background: p.soft, color: p.muted }}>No purchases yet</div> : filteredPurchases.map((q) => <button key={q.id} onClick={() => { const { id, createdAt, ...rest } = q; setEditingPurchaseId(id); setPurchaseDraft(rest); }} style={{ ...cardStyle(theme), padding: 16, background: p.soft, textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><div style={{ fontWeight: 700 }}>{q.description || "Untitled purchase"}</div><div style={{ color: p.muted, marginTop: 6, fontSize: 14 }}>{q.category || "No category"} · {q.date || "No date"}</div></div><div style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ padding: "6px 10px", borderRadius: 999, background: p.soft, color: q.status === "booked" ? p.positive : p.text, fontWeight: 700, fontSize: 12 }}>{q.status}</span><span style={{ fontWeight: 700 }}>{q.amount || "—"}</span><span style={{ color: p.muted, fontSize: 13 }}>Edit</span></div></button>)}</div></div></div>}
            {screen === "purchase_review" && <div style={{ display: "grid", gridTemplateColumns: "0.95fr 1.2fr", gap: 18 }}><div style={{ ...cardStyle(theme), padding: 20 }}><div style={{ fontSize: 22, fontWeight: 800 }}>Document preview</div><div style={{ marginTop: 18, borderRadius: 22, border: `1px dashed ${p.border}`, background: p.soft, minHeight: 360, display: "grid", placeItems: "center", color: p.muted }}>{purchaseDraft.fileName || "No file selected"}</div></div><div style={{ ...cardStyle(theme), padding: 20 }}><div style={{ fontSize: 22, fontWeight: 800 }}>Extracted fields</div><div style={{ color: p.muted, marginTop: 6 }}>Use these values in the purchase draft or ask AI to improve them.</div><div style={{ display: "grid", gap: 14, marginTop: 18 }}><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}><div><div style={{ marginBottom: 8, color: p.muted }}>Description</div><input readOnly style={inputStyle(theme)} value={purchaseDraft.description} /></div><div><div style={{ marginBottom: 8, color: p.muted }}>Amount</div><input readOnly style={inputStyle(theme)} value={purchaseDraft.amount} /></div></div><div style={{ display: "flex", gap: 10 }}><button onClick={() => setScreen("purchases")} style={buttonStyle("primary", theme)}>Use in draft</button><button onClick={() => { setAssistantOpen(true); setAssistantInput("Categorize this purchase and explain tax"); setAssistantResponse("I can help improve the purchase details."); }} style={buttonStyle("secondary", theme)}>Ask AI to revise</button></div></div></div></div>}
            {screen === "settings" && <div style={{ display: "grid", gap: 18 }}><div><div style={{ fontSize: 28, fontWeight: 900 }}>Settings</div><div style={{ color: p.muted, marginTop: 6 }}>Basic workspace defaults save locally and affect drafts.</div></div><div style={{ display: "grid", gridTemplateColumns: "1.3fr .9fr", gap: 18 }}><div style={{ ...cardStyle(theme), padding: 20 }}><div style={{ fontSize: 22, fontWeight: 800 }}>Workspace preferences</div><div style={{ color: p.muted, marginTop: 6 }}>These defaults are used when new invoices and purchases are created.</div><div style={{ display: "grid", gap: 14, marginTop: 18 }}><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}><div><div style={{ marginBottom: 8, color: p.muted }}>Business name</div><input style={inputStyle(theme)} value={settings.businessName} onChange={(e) => setSettings((prev) => ({ ...prev, businessName: e.target.value }))} /></div><div><div style={{ marginBottom: 8, color: p.muted }}>Currency</div><input style={inputStyle(theme)} value={settings.currency} onChange={(e) => setSettings((prev) => ({ ...prev, currency: e.target.value }))} /></div></div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}><div><div style={{ marginBottom: 8, color: p.muted }}>Default tax</div><input style={inputStyle(theme)} value={settings.defaultTax} onChange={(e) => setSettings((prev) => ({ ...prev, defaultTax: e.target.value }))} /></div><div><div style={{ marginBottom: 8, color: p.muted }}>Auto due days</div><input type="number" style={inputStyle(theme)} value={settings.autoDueDays} onChange={(e) => setSettings((prev) => ({ ...prev, autoDueDays: Number(e.target.value) || 14 }))} /></div></div><div><div style={{ marginBottom: 8, color: p.muted }}>Default invoice note</div><textarea style={{ ...inputStyle(theme), minHeight: 90 }} value={settings.defaultInvoiceNote} onChange={(e) => setSettings((prev) => ({ ...prev, defaultInvoiceNote: e.target.value }))} /></div><div><div style={{ marginBottom: 8, color: p.muted }}>Theme</div><select style={inputStyle(theme)} value={settings.themeMode} onChange={(e) => setSettings((prev) => ({ ...prev, themeMode: e.target.value as ThemeMode }))}><option value="current">current</option><option value="soft">soft light</option><option value="mint">mint light</option><option value="midnight">midnight</option></select></div></div></div><div style={{ ...cardStyle(theme), padding: 20 }}><div style={{ fontSize: 22, fontWeight: 800 }}>Quick actions</div><div style={{ color: p.muted, marginTop: 6 }}>Helpful actions for testing and resetting the app.</div><div style={{ display: "grid", gap: 12, marginTop: 18 }}><button onClick={() => { setSettings(DEFAULT_SETTINGS); pushNotice("Settings reset."); }} style={buttonStyle("secondary", theme)}>Reset settings</button><button onClick={() => { setInvoices([]); setPurchases([]); setEditingInvoiceId(null); setEditingPurchaseId(null); setInvoiceDraft(EMPTY_INVOICE); setPurchaseDraft(EMPTY_PURCHASE); pushNotice("Workspace data cleared."); }} style={buttonStyle("danger", theme)}>Clear invoices & purchases</button></div></div></div></div>}
          </div>
        </main>
        {assistantOpen && screen !== "login" && <aside style={{ borderLeft: `1px solid ${p.border}`, padding: 18, background: p.assistant }}><div style={{ fontSize: 24, fontWeight: 800 }}>AI assistant</div><div style={{ color: p.muted, marginTop: 6 }}>Natural commands + live business insights</div><div style={{ display: "grid", gap: 10, marginTop: 14 }}>{["Create invoice for Ali 5000 due next week", "Show unpaid invoices", "Show profit", "Add expense 200 for fuel", "Open purchases"].map((item) => <button key={item} onClick={() => runAssistantPrompt(item)} style={{ ...buttonStyle("secondary", theme), textAlign: "left" }}>{item}</button>)}</div><div style={{ ...cardStyle(theme), padding: 16, marginTop: 16 }}><div style={{ color: p.muted, fontSize: 13 }}>Assistant response</div><div style={{ ...cardStyle(theme), padding: 14, marginTop: 10, background: p.soft }}>{assistantResponse}</div><div style={{ color: p.muted, fontSize: 13, marginTop: 14 }}>Ask anything</div><textarea value={assistantInput} onChange={(e) => setAssistantInput(e.target.value)} placeholder="Try: Create invoice for Ali 5000 due next week" style={{ ...inputStyle(theme), minHeight: 110, marginTop: 10 }} /><button onClick={() => { if (!assistantInput.trim()) return; runAssistantPrompt(assistantInput); setAssistantInput(""); }} style={{ ...buttonStyle("primary", theme), width: "100%", marginTop: 12 }}>Send</button></div></aside>}
      </div>
    </div>
  );
}

