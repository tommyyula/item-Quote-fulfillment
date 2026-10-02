"""Standard charge template: the standard proposal (all customers' price lists, one rate per customer, median)
expressed as quote selections, so it opens in the quote app as an editable, charge-code-mapped quote."""
import statistics as st
from standard_proposal_data import LINES, customers, per_customer
import new_charges as NC

_med = {(l["sid"], l["opt"]): l["median"] for l in LINES}
_MIN = r"minimum|mini ?monthly|\bmin\b"
MIN_CUSTOMERS = 5  # below this a price-list median is too thin: the catalog benchmark default is used instead


def pc(codes, inc=None, exc=_MIN, rate_type="Unit Price"):
    """Median of per-customer medians for price-list rows of `codes` whose description matches `inc`."""
    vals = per_customer(codes, inc, exc, rate_type)
    return round(st.median(vals), 2) if len(vals) >= MIN_CUSTOMERS else None


def priced(d):
    """Drop cells without enough data (they fall back to the benchmark default)."""
    return {k: v for k, v in d.items() if v is not None}


def m(sid, opt):
    v = _med.get((sid, opt))
    assert v is not None, f"no price-list median for {sid} / {opt}"
    return v


def _on(**kw):
    s = {"on": True, "conds": {}, "units": {}, "prices": {}, "settings": {}}
    s.update(kw)
    return s


def _c(*values):
    return {"on": True, "values": list(values)}


H = lambda n: f"HANDLING-{n:04d}"
STACK = ["STORAGE INCOME-0011", "STORAGE INCOME-0024"]


def build():
    sel = {
        # inbound: floor-loaded case tiers; palletized containers at a flat rate; per pallet with a truckload minimum
        "IN-OFFLOAD": _on(
            conds={"offloadType": _c("Floor loaded", "Palletized")},
            units={"container": {"on": True, "driver": "caseCount", "flatOtherwise": True},
                   "pallet": {"on": True, "min": "load"}, "case": {"on": True}, "each": {"on": True}, "hour": {"on": True}},
            prices={
                "container|Floor loaded|0 - 500 cases|p": m("IN-01", "0 - 500 cases"),
                "container|Floor loaded|501 - 1,000 cases|p": m("IN-01", "501 - 1,000 cases"),
                "container|Floor loaded|1,001 - 1,500 cases|p": m("IN-01", "1,001 - 1,500 cases"),
                "container|Floor loaded|1,501 - 2,500 cases|p": m("IN-01", "2,001 - 2,500 cases"),
                "container|Floor loaded|Over 2,500 cases|p": m("IN-01", "Over 2,500 cases - base fee"),
                "container|Palletized||p": m("IN-03", "Any size (all containers)"),
                "pallet|Palletized|p": m("IN-02", "Single-SKU pallet (standard)"),
                "pallet|MIN|load": m("IN-02", "Minimum charge per truckload / container"),
                "case|Floor loaded|p": m("IN-04", "Per carton"),
                "each|Floor loaded|p": m("IN-04", "Per piece / each"),
                "hour|Floor loaded|p": pc([H(124)]), "hour|Palletized|p": pc([H(124)]),
            }),
        "IN-EXCESSCASE": _on(price=m("IN-01", "Each case over 2,500 (incremental)")),
        "IN-PUTAWAY": _on(units={"pallet": {"on": True}}, prices={"pallet||p": m("IN-10", "Per pallet")}),
        "IN-SHOTGUN": _on(price=m("IN-07", "Per carton")),
        "IN-SORT": _on(price=m("IN-08", "Per carton")),
        # outbound
        "OB-ORDER": _on(
            conds={"businessType": _c("B2B", "D2C"), "shipMethod": _c("Truckload", "LTL", "Small parcel")},
            units={"order": {"on": True}},
            prices={"order|B2B|Truckload|p": m("OB-01", "B2B - Truckload / LTL (incl. BOL & packing list)"),
                    "order|B2B|LTL|p": m("OB-01", "B2B - Truckload / LTL (incl. BOL & packing list)"),
                    "order|B2B|Small parcel|p": m("OB-01", "B2B - Small parcel"),
                    "order|D2C|Small parcel|p": m("OB-01", "D2C / Drop-ship order (no packing list)")}),
        "OB-PICK": _on(
            conds={"businessType": _c("B2B", "D2C")},
            units={"pallet": {"on": True}, "case": {"on": True}, "case#2": {"on": True, "driver": "caseWeight"},
                   "each": {"on": True}, "each#2": {"on": True, "driver": "unitWeight"},
                   "line": {"on": True}, "line#2": {"on": True, "driver": "unitWeight"}},
            prices=priced({"pallet|B2B|p": m("OB-06", "Per full pallet"),
                    "case|B2B|p": m("OB-07", "0 - 30 lbs (standard)"), "case|D2C|p": m("OB-07", "0 - 30 lbs (standard)"),
                    **{f"case#2|{ch}|{band}|p": pc([H(72)], rx) for ch in ("B2B", "D2C") for band, rx in
                       (("0 - 30 lbs", r"0 ?- ?30 lbs"), ("31 - 60 lbs", r"(30|31) ?- ?60 lbs|0 ?- ?60 lbs"), ("Over 60 lbs", r"over 60"))},
                    "each|B2B|p": m("OB-08", "B2B / regular order"), "each|D2C|p": m("OB-08", "D2C / Drop-ship"),
                    **{f"each#2|{ch}|{band}|p": pc([H(74)], rx) for ch in ("B2B", "D2C") for band, rx in
                       (("0 - 30 lbs", r"0 ?- ?30 lbs"), ("31 - 90 lbs", r"(30|31) ?- ?90"), ("Over 90 lbs", r"over 90"))},
                    "line|B2B|p": pc([H(68)], r"b2b|regular"), "line|D2C|p": pc([H(68)], r"drop ?ship|b2c"),
                    **{f"line#2|{ch}|{band}|p": pc([H(73)], rx) for ch in ("B2B", "D2C") for band, rx in
                       (("0 - 30 lbs", r"0 ?- ?30 lbs"), ("31 - 90 lbs", r"(30|31) ?- ?90"), ("Over 90 lbs", r"over 90"))}})),
        "OB-ROUTING": _on(price=m("OB-13", "Per bill of lading")),
        "OB-PACK": _on(units={"order": {"on": True}}, prices=priced({"order||p": pc([H(84)])})),
        # storage: initial at receipt + recurring monthly share one rate in the price lists
        "ST-STORAGE": _on(units={"pallet": {"on": True}, "pallet#2": {"on": True, "driver": "stack"}, "bin": {"on": True, "driver": "binSize"},
                                 "sqft": {"on": True}, "cubic": {"on": True}},
                          prices=priced({"pallet||p": m("ST-01", "Recurring - monthly"), "sqft||p": m("ST-05", "Location square footage"),
                                  "cubic||p": m("ST-06", "Per cubic foot"),
                                  "pallet#2|Rack position|p": pc(STACK, r"rack"), "pallet#2|Floor, 1-high (tall / oversize)|p": pc(STACK, r"\b1 high"),
                                  "pallet#2|Floor, 2-high|p": pc(STACK, r"\b2 high"), "pallet#2|Floor, 3-high|p": pc(STACK, r"\b3 high"),
                                  "pallet#2|Floor, 4-high +|p": pc(STACK, r"\b([4-9]|10) high")})),
        "RT-RETURN": _on(units={"package": {"on": True}, "each": {"on": True}, "hour": {"on": True}},
                         prices=priced({"package||p": pc([H(125)], r"return from end user"), "each||p": m("RT-01", "Per item (piece)"),
                                        "hour||p": pc([H(37)])})),
        "VA-SERIAL": _on(price=m("VA-04", "Per serial number")),
        "VA-PHOTO": _on(price=m("VA-05", "Per photo")),
        "VA-PACKSLIP": _on(price=m("DC-01", "Packing list")),
        # accessorials
        "OT-MANUALORDER": _on(price=m("OB-02", "Per order")),
        "OT-MANUALRCPT": _on(price=m("IN-11", "Manual entry - per receipt")),
        "OT-RUSH": _on(price=m("OB-03", "Rush outbound order")),
        "OT-CANCEL": _on(price=m("OB-04", "Canceled after picking (+ return-to-stock hourly)")),
        "OT-MISSEDAPPT": _on(price=m("OB-05", "Outbound - order")),
        "OT-NOASN": _on(price=m("IN-12", "Per receipt")),
        "OT-OSD": _on(price=m("IN-13", "Per hour")),
        "OT-LABOR": _on(price=m("LB-01", "Regular")),
        "OT-OT": _on(price=m("LB-01", "Overtime")),
        "OT-DOCS": _on(price=m("DC-01", "Customized / international shipping document")),
        "OT-COPIES": _on(price=m("DC-02", "Photocopy (B&W)")),
        "OT-YARD": _on(price=m("YD-01", "Container layover")),
        # IT & EDI, materials
        "SU-EDITX": _on(price=m("IT-05", "FTP transaction")),
        "SU-WMS": _on(price=m("IT-01", "Per user per month")),
        "OT-SUPPLIES": _on(price=m("MAT-02", "Any supplies")),
        "OT-PALLET-A": _on(price=pc(["ACCESSORIAL-0038"], r"Grade A Pallet")),
        "OT-PALLET-B": _on(price=pc(["ACCESSORIAL-0038"], r"Grade B Pallet")),
        "OT-WRAP": _on(price=pc(["ACCESSORIAL-0038"], r"Stretch Wrap")),
        "OT-STRAP": _on(price=pc(["ACCESSORIAL-0038"], r"Plastic Strapping")),
        "OT-CORNER": _on(price=pc(["ACCESSORIAL-0038"], r"Corner Board")),
        "OT-FREIGHT": _on(price=pc(["Small Parcel-0005"], None, _MIN, "Mark Up")),
        "SU-VAN": _on(price=pc([H(100)])),
    }
    # the most commonly used new charge ideas: no system code / price-list data yet -> benchmark price (new billing items)
    bench = {c[1]: c[7] for c in NC.CHARGES}
    sel.update({cid: _on(price=bench[cid]) for cid in NC.STANDARD})
    return {
        # bump when the template content changes: browsers holding an untouched older copy get it as a new version
        "version": "2026-10-01 (44 common billing items + 8 new charge ideas)",
        "customer": {"company": "Standard Charge Template", "code": "STANDARD", "channel": "Both"},
        "title": "Standard warehouse services rates",
        "note": f"Standard rates from all customers' price lists ({len(customers)} customers, median rate per line).",
        "selections": sel,
    }
