import sys, re, pickle, statistics as st, collections, os
sys.path.insert(0, os.path.dirname(__file__))
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
import spec

ROOT = "/Users/tyu/Dropbox/Mac (2)/Documents/projects/GitHub/item-Quote-fulfillment-cc"
SRC = f"{ROOT}/workingfolder-input/Billing Items Usage Sep 2026 Final(1).xlsx"
OUT = f"{ROOT}/workingfolder-output/UNIS Billing Items - Scope & Rate Card Catalog (Sep 2026).xlsx"
PL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pl.pkl")

src = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
usage = {r[1]: r for r in src["All Billing Items Usage"].iter_rows(min_row=2, values_only=True) if r[1]}
master = {r[1]: r for r in src["All Billing Items"].iter_rows(min_row=2, values_only=True) if r[1]}
if os.path.exists(PL):
    pl = pickle.load(open(PL, "rb"))
else:
    pl = list(src["All the customers price list"].iter_rows(min_row=2, values_only=True))
pl_by = collections.defaultdict(list)
for r in pl:
    pl_by[r[5]].append(r)

def num(x):
    try:
        return float(str(x).replace("$", "").replace(",", ""))
    except (TypeError, ValueError):
        return None

def rate_stats(line):
    vals = []
    for code in line["codes"]:
        for r in pl_by.get(code, []):
            if (r[10] or "") != line["ratetype"]:
                continue
            d = str(r[7] or "").strip()
            if line["inc"] and not re.search(line["inc"], d, re.I):
                continue
            if line["exc"] and re.search(line["exc"], d, re.I):
                continue
            v = num(r[11])
            if v is not None and v > 0:
                vals.append(v)
    if len(vals) >= 1:
        q = st.quantiles(vals, n=4) if len(vals) >= 4 else [min(vals), st.median(vals), max(vals)]
        return round(st.median(vals), 2), round(q[0], 2), round(q[2], 2), len(vals), "Customer price lists"
    # fallback: usage-sheet average rate
    avgs = [num(usage[c][6]) for c in line["codes"] if c in usage and num(usage[c][6])]
    if avgs:
        return round(st.mean(avgs), 2), None, None, 0, "Usage-sheet average (no price-list match)"
    return None, None, None, 0, "No data - quote per request"

# ---------------------------------------------------------------- styles
F = "Calibri"
thin = Side(style="thin", color="D9D9D9")
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)
HDR_FILL = PatternFill("solid", fgColor="1F3864")
SEC_FILL = PatternFill("solid", fgColor="F2F2F2")
INT_FILL = PatternFill("solid", fgColor="FCE4D6")
GAP_FILL = PatternFill("solid", fgColor="FFF2CC")
WRAP = Alignment(wrap_text=True, vertical="top")

def header(ws, row, cols):
    for i, c in enumerate(cols, 1):
        cell = ws.cell(row, i, c)
        cell.font = Font(name=F, bold=True, color="FFFFFF", size=10)
        cell.fill = HDR_FILL
        cell.alignment = Alignment(wrap_text=True, vertical="center")
        cell.border = BORDER

def widths(ws, ws_widths):
    for i, w in enumerate(ws_widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

wb = openpyxl.Workbook()

# ---------------------------------------------------------------- data prep
svc_rows = []   # (section, svc)
for title, ss in spec.SECTIONS:
    for s in ss:
        svc_rows.append((title, s))
code2svc = {c: (t, s) for t, s in svc_rows for c in s["codes"]}

def svc_usage(s):
    cust = [usage[c][11] or 0 for c in s["codes"] if c in usage]
    freq = [usage[c][13] or 0 for c in s["codes"] if c in usage]
    return (max(cust) if cust else 0), sum(freq)

n_lines = sum(len(s["lines"]) for _, s in svc_rows)
n_quote_svcs = sum(1 for t, s in svc_rows if s["applies"] != "Internal")

# ================================================================ README
ws = wb.active
ws.title = "README"
widths(ws, [110])
readme = [
    ("UNIS Billing Items - Scope of Services & Rate Card Catalog", Font(name=F, bold=True, size=14)),
    ("Source: 'Billing Items Usage Sep 2026 Final' (All Billing Items Usage + All Billing Items + All the customers price list). Format modeled on 'UNIS UF Master Pricing Templates - Scope & How-To'. Reference rates cross-checked against the Northampton B2B proposal template and the D2C Standard Pricing template (2025).", Font(name=F, size=10)),
    ("", None),
    ("WHAT THIS WORKBOOK DOES", Font(name=F, bold=True, size=11)),
    (f"- Consolidates {len(master)} system charge codes (318 in the usage sheet + {len(master) - len(usage)} active codes that appear only in the master item list) into {len(svc_rows)} customer-readable services ({n_quote_svcs} quotable + {len(svc_rows) - n_quote_svcs} internal billing adjustments).", Font(name=F, size=10)),
    ("- Codes that differ only by UOM (Case / Pallet / Piece / CNTR ...), by pricing method (range vs incremental tier, first/additional split), or by system trigger (Offload vs Billed-Upon-Receipt, Initial vs Recurring storage) are merged into one service. The differences become ENUMERATED OPTIONS (unit, band, type) instead of separate line items.", Font(name=F, size=10)),
    (f"- Each service is broken into {n_lines} enumerated rate-card lines (service x unit x price driver x option) - the structure intended for the Quotation page (Task 2).", Font(name=F, size=10)),
    ("", None),
    ("TABS", Font(name=F, bold=True, size=11)),
    ("1. Scope & How-To - one row per service, in the same form as the reference file: what we do / billing trigger & unit / rate-card line item with its enumerated options / scope notes. Extra columns on the right: Service ID, Applies To (B2B / D2C), usage, source charge codes.", Font(name=F, size=10)),
    ("2. Rate Card Lines - one row per enumerated price level, with a reference rate (median / P25 / P75 of current customer price lists) and the current B2B / D2C template rate for comparison.", Font(name=F, size=10)),
    ("3. Charge Code Mapping - every system charge code -> its service, with original name, UOM, trigger, usage and status (In use / Configured, not invoiced in Sep-2026 / Master list only).", Font(name=F, size=10)),
    ("4. Consolidation Notes - merge rules applied, gaps between the templates and the billing codes, and open questions to confirm before Task 2.", Font(name=F, size=10)),
    ("", None),
    ("HOW TO READ THE REFERENCE RATES", Font(name=F, bold=True, size=11)),
    ("- Reference Rate = median of the 'Unit Price' entries in all customer price lists for the mapped codes, filtered by the option's keyword (e.g. '500 - 1000 Cases', '55\"', 'Monthly'). 'Minimum' entries are excluded unless the option IS a minimum. P25-P75 shows the typical spread. It is a market reference, NOT a proposed list price.", Font(name=F, size=10)),
    ("- Where no price-list entry matches, the usage-sheet average is shown and flagged; 'No data' means the line is configured but has never been priced.", Font(name=F, size=10)),
    ("- Yellow rows = template line items that have NO billing code in the system yet (gap). Orange section = internal billing adjustments, excluded from customer quotes.", Font(name=F, size=10)),
]
for i, (t, f) in enumerate(readme, 1):
    c = ws.cell(i, 1, t)
    if f:
        c.font = f
    c.alignment = Alignment(wrap_text=True, vertical="top")

# ================================================================ SCOPE & HOW-TO
ws = wb.create_sheet("Scope & How-To")
widths(ws, [52, 30, 46, 46, 9, 12, 11, 11, 40])
ws.cell(1, 1, "UNIS Fulfillment - Appendix: Scope of Services & Billing Methodology").font = Font(name=F, bold=True, size=14)
ws.merge_cells("A1:D1")
c = ws.cell(2, 1, "Plain-language reference for what each rate-card line item covers and how it is billed, so there is no ambiguity between UNIS and the client on scope or pricing units. Where one service has several price levels, the options are listed (Unit / band / type) inside the Rate Card Line Item - the matching prices are on the 'Rate Card Lines' tab.")
c.font = Font(name=F, size=9, color="595959"); c.alignment = WRAP
ws.merge_cells("A2:D2"); ws.row_dimensions[2].height = 38
ws.cell(3, 1, "Statement of Work (SOW) Reference:").font = Font(name=F, bold=True, size=9)
ws.cell(3, 2, "[Insert SOW document name / link here]").font = Font(name=F, size=9, italic=True)
cols = ["Activity - How We Do It", "Billing Trigger / Unit", "Rate Card Line Item(s)  (price-level options)", "Scope Notes",
        "Service ID", "Applies To", "Customers (max per code)", "Invoice lines Sep-26", "Source Charge Codes"]
header(ws, 5, cols)
ws.freeze_panes = "A6"
r = 6
for title, ss in spec.SECTIONS:
    internal = title.startswith("BILLING ADJUSTMENTS")
    c = ws.cell(r, 1, title)
    c.font = Font(name=F, bold=True, size=10)
    for col in range(1, len(cols) + 1):
        ws.cell(r, col).fill = INT_FILL if internal else SEC_FILL
    ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=4)
    r += 1
    for s in ss:
        cust, freq = svc_usage(s)
        vals = [s["activity"], s["trigger"], f"{s['name']}\n{s['enums']}", s["notes"] or "",
                s["id"], s["applies"], cust, freq, ", ".join(s["codes"]) or "(condition on ST-01 / ST-02 / ST-05)"]
        for col, v in enumerate(vals, 1):
            cell = ws.cell(r, col, v)
            cell.alignment = WRAP
            cell.border = BORDER
            cell.font = Font(name=F, size=9, color="7F7F7F" if col == 9 else "000000")
        # bold service name inside the line-item cell is not possible per-run in openpyxl; bold the ID instead
        ws.cell(r, 5).font = Font(name=F, size=9, bold=True)
        r += 1

# ================================================================ RATE CARD LINES
ws = wb.create_sheet("Rate Card Lines")
cols = ["Service ID", "Section", "Service", "Line Item", "Unit", "Price Driver", "Option",
        "Reference Rate (median)", "P25", "P75", "# Price-list entries", "Rate basis",
        "Current B2B Template (Northampton)", "Current D2C Template", "Charge Codes", "Data note"]
header(ws, 1, cols)
widths(ws, [9, 24, 34, 30, 14, 18, 40, 12, 9, 9, 10, 12, 14, 12, 36, 26])
ws.freeze_panes = "H2"
r = 2
for title, s in svc_rows:
    for ln in s["lines"]:
        med, p25, p75, n, note = rate_stats(ln)
        gap = not ln["codes"] and not ln["note"]
        if gap:
            note = "GAP - template line has no billing code"
        elif ln["note"]:
            note = ln["note"]
        vals = [s["id"], title.title(), s["name"], ln["line"], ln["unit"], ln["dim"], ln["opt"],
                med, p25, p75, n, "Markup %" if ln["ratetype"] == "Mark Up" else "$ per unit",
                ln["b2b"], ln["d2c"], ", ".join(ln["codes"]), note]
        for col, v in enumerate(vals, 1):
            cell = ws.cell(r, col, v)
            cell.alignment = WRAP
            cell.border = BORDER
            cell.font = Font(name=F, size=9)
            if gap:
                cell.fill = GAP_FILL
            if col in (8, 9, 10, 13, 14) and isinstance(v, (int, float)):
                cell.number_format = '0%' if ln["ratetype"] == "Mark Up" else '"$"#,##0.00'
        ws.cell(r, 8).font = Font(name=F, size=9, bold=True)
        r += 1
ws.auto_filter.ref = f"A1:{get_column_letter(len(cols))}{r - 1}"

# ================================================================ CODE MAPPING
ws = wb.create_sheet("Charge Code Mapping")
cols = ["Service ID", "Service", "Charge Code", "Category", "Item Name (system)", "Item Description (system)", "UOM",
        "Tag", "Trigger Point", "Avg Rate", "Min", "Max", "Customers by Invoice", "Invoice Lines Sep-26", "Status"]
header(ws, 1, cols)
widths(ws, [9, 34, 26, 16, 38, 44, 14, 10, 22, 10, 9, 9, 11, 11, 26])
ws.freeze_panes = "D2"
order = {s["id"]: i for i, (_, s) in enumerate(svc_rows)}
codes_sorted = sorted(master, key=lambda c: (order[code2svc[c][1]["id"]], -(usage[c][13] or 0) if c in usage else 1, c))
r = 2
for code in codes_sorted:
    t, s = code2svc[code]
    if code in usage:
        u = usage[code]
        status = "In use" if (u[13] or 0) > 0 else "Configured - not invoiced"
        vals = [s["id"], s["name"], code, u[2], u[3], u[4], u[5], u[0], u[16], num(u[6]), num(u[8]), num(u[9]), u[11], u[13], status]
    else:
        m = master[code]
        vals = [s["id"], s["name"], code, m[6], m[2], "", m[3], "", m[8], num(m[4]), None, None, None, None, "Master list only (not in usage sheet)"]
    for col, v in enumerate(vals, 1):
        cell = ws.cell(r, col, v)
        cell.alignment = Alignment(vertical="top", wrap_text=col in (2, 5, 6))
        cell.border = BORDER
        cell.font = Font(name=F, size=9)
        if col in (10, 11, 12) and isinstance(v, float):
            cell.number_format = '"$"#,##0.00'
    r += 1
ws.auto_filter.ref = f"A1:{get_column_letter(len(cols))}{r - 1}"

# ================================================================ NOTES
ws = wb.create_sheet("Consolidation Notes")
widths(ws, [6, 34, 110])
header(ws, 1, ["#", "Topic", "Note"])
status_counts = collections.Counter()
for code in master:
    if code not in usage:
        status_counts["Master list only"] += 1
    elif (usage[code][13] or 0) > 0:
        status_counts["In use"] += 1
    else:
        status_counts["Configured - not invoiced"] += 1
notes = [
    ("A. MERGE RULES", None),
    ("Same activity, different UOM", "e.g. Offload per Case / Pallet / Piece / Inner / CNTR / cu ft / lb were 20+ separate codes -> one service with a 'Unit' option list (IN-04, TL-01, OB-11)."),
    ("Same activity, different pricing method", "Range-rate vs incremental-tier vs first/additional split codes are shown as options of one line (e.g. IN-01 case-count bands incl. the 'per case over 2,500' incremental line)."),
    ("Same activity, different system trigger", "'Offload' and 'Billed Upon Receipt' codes (HANDLING-0158...0181) price the same receiving work at different system events -> merged into the matching receiving service. Initial vs Recurring storage -> 'Billing event' option of the same storage service."),
    ("Customer-specific descriptions", "Descriptions such as 'Special Customer (HAMEL RENEWABLES)' / '(FACTORY MANUFACTURING)' / 'GREEN GLOBAL' are customer notes on generic codes; ignored for the catalog."),
    ("Hourly work", "About 20 hourly codes (rework, sorting, scanning, QC, clean-up, special project, service charge...) -> LB-01 General Hourly Labor (regular / overtime) + LB-02 Task-Specific Labor with a task option list, so invoices still show what the hours were for."),
    ("IT onboarding", "15 one-off IT project codes (kickoff, UAT, training, go-live meetings, WISE/BNP setup, EDI mapping) -> IT-02 Implementation with a phase option list; all are 'Direct Billing Approved', zero Sep-26 usage, normally quoted."),
    ("Internal adjustments", "Claims, discount, incentive, late fee, security deposit, misc -> FN-01...05, kept for completeness but excluded from customer quotes."),
    ("Code status", f"In use: {status_counts['In use']} codes; configured but not invoiced in Sep-26: {status_counts['Configured - not invoiced']}; master list only: {status_counts['Master list only']}. Unused codes are kept in the mapping so nothing is lost; they are candidates to retire."),
    ("B. GAPS - template line items with no billing code", None),
    ("D2C packaging add-ons", "Branded packaging, Fragile / tissue wrap, Insert / flier / sticker (D2C template) have no billing code -> shown as yellow rows under VA-01."),
    ("Pallet materials", "Pallet Grade A / Grade B and Corner boards (both templates) have no billing code -> yellow rows under MAT-01."),
    ("Monthly storage minimum", "No dedicated code; configured as a 'Minimum' condition on storage codes (ST-07)."),
    ("Palletized container receiving", "Flagged as a gap in the reference file; the system already supports it (HANDLING-0113 / 0120 'Palletized' + minimum per truckload) -> IN-02."),
    ("Transload", "Flagged as a gap in the reference file; the system has 25 transload codes (HANDLING-0003...0027) -> TL-01. None invoiced in Sep-26."),
    ("Drayage", "Drayage lanes, chassis, pier pass, detention etc. (B2B template, UNIS Transportation) are NOT in this billing-item list (only a drayage-claim code). Not included here - see open question 1."),
    ("C. DATA QUALITY OBSERVATIONS", None),
    ("Wide spreads", "ADMIN FEE ranges $25-$6,000; HANDLING-0067/0069/0114 max $1,400 (one special customer); Storage per sq ft minimums up to $150,000/month. Medians are used to limit the effect of these outliers."),
    ("Location-type storage", "STORAGE INCOME-0013 (capacity type: bin / rack / pallet) price-list descriptions do not say which location type each rate is for, so the median mixes types; D2C template values used for Small / Large bin."),
    ("Template inconsistencies", "IT hourly: B2B $150 vs D2C $200. Shipping label: B2B $0.60 vs D2C $0.40. Returns: B2B 'TBD' vs D2C $2.50/order + $0.75/item."),
    ("D. OPEN QUESTIONS (please confirm before Task 2)", None),
    ("Q1", "Should drayage (UNIS Transportation) be part of the quote page? If yes, it needs its own catalog (lane x container size + accessorials) - it is not in the billing-item file."),
    ("Q2", "Granularity: 69 services / 202 option lines. OK, or merge further (e.g. fold IN-03 flat unload into IN-01, ST-03/ST-06 into one 'Other storage basis' service)?"),
    ("Q3", f"Retire the {status_counts['Configured - not invoiced'] + status_counts['Master list only']} codes never invoiced in Sep-26 from the quote page (still kept in the mapping), or show them as 'advanced options'?"),
    ("Q4", "Reference rate: use the price-list median as the default quote price, or the current B2B / D2C template rate, where both exist?"),
    ("Q5", "Should the quote page have separate B2B (Retail) and D2C (Consumer) profiles that pre-select services (see 'Applies To' column), matching the two current templates?"),
]
r = 2
n = 0
for topic, note in notes:
    if note is None:
        c = ws.cell(r, 1, topic)
        c.font = Font(name=F, bold=True, size=10)
        for col in range(1, 4):
            ws.cell(r, col).fill = SEC_FILL
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=3)
    else:
        n += 1
        for col, v in enumerate([n, topic, note], 1):
            cell = ws.cell(r, col, v)
            cell.alignment = WRAP
            cell.font = Font(name=F, size=9, bold=(col == 2))
            cell.border = BORDER
    r += 1

for w in wb.worksheets:
    w.sheet_view.zoomScale = 110
wb.move_sheet("Scope & How-To", offset=-1)
wb.active = wb.index(wb["Scope & How-To"])
wb.save(OUT)
print("saved", OUT, "services", len(svc_rows), "lines", n_lines, status_counts)
