"""Aggregate 'All the customers price list' into per-line customer adoption + typical rate (one rate per customer)."""
import os, re, sys, statistics as st, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import source as SRC
import spec as v2  # line definitions (codes + description filters) from the v2 catalog

ROOT = SRC.ROOT
customers = sorted({r["customer"] for r in SRC.price_rows if r["customer"]})
by_code = collections.defaultdict(list)
for r in SRC.price_rows:
    by_code[r["code"]].append(r)


def per_customer(codes, inc=None, exc=None, ratetype="Unit Price"):
    """Median rate per customer for matching price-list rows (one rate per customer)."""
    per = collections.defaultdict(list)
    for code in codes:
        for r in by_code.get(code, []):
            if r["rate_type"] != ratetype:
                continue
            if inc and not re.search(inc, r["desc"], re.I):
                continue
            if exc and re.search(exc, r["desc"], re.I):
                continue
            if r["rate"] is not None and r["rate"] > 0:
                per[r["customer"]].append(r["rate"])
    return [st.median(v) for v in per.values()]


def summary(vals):
    if not vals:
        return dict(customers=0, median=None, p25=None, p75=None)
    q = st.quantiles(vals, n=4) if len(vals) >= 4 else [min(vals), 0, max(vals)]
    return dict(customers=len(vals), median=round(st.median(vals), 2), p25=round(q[0], 2), p75=round(q[2], 2))


def aggregate(ln):
    return summary(per_customer(ln["codes"], ln["inc"], ln["exc"], ln["ratetype"]))


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
    print(len(SRC.price_rows), "price-list rows;", len(customers), "customers")
    for l in sorted(LINES, key=lambda x: -x["customers"])[:70]:
        print(f'{l["customers"]:4} {100*l["customers"]/len(customers):5.1f}%  {l["sid"]:6} {l["line"][:30]:30} {l["opt"][:38]:38} med={l["median"]} [{l["p25"]}-{l["p75"]}]')
