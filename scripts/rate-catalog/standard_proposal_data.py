"""Aggregate 'All the customers price list' into per-line customer adoption + typical rate (one rate per customer)."""
import os, re, sys, statistics as st, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import openpyxl
import spec as v2  # line definitions (codes + description filters) from the v2 catalog

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
src = openpyxl.load_workbook(f"{ROOT}/workingfolder-input/Billing Items Usage Sep 2026 Final(1).xlsx", read_only=True, data_only=True)
rows = [r for r in src["All the customers price list"].iter_rows(min_row=2, values_only=True) if r[5]]
customers = sorted({r[0] for r in rows if r[0]})
by_code = collections.defaultdict(list)
for r in rows:
    by_code[r[5]].append(r)

def num(x):
    try:
        return float(str(x).replace("$", "").replace(",", ""))
    except (TypeError, ValueError):
        return None

def aggregate(ln):
    per_cust = collections.defaultdict(list)
    for code in ln["codes"]:
        for r in by_code.get(code, []):
            if (r[10] or "") != ln["ratetype"]:
                continue
            d = str(r[7] or "").strip()
            if ln["inc"] and not re.search(ln["inc"], d, re.I):
                continue
            if ln["exc"] and re.search(ln["exc"], d, re.I):
                continue
            v = num(r[11])
            if v is not None and v > 0:
                per_cust[r[0]].append(v)
    vals = [st.median(v) for v in per_cust.values()]  # one rate per customer
    if not vals:
        return dict(customers=0, median=None, p25=None, p75=None)
    q = st.quantiles(vals, n=4) if len(vals) >= 4 else [min(vals), 0, max(vals)]
    return dict(customers=len(vals), median=round(st.median(vals), 2), p25=round(q[0], 2), p75=round(q[2], 2))

LINES = []
for title, services in v2.SECTIONS:
    for s in services:
        for ln in s["lines"]:
            if not ln["codes"]:
                continue
            LINES.append(dict(section=title, sid=s["id"], service=s["name"], what=s["activity"], trigger=s["trigger"],
                              line=ln["line"], opt=ln["opt"], unit=ln["unit"], dim=ln["dim"], pct=ln["ratetype"] == "Mark Up",
                              codes=ln["codes"], **aggregate(ln)))

if __name__ == "__main__":
    print(len(rows), "price-list rows;", len(customers), "customers")
    for l in sorted(LINES, key=lambda x: -x["customers"])[:70]:
        print(f'{l["customers"]:4} {100*l["customers"]/len(customers):5.1f}%  {l["sid"]:6} {l["line"][:30]:30} {l["opt"][:38]:38} med={l["median"]} [{l["p25"]}-{l["p75"]}]')
