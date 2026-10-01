"""Standard UNIS Fulfillment Warehouse Services Proposal from 'All the customers price list'.

Inclusion: rate lines priced by >= THRESHOLD of customers (one rate per customer = median of that customer's price-list rows).
Rate shown: median across customers. Output: one self-contained HTML page (ITEM design, paper document, print-ready).
Only aggregates are written - no customer names.
"""
import base64, datetime, html, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from standard_proposal_data import LINES, customers, ROOT

THRESHOLD = 0.10
N = len(customers)
OUT = f"{ROOT}/workingfolder-output/UNIS Standard Warehouse Services Proposal.html"
ASSETS = f"{ROOT}/web/src/assets"

# lines left out on purpose, with the reason (shown in the internal appendix)
EXCLUDE = {
    ("IN-01", "1,501 - 2,000 cases"): "Few price lists split 1,501 - 2,000; the 1,501 - 2,500 band (which includes them) is used, as in the proposal template.",
    ("IN-03", "Per receipt (any equipment)"): "Mixes return receipts with freight receipts ($2.50 median); not a meaningful standard rate.",
    ("OB-01", "Regular order - ship method not specified"): "Catch-all variant of B2B order processing; the truckload / LTL and small-parcel rows already cover it.",
    ("OB-08", "Priced by unit weight band"): "Weight bands differ by customer; the D2C and B2B each-pick rows are the comparable standard.",
    ("ST-02", "Pallet position / mixed types (system median)"): "Price lists do not record the location type (bin / rack / pallet), so the median mixes different products.",
    ("ST-07", "Square-foot storage minimum"): "Minimums are customer-specific commitments; quoted per agreement.",
    ("ST-07", "Pallet storage minimum"): "Minimums are customer-specific commitments; quoted per agreement.",
}

# customer-facing presentation: (section, service, description, row label or None, unit text, merge key)
P = {
    ("IN-01", "0 - 500 cases"): ("inbound", "Floor-loaded container receiving", "Unload loose cartons, palletize (1 SKU per pallet) and receive into the WMS.", "Up to 500 cases", "per container", None),
    ("IN-01", "501 - 1,000 cases"): ("inbound", "Floor-loaded container receiving", "", "501 - 1,000 cases", "per container", None),
    ("IN-01", "1,001 - 1,500 cases"): ("inbound", "Floor-loaded container receiving", "", "1,001 - 1,500 cases", "per container", None),
    ("IN-01", "2,001 - 2,500 cases"): ("inbound", "Floor-loaded container receiving", "", "1,501 - 2,500 cases", "per container", None),
    ("IN-01", "Over 2,500 cases - base fee"): ("inbound", "Floor-loaded container receiving", "", "Over 2,500 cases (base)", "per container", None),
    ("IN-01", "Each case over 2,500 (incremental)"): ("inbound", "Floor-loaded container receiving", "", "Plus each case over 2,500", "per case", None),
    ("IN-03", "Any size (all containers)"): ("inbound", "Container receiving, flat rate", "One fee per container when case counts vary widely.", None, "per container", None),
    ("IN-02", "Single-SKU pallet (standard)"): ("inbound", "Palletized receiving", "Unload and receive pre-built pallets (1 SKU per pallet).", "Per pallet", "per pallet", None),
    ("IN-02", "Minimum charge per truckload / container"): ("inbound", "Palletized receiving", "", "Minimum charge", "per truckload / container", None),
    ("IN-04", "Per carton"): ("inbound", "Loose carton receiving", "Small parcel / LTL cartons counted and received.", None, "per carton", None),
    ("IN-04", "Per piece / each"): ("inbound", "Unit receiving", "Received and counted to each level.", None, "per unit", None),
    ("IN-07", "Per carton"): ("inbound", "Shotgun-loaded surcharge", "Cartons loose in the container, in addition to the receiving fee.", None, "per carton", None),
    ("IN-08", "Per carton"): ("inbound", "Sort and segregation", "Receipts with more than 5 SKUs per container.", None, "per carton", None),
    ("IN-10", "Per pallet"): ("inbound", "Put away to inventory", "Dock to storage location, confirmed in the WMS.", None, "per pallet", None),

    ("OB-01", "B2B - Truckload / LTL (incl. BOL & packing list)"): ("outbound", "Order processing", "Release, BOL and packing list (B2B) or shipping label (D2C), shipment confirmation.", "B2B, truckload / LTL", "per order", None),
    ("OB-01", "B2B - Small parcel"): ("outbound", "Order processing", "", "B2B, small parcel", "per order", None),
    ("OB-01", "D2C / Drop-ship order (no packing list)"): ("outbound", "Order processing", "", "D2C / drop-ship", "per order", None),
    ("OB-06", "Per full pallet"): ("outbound", "Full pallet pick", "Intact pallet of one SKU, pallet label included.", None, "per pallet", None),
    ("OB-07", "0 - 30 lbs (standard)"): ("outbound", "Case pick", "Full cartons up to 30 lbs.", None, "per case", None),
    ("OB-08", "D2C / Drop-ship"): ("outbound", "Each pick", "Units picked from an open case.", "D2C / drop-ship", "per unit", None),
    ("OB-08", "B2B / regular order"): ("outbound", "Each pick", "", "B2B order", "per unit", None),
    ("OB-13", "Per bill of lading"): ("outbound", "Routing to retailers", "Retailer routing request and appointment.", None, "per bill of lading", None),

    ("ST-01", "Initial - at receipt"): ("storage", "Pallet storage", "Pallet position up to 40x48x60 in, 1 SKU. Billed at receipt and on the 1st of each month.", None, "per pallet / month", "pallet-storage"),
    ("ST-01", "Recurring - monthly"): ("storage", "Pallet storage", "Pallet position up to 40x48x60 in, 1 SKU. Billed at receipt and on the 1st of each month.", None, "per pallet / month", "pallet-storage"),
    ("ST-05", "Location square footage"): ("storage", "Dedicated space", "Reserved floor area.", None, "per sq ft / month", None),
    ("ST-06", "Per cubic foot"): ("storage", "Cubic-foot storage", "Billed on the cube of inventory on hand.", None, "per cu ft / month", None),

    ("RT-01", "Per item (piece)"): ("returns", "Returned unit", "Receive, minor inspection, photo and report to the client.", None, "per unit", None),

    ("VA-04", "Per serial number"): ("vas", "Serial number tracking", "Scan and record serial numbers.", None, "per serial number", None),
    ("VA-05", "Per photo"): ("vas", "Photos on request", "Product or carton photos.", None, "per photo", None),

    ("OB-02", "Per order"): ("accessorial", "Manual order / receipt entry", "Keyed by a CSR when not received electronically.", None, "per order / receipt", "manual-entry"),
    ("IN-11", "Manual entry - per receipt"): ("accessorial", "Manual order / receipt entry", "Keyed by a CSR when not received electronically.", None, "per order / receipt", "manual-entry"),
    ("OB-03", "Rush outbound order"): ("accessorial", "Rush order", "Received after 11:00 a.m., shipped the same day.", None, "per order", None),
    ("OB-04", "Canceled after picking (+ return-to-stock hourly)"): ("accessorial", "Cancelled order", "Cancelled after picking; return to stock at the hourly rate.", None, "per order", None),
    ("OB-05", "Outbound - order"): ("accessorial", "Missed appointment", "Carrier misses a scheduled dock appointment.", None, "per occurrence", "missed"),
    ("OB-05", "Inbound - receipt / load"): ("accessorial", "Missed appointment", "Carrier misses a scheduled dock appointment.", None, "per occurrence", "missed"),
    ("IN-12", "Per receipt"): ("accessorial", "No ASN / packing list", "ASN required 5 days before arrival.", None, "per receipt", None),
    ("IN-13", "Per hour"): ("accessorial", "Damage documentation (OSD)", "Overage, shortage and damage reporting beyond routine receiving.", None, "per hour", None),
    ("LB-01", "Regular"): ("accessorial", "Hourly labor", "Work outside standard handling, billed in 15-minute increments.", None, "per hour", None),
    ("LB-01", "Overtime"): ("accessorial", "Overtime", "Client-requested after-hours work, 15-minute increments.", None, "per hour", None),
    ("DC-01", "Customized / international shipping document"): ("accessorial", "Customized shipping documents", "International BOL, commercial invoice or packing list.", None, "per document", None),
    ("DC-01", "Packing list"): ("accessorial", "Packing list", "Printed and inserted on request.", None, "per order", None),
    ("DC-02", "Photocopy (B&W)"): ("accessorial", "Photocopies", "Only when requested.", None, "per page", None),
    ("YD-01", "Container layover"): ("accessorial", "Container layover / yard storage", "Container held in the yard beyond free time.", None, "per container / day", None),

    ("IT-05", "FTP transaction"): ("it", "EDI / FTP transaction", "Each order, ship confirmation, ASN or file processed.", None, "per document", "edi"),
    ("IT-05", "EDI document (940 / 945 / 856 / 850)"): ("it", "EDI / FTP transaction", "Each order, ship confirmation, ASN or file processed.", None, "per document", "edi"),
    ("IT-01", "Per user per month"): ("it", "WMS / portal user", "Portal access, standard reports and maintenance.", None, "per user / month", None),

    ("MAT-02", "Any supplies"): ("materials", "Supplies", "Packaging and supplies purchased for the client.", None, "markup on cost", None),
}
SECTIONS = [("inbound", "Inbound handling"), ("outbound", "Outbound handling"), ("storage", "Storage"), ("returns", "Return program"),
            ("vas", "Value-added services"), ("accessorial", "Accessorial charges"), ("it", "IT and EDI"), ("materials", "Materials and other charges")]


def money(x, pct=False):
    if x is None:
        return "TBD"
    return f"{x * 100:.0f}%" if pct else f"${x:,.2f}"


selected, excluded, below = [], [], []
for l in LINES:
    key = (l["sid"], l["opt"])
    share = l["customers"] / N
    if key in EXCLUDE:
        if share >= THRESHOLD:
            excluded.append((l, EXCLUDE[key]))
        continue
    if share < THRESHOLD:
        if share >= 0.04:
            below.append(l)
        continue
    if key not in P:
        excluded.append((l, "No customer-facing wording defined (review)."))
        continue
    selected.append(l)

# keep complete tier sets: add sibling rows of a selected group even if slightly below the threshold
groups = {P[(l["sid"], l["opt"])][1] for l in selected}
for l in LINES:
    key = (l["sid"], l["opt"])
    if key in P and l not in selected and P[key][1] in groups and l["customers"] >= 0.05 * N and key not in EXCLUDE:
        selected.append(l)

# template sections that would be empty get their most common line if >= 5% of customers price it
for sec, _title in SECTIONS:
    if any(P[(l["sid"], l["opt"])][0] == sec for l in selected):
        continue
    cands = [l for l in LINES if (l["sid"], l["opt"]) in P and P[(l["sid"], l["opt"])][0] == sec
             and (l["sid"], l["opt"]) not in EXCLUDE and l["customers"] >= 0.05 * N]
    if cands:
        best = max(cands, key=lambda x: x["customers"])
        selected.append(best)
        if best in below:
            below.remove(best)

# build rows per section; merge synonyms that share a merge key and the same median
rows = {s: [] for s, _ in SECTIONS}
merged = {}
for l in sorted(selected, key=lambda x: list(P).index((x["sid"], x["opt"]))):
    sec, service, desc, label, unit, mkey = P[(l["sid"], l["opt"])]
    if mkey:
        if mkey in merged and merged[mkey]["median"] == l["median"]:
            merged[mkey]["customers"] = max(merged[mkey]["customers"], l["customers"])
            merged[mkey]["sources"].append(l)
            continue
        merged[mkey] = dict(l, sources=[l])
        rows[sec].append(dict(service=service, desc=desc, label=label, unit=unit, l=merged[mkey]))
    else:
        rows[sec].append(dict(service=service, desc=desc, label=label, unit=unit, l=l))


def section_html(sec, title):
    rs = rows[sec]
    if not rs:
        return ""
    out = [f'<section class="sec"><h3>{html.escape(title)}</h3><table class="rates"><caption class="sr">{html.escape(title)}</caption>'
           '<colgroup><col class="c1"><col class="c2"><col class="c3"><col class="c4"></colgroup>'
           '<thead><tr><th scope="col">Service</th><th scope="col">Description</th><th scope="col" class="r">Rate</th><th scope="col">Unit</th></tr></thead><tbody>']
    i = 0
    while i < len(rs):
        r = rs[i]
        j = i
        while j < len(rs) and rs[j]["service"] == r["service"]:  # consecutive rows of one service = one group
            j += 1
        group = rs[i:j]
        desc = next((g["desc"] for g in group if g["desc"]), "")
        if len(group) == 1 and not r["label"]:
            l = r["l"]
            out.append(f'<tr class="item"><td class="svc">{html.escape(r["service"])}</td><td class="desc">{html.escape(desc)}</td>'
                       f'<td class="r rate">{money(l["median"], l["pct"])}</td><td class="unit">{html.escape(r["unit"])}</td></tr>')
        else:
            out.append(f'<tr class="group"><td class="svc">{html.escape(r["service"])}</td><td class="desc">{html.escape(desc)}</td><td></td><td></td></tr>')
            for g in group:
                l = g["l"]
                out.append(f'<tr class="sub"><td class="svc sub">{html.escape(g["label"] or "")}</td><td></td>'
                           f'<td class="r rate">{money(l["median"], l["pct"])}</td><td class="unit">{html.escape(g["unit"])}</td></tr>')
        i += len(group)
    out.append("</tbody></table></section>")
    return "".join(out)


def appendix_html():
    def row(l, why=""):
        return (f'<tr><td>{html.escape(l["service"])}: {html.escape(l["opt"])}</td><td class="r">{l["customers"]}</td>'
                f'<td class="r">{100 * l["customers"] / N:.0f}%</td><td class="r">{money(l["median"], l["pct"])}</td>'
                f'<td class="r">{money(l["p25"], l["pct"])} - {money(l["p75"], l["pct"])}</td><td>{html.escape(", ".join(l["codes"][:3]))}{"..." if len(l["codes"]) > 3 else ""}</td>'
                + (f'<td>{html.escape(why)}</td>' if why else "") + "</tr>")
    inc = sorted(selected, key=lambda x: -x["customers"])
    head = '<tr><th scope="col">Rate line</th><th scope="col" class="r">Customers</th><th scope="col" class="r">Share</th><th scope="col" class="r">Median</th><th scope="col" class="r">P25 - P75</th><th scope="col">Charge codes</th>'
    return (f'<h3>Included ({len(inc)} rate lines)</h3><table class="ap"><thead>{head}</tr></thead><tbody>' + "".join(row(l) for l in inc) + "</tbody></table>"
            + f'<h3>Left out on purpose</h3><table class="ap"><thead>{head}<th scope="col">Reason</th></tr></thead><tbody>' + "".join(row(l, w) for l, w in excluded) + "</tbody></table>"
            + f'<h3>Close to the threshold (4% to 10% of customers)</h3><table class="ap"><thead>{head}</tr></thead><tbody>'
            + "".join(row(l) for l in sorted(below, key=lambda x: -x["customers"])) + "</tbody></table>")


font = base64.b64encode(open(f"{ASSETS}/fonts/Satoshi-Variable.ttf", "rb").read()).decode()
logo = open(f"{ASSETS}/brand/item-logo-fullcolor-blacktxt.svg").read()
logo_uri = "data:image/svg+xml;base64," + base64.b64encode(logo.encode()).decode()
today = datetime.date.today()
valid = today + datetime.timedelta(days=90)
n_included = sum(len(v) for v in rows.values())

page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>UNIS Standard Warehouse Services Proposal</title>
<style>
@font-face {{ font-family: "Satoshi"; src: url(data:font/ttf;base64,{font}) format("truetype"); font-weight: 300 900; font-display: swap; }}
:root {{ --bg: #fafafa; --ink: #181818; --soft: #666666; --rule: #e0e0e0; --strong: #181818; --primary: #763abf; --orange: #c2410c; --radius: 10px;
  --font: "Satoshi", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color-scheme: light; }}
* {{ box-sizing: border-box; }}
body {{ margin: 0; background: var(--bg); color: var(--ink); font: 400 14px/1.5 var(--font); -webkit-font-smoothing: antialiased; }}
.skip {{ position: absolute; left: -9999px; }} .skip:focus {{ left: 8px; top: 8px; background: #fff; padding: 8px; }}
.tools {{ max-width: 1000px; margin: 24px auto 12px; padding: 0 20px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }}
.tools h1 {{ font-size: 20px; margin: 0; font-weight: 600; flex: 1; min-width: 240px; }}
.btn {{ border: 1px solid var(--primary); background: var(--primary); color: #fff; border-radius: 6px; padding: 7px 14px; font: 500 13px var(--font); cursor: pointer; }}
.btn:focus-visible {{ outline: 2px solid var(--primary); outline-offset: 2px; }}
.doc {{ max-width: 1000px; margin: 0 auto; background: #fff; border-radius: var(--radius); padding: 40px 44px; }}
.head {{ display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid var(--strong); padding-bottom: 14px; margin-bottom: 16px; flex-wrap: wrap; }}
.brand {{ font-size: 22px; font-weight: 700; letter-spacing: -0.01em; }}
.title {{ font-size: 16px; font-weight: 500; }}
.meta th, .cust th {{ text-align: left; color: var(--soft); font-weight: 500; font-size: 12.5px; padding: 2px 12px 2px 0; white-space: nowrap; }}
.meta td, .cust td {{ padding: 2px 18px 2px 0; }}
.cust {{ width: 100%; margin-bottom: 18px; }}
.cust td.blank {{ border-bottom: 1px solid var(--rule); min-width: 160px; }}
.band {{ border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); padding: 8px 0; font-weight: 600; }}
.sec {{ margin-top: 22px; }}
.sec h3 {{ font-size: 16px; margin: 0 0 6px; font-weight: 600; }}
table.rates {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
col.c1 {{ width: 32%; }} col.c2 {{ width: 40%; }} col.c3 {{ width: 13%; }} col.c4 {{ width: 15%; }}
table.rates th {{ text-align: left; font-size: 12px; color: var(--soft); font-weight: 500; border-bottom: 1px solid var(--strong); padding: 5px 8px; }}
table.rates td {{ padding: 6px 8px; border-bottom: 1px solid var(--rule); vertical-align: top; }}
.r {{ text-align: right !important; }}
.svc {{ font-weight: 600; }} .svc.sub {{ font-weight: 400; padding-left: 24px !important; }}
tr.group td {{ border-bottom: 0; padding-bottom: 2px; }}
.desc, .unit {{ color: var(--soft); }}
.rate {{ font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 600; }}
.terms {{ font-size: 12.5px; color: var(--soft); margin-top: 22px; max-width: 76ch; }}
.sign {{ display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 30px; }}
.who {{ font-weight: 600; margin-bottom: 8px; }}
.line {{ border-bottom: 1px solid var(--strong); height: 32px; display: flex; align-items: flex-end; font-size: 11.5px; color: var(--soft); }}
.sr {{ position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }}
.appendix {{ max-width: 1000px; margin: 28px auto; padding: 0 20px; }}
.appendix h2 {{ font-size: 18px; margin: 0 0 4px; }}
.appendix h3 {{ font-size: 15px; margin: 18px 0 6px; }}
.appendix .flag {{ color: var(--orange); font-weight: 600; }}
.appendix p {{ max-width: 76ch; color: var(--soft); }}
table.ap {{ width: 100%; border-collapse: collapse; font-size: 12.5px; }}
table.ap th {{ text-align: left; color: var(--soft); font-weight: 500; border-bottom: 1px solid var(--strong); padding: 5px 8px 5px 0; }}
table.ap td {{ border-bottom: 1px solid var(--rule); padding: 5px 8px 5px 0; vertical-align: top; }}
footer {{ max-width: 1000px; margin: 0 auto; padding: 28px 20px 40px; display: flex; align-items: center; gap: 12px; color: var(--soft); font-size: 13px; }}
footer img {{ width: 120px; height: auto; display: block; }}
@media (max-width: 700px) {{ .doc {{ padding: 20px; border-radius: 0; }} .sign {{ grid-template-columns: 1fr; }} }}
@media print {{
  @page {{ margin: 12mm; }}
  body {{ background: #fff; }}
  .no-print {{ display: none !important; }}
  .doc {{ padding: 0; max-width: none; }}
  tr {{ page-break-inside: avoid; }}
}}
</style>
</head>
<body>
<a class="skip" href="#doc">Skip to the proposal</a>
<div class="tools no-print">
  <h1>Standard rate sheet</h1>
  <button class="btn" onclick="window.print()">Print / PDF</button>
</div>
<main id="doc" class="doc">
  <header class="head">
    <div>
      <div class="brand">UNIS Fulfillment</div>
      <div class="title">Warehouse Services Proposal</div>
      <div class="desc">Standard rates for the most common services</div>
    </div>
    <table class="meta">
      <tr><th scope="row">Date</th><td>{today:%b %-d, %Y}</td></tr>
      <tr><th scope="row">Valid until</th><td>{valid:%b %-d, %Y}</td></tr>
    </table>
  </header>
  <table class="cust">
    <tr><th scope="row">Company</th><td class="blank"></td><th scope="row">Contact</th><td class="blank"></td></tr>
    <tr><th scope="row">Address</th><td class="blank"></td><th scope="row">Phone</th><td class="blank"></td></tr>
    <tr><th scope="row">City, State, Zip</th><td class="blank"></td><th scope="row">Email</th><td class="blank"></td></tr>
  </table>
  <div class="band">Warehousing services billed through UNIS Fulfillment</div>
  {"".join(section_html(s, t) for s, t in SECTIONS)}
  <p class="terms">Rates are valid for 90 days from the proposal date and are subject to the Statement of Work (SOW). Services not listed,
  monthly minimums and drayage are quoted per agreement. Supplies purchased by UNIS are billed at cost plus the markup shown.
  A formal SOW defining SLAs, scope and detailed billing procedures follows after the rate sheet is signed.</p>
  <div class="sign">
    <div><div class="who">UNIS Fulfillment</div><div class="line">Signature</div><div class="line">Printed name</div><div class="line">Title</div><div class="line">Date</div></div>
    <div><div class="who">Customer</div><div class="line">Signature</div><div class="line">Printed name</div><div class="line">Title</div><div class="line">Date</div></div>
  </div>
</main>

<section class="appendix no-print" aria-labelledby="ap-h">
  <h2 id="ap-h">How this rate sheet was built</h2>
  <p class="flag">Internal: this appendix does not print.</p>
  <p>Source: the "All the customers price list" sheet, {len(customers)} customers. For every rate line, each customer counts once
  (the median of that customer's price-list rows, so customers with several price-list versions do not weigh more).
  A line is included when at least {THRESHOLD:.0%} of customers price it; the rate shown is the median across those customers.
  Tier sets are kept complete, and a template section that would otherwise be empty shows its most common line when at least 5% of customers price it.
  Synonymous rows with the same rate are merged (initial and recurring pallet storage,
  manual order and receipt entry, inbound and outbound missed appointments, EDI and FTP transactions).
  {n_included} rows on the sheet.</p>
  {appendix_html()}
</section>

<footer class="no-print">
  <span>Supported by</span>
  <a href="https://item.com" target="_blank" rel="noopener"><img src="{logo_uri}" alt="ITEM" width="120" height="47"></a>
</footer>
</body>
</html>
"""
open(OUT, "w").write(page)
print(f"wrote {OUT}\n{len(customers)} customers; {len(selected)} rate lines selected -> {n_included} rows; {len(excluded)} excluded; {len(below)} near threshold")
for s, t in SECTIONS:
    for r in rows[s]:
        print(f"  {t[:12]:12} {r['service'][:34]:34} {(r['label'] or ''):26} {money(r['l']['median'], r['l']['pct']):>10} {r['unit']}")
