"""Standard charge template: the standard proposal (all customers' price lists, one rate per customer, median)
expressed as quote selections, so it opens in the quote app as an editable, charge-code-mapped quote."""
import statistics as st
from standard_proposal_data import LINES, customers, per_customer

_med = {(l["sid"], l["opt"]): l["median"] for l in LINES}
_MIN = r"minimum|mini ?monthly|\bmin\b"
MIN_CUSTOMERS = 5  # below this a price-list median is too thin: the catalog benchmark default is used instead


def pc(codes, inc=None, exc=_MIN, rate_type="Unit Price"):
    """Median of per-customer medians for price-list rows of `codes` whose description matches `inc`."""
    vals = per_customer(codes, inc, exc, rate_type)
    return round(st.median(vals), 2) if len(vals) >= MIN_CUSTOMERS else None


def bench(cid, uid=None):
    """Catalog benchmark default (simple charge, or a builder unit's flat rate): used when too few customers price the code."""
    import model_v3 as M
    c = next(x for cat in M.CATEGORIES for x in cat["charges"] if x["id"] == cid)
    return c["default"] if uid is None else next(u["flat"] for u in c["units"] if u["id"] == uid)


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
# item-type (TV size) bands of the ST-STORAGE "each" driver -> sizes as written in the price-list descriptions
ITEM_BANDS = [('Up to 32"', r'\b(2\d|3[0-2])"'), ('37" - 43"', r'\b(3[7-9]|4[0-3])"'), ('46" - 50"', r'\b(4[6-9]|50)"'),
              ('55" - 60"', r'\b(5[5-9]|60)"'), ('65"', r'\b65"'), ('70" - 75"', r'\b(7[0-5])"'), ('80" - 86"', r'\b(8[0-6])"'),
              ('98" and larger', r'\b(9[8-9]|1\d\d)"')]


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

        # ---- 24 suggested additions (2026-10-01). Price = price-list median when >= 5 customers use the code, else the
        # catalog benchmark default, written in explicitly. HANDLING-0126 (palletized container offload) was already in IN-OFFLOAD above.
        "SU-EDI": _on(price=pc([H(194)]) or bench("SU-EDI")),
        "SU-SKU": _on(price=pc(["ACCESSORIAL-0014"]) or bench("SU-SKU")),
        "OT-RUSHRCPT": _on(price=pc([H(40)]) or bench("OT-RUSHRCPT")),
        "IN-TRANSLOAD": _on(units={"pallet": {"on": True}, "container": {"on": True}},
                            prices={"pallet||p": pc([H(11)]) or bench("IN-TRANSLOAD", "pallet"), "container||p": pc([H(23)]) or bench("IN-TRANSLOAD", "container")}),
        "IN-XDOCK": _on(price=pc([H(157)]) or bench("IN-XDOCK")),
        "IN-PALLETIZE": _on(price=pc([H(81)]) or bench("IN-PALLETIZE")),
        "OT-COUNT": _on(price=pc(["ACCESSORIAL-0010"]) or bench("OT-COUNT")),
        "OB-LABEL": _on(price=pc([H(155)]) or bench("OB-LABEL")),
        "OB-LOAD": _on(units={"pallet": {"on": True}, "case": {"on": True}},
                       prices={"pallet||p": pc([H(142)]) or bench("OB-LOAD", "pallet"), "case||p": pc([H(138)]) or bench("OB-LOAD", "case")}),
        "OT-CANCELPRE": _on(price=pc(["ACCESSORIAL-0001"]) or bench("OT-CANCELPRE")),
        "OT-ADDRESS": _on(price=pc(["ACCESSORIAL-0037"], None, _MIN, "Flat Rate") or bench("OT-ADDRESS")),
        "RT-INSPECT": _on(price=pc(["RMS-002"]) or bench("RT-INSPECT")),
        "RT-RESTOCK": _on(price=pc(["RMS-006"]) or bench("RT-RESTOCK")),
        "RT-DISPOSAL": _on(price=pc(["ACCESSORIAL-0011"]) or bench("RT-DISPOSAL")),
        "VA-KIT": _on(price=pc([H(208)]) or bench("VA-KIT")),
        "VA-FNSKU": _on(price=pc([H(184)]) or bench("VA-FNSKU")),
        "VA-RELABEL": _on(price=pc(["RELABELING"]) or bench("VA-RELABEL")),
        "VA-OVERBOX": _on(price=pc(["ACC-0003"]) or bench("VA-OVERBOX")),
        "OT-HOSTLER": _on(price=pc([H(250)]) or bench("OT-HOSTLER")),
    }
    # storage per item by item type (STORAGE INCOME-0010), current-period rows only (aged "over N days" rows excluded)
    aged = r"over \d+ days|minimum|\bmin\b"
    sel["ST-STORAGE"]["units"]["each"] = {"on": True, "driver": "itemSize"}
    sel["ST-STORAGE"]["prices"].update(priced({f"each|{band}|p": pc(["STORAGE INCOME-0010"], rx, aged) for band, rx in ITEM_BANDS}))
    # new charge ideas used by most warehouse clients (new_charges.STANDARD): no system code yet -> listed for billing setup
    import new_charges
    for cid, price in new_charges.STANDARD.items():
        sel[cid] = _on(price=price)
    sel["OB-PACK"]["units"]["case"] = {"on": True}
    sel["OB-PACK"]["prices"]["case||p"] = pc([H(85)]) or bench("OB-PACK", "case")
    return {
        # bump when the template content changes: browsers holding an untouched older copy get it as a new version
        "version": "2026-10-01d (44 common + 24 suggested + 11 new billing items)",
        "customer": {"company": "Standard Charge Template", "code": "STANDARD", "channel": "Both"},
        "title": "Standard warehouse services rates",
        "note": f"Standard rates from all customers' price lists ({len(customers)} customers, median rate per line).",
        "selections": sel,
    }
