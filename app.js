const GCS_BASE =
  "https://storage.googleapis.com/elkin-garcia-workspace-mlb-gameday-obp-odds-prod/data";

/** @param {Date} d */
function formatDateYYYYMMDD(d) {
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function todayLocalYYYYMMDD() {
  return formatDateYYYYMMDD(new Date());
}

/**
 * Very small CSV parser for this dataset (no quoted commas expected).
 * @param {string} csvText
 * @returns {{ headers: string[], rows: Record<string, string>[] }}
 */
function parseCsv(csvText) {
  const lines = csvText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",");
    const row = {};
    for (let c = 0; c < headers.length; c++) row[headers[c]] = (cells[c] ?? "").trim();
    rows.push(row);
  }

  return { headers, rows };
}

/** @param {string} s */
function toNumberOrNaN(s) {
  const n = Number(s);
  return Number.isFinite(n) ? n : Number.NaN;
}

/**
 * Row coloring rules:
 * Only color-code when NHO > 0 and NPO < 0:
 * - odds == "not favorite" => GREAT
 * - odds == "favorite" => good
 *
 * @param {{net_hitting_obp: string, net_pitching_obp: string, odds: string}} row
 * @returns {""|"row-great"|"row-good"}
 */
function rowClass(row) {
  const nho = toNumberOrNaN(row.net_hitting_obp);
  const npo = toNumberOrNaN(row.net_pitching_obp);
  const odds = String(row.odds || "").trim().toLowerCase();

  if (!(Number.isFinite(nho) && Number.isFinite(npo))) return "";
  if (!(nho > 0 && npo < 0)) return "";

  if (odds === "not favorite") return "row-great";
  if (odds === "favorite") return "row-good";
  return "";
}

/** @param {string} s */
function prettyNumber(s) {
  const n = toNumberOrNaN(s);
  if (!Number.isFinite(n)) return s;
  // Keep 3 decimals for net OBP columns, 3 for others is fine too.
  return n.toFixed(Math.abs(n) < 1 ? 3 : 3);
}

function el(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node;
}

const dateInputEl = /** @type {HTMLInputElement} */ (el("dateInput"));
const reloadBtn = /** @type {HTMLButtonElement} */ (el("reloadBtn"));
const downloadBtn = /** @type {HTMLButtonElement} */ (el("downloadBtn"));
const statusEl = el("status");
const tableHeadEl = el("tableHead");
const tableBodyEl = el("tableBody");
const tabTableEl = /** @type {HTMLButtonElement} */ (el("tabTable"));
const tabChartsEl = /** @type {HTMLButtonElement} */ (el("tabCharts"));
const legendRightEl = el("legendRight");
const panelTableEl = el("panelTable");
const panelChartsEl = el("panelCharts");

/** @type {{headers: string[], rows: Record<string, string>[]} | null} */
let tableData = null;
/** @type {{col: string, dir: "asc" | "desc"} | null} */
let sortState = null;

function setActiveTab(which) {
  const isTable = which === "table";

  tabTableEl.classList.toggle("tab-active", isTable);
  tabChartsEl.classList.toggle("tab-active", !isTable);

  tabTableEl.setAttribute("aria-selected", String(isTable));
  tabChartsEl.setAttribute("aria-selected", String(!isTable));

  panelTableEl.classList.toggle("panel-hidden", !isTable);
  panelChartsEl.classList.toggle("panel-hidden", isTable);
  legendRightEl.classList.toggle("panel-hidden", isTable);
}

function setStatus(text, kind = "info") {
  const prefix =
    kind === "error" ? "<strong>Error:</strong> " : kind === "loading" ? "<strong>Loading:</strong> " : "";
  statusEl.innerHTML = `${prefix}${text}`;
}

/** @param {string} h */
function isNumericHeader(h) {
  return (
    h.endsWith("_obp") ||
    h === "net_hitting_obp" ||
    h === "net_pitching_obp" ||
    h === "game_pk"
  );
}

/**
 * @param {Record<string, string>[]} rows
 * @param {string} col
 * @param {"asc"|"desc"} dir
 */
function sortRows(rows, col, dir) {
  const factor = dir === "asc" ? 1 : -1;
  const numeric = isNumericHeader(col);

  return [...rows].sort((a, b) => {
    const av = a[col] ?? "";
    const bv = b[col] ?? "";

    if (numeric) {
      const an = toNumberOrNaN(String(av));
      const bn = toNumberOrNaN(String(bv));
      const aOk = Number.isFinite(an);
      const bOk = Number.isFinite(bn);
      if (aOk && bOk) return (an - bn) * factor;
      if (aOk && !bOk) return -1;
      if (!aOk && bOk) return 1;
      return String(av).localeCompare(String(bv)) * factor;
    }

    return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" }) * factor;
  });
}

/** @param {string} col */
function setSort(col) {
  if (!tableData) return;

  if (sortState?.col === col) {
    sortState = { col, dir: sortState.dir === "asc" ? "desc" : "asc" };
  } else {
    sortState = { col, dir: "asc" };
  }

  const sorted = sortRows(tableData.rows, sortState.col, sortState.dir);
  renderTable(tableData.headers, sorted);
}

function renderTable(headers, rows) {
  tableHeadEl.innerHTML = "";
  tableBodyEl.innerHTML = "";

  const headRow = document.createElement("tr");
  for (const h of headers) {
    const th = document.createElement("th");
    th.className = "sortable";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "th-btn";
    btn.textContent = h;
    btn.addEventListener("click", () => setSort(h));

    if (sortState?.col === h) {
      th.setAttribute("aria-sort", sortState.dir === "asc" ? "ascending" : "descending");
      btn.setAttribute("data-sort", sortState.dir);
    } else {
      th.removeAttribute("aria-sort");
      btn.removeAttribute("data-sort");
    }

    th.appendChild(btn);
    headRow.appendChild(th);
  }
  tableHeadEl.appendChild(headRow);

  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.className = rowClass(r);

    for (const h of headers) {
      const td = document.createElement("td");
      const v = r[h] ?? "";

      if (h === "odds") {
        td.innerHTML = `<span class="pill">${String(v)}</span>`;
        td.className = "center";
      } else if (isNumericHeader(h)) {
        td.textContent = prettyNumber(String(v));
        td.className = "num mono";
      } else {
        td.textContent = String(v);
      }

      tr.appendChild(td);
    }

    tableBodyEl.appendChild(tr);
  }
}

async function loadForDate(dateStr) {
  const url = `${GCS_BASE}/${dateStr}_matchups.csv`;
  const proxyUrl = `/api/matchups?date=${encodeURIComponent(dateStr)}`;
  dateInputEl.value = dateStr;

  setStatus(`Fetching ${dateStr}_matchups.csv …`, "loading");

  let resp;
  try {
    // Use same-origin proxy to avoid GCS CORS issues.
    resp = await fetch(proxyUrl, { cache: "no-store" });
  } catch (e) {
    setStatus(`Network error while fetching CSV.`, "error");
    throw e;
  }

  if (!resp.ok) {
    setStatus(`CSV not found (HTTP ${resp.status}).`, "error");
    renderTable(["message"], [{ message: `Could not load: ${url}` }]);
    return;
  }

  const text = await resp.text();
  const { headers, rows } = parseCsv(text);

  if (!headers.length) {
    setStatus(`CSV was empty.`, "error");
    renderTable(["message"], [{ message: "CSV was empty." }]);
    return;
  }

  tableData = { headers, rows };
  sortState = null;
  renderTable(headers, rows);
  setStatus(`Loaded <strong>${rows.length}</strong> rows from <span class="mono">${dateStr}_matchups.csv</span>.`);
}

reloadBtn.addEventListener("click", () => {
  const d = dateInputEl.value || todayLocalYYYYMMDD();
  loadForDate(d);
});

downloadBtn.addEventListener("click", () => {
  const d = dateInputEl.value || todayLocalYYYYMMDD();
  const url = `${GCS_BASE}/${d}_matchups.csv`;
  window.open(url, "_blank", "noopener,noreferrer");
});

dateInputEl.addEventListener("change", () => {
  const d = dateInputEl.value;
  if (d) loadForDate(d);
});

tabTableEl.addEventListener("click", () => setActiveTab("table"));
tabChartsEl.addEventListener("click", () => setActiveTab("charts"));

// Initial load (current local date)
setActiveTab("table");
loadForDate(todayLocalYYYYMMDD());

