"""Standard charge template: the standard proposal (all customers' price lists, one rate per customer, median)
expressed as quote selections, so it opens in the quote app as an editable, charge-code-mapped quote."""
from standard_proposal_data import LINES, customers

_med = {(l["sid"], l["opt"]): l["median"] for l in LINES}


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


def build():
    sel = {
        # inbound: floor-loaded case tiers; palletized containers at a flat rate; per pallet with a truckload minimum
        "IN-OFFLOAD": _on(
            conds={"offloadType": _c("Floor loaded", "Palletized")},
            units={"container": {"on": True, "driver": "caseCount", "flatOtherwise": True},
                   "pallet": {"on": True, "min": "load"}, "case": {"on": True}, "each": {"on": True}},
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
            units={"pallet": {"on": True}, "case": {"on": True}, "each": {"on": True}},
            prices={"pallet|B2B|p": m("OB-06", "Per full pallet"),
                    "case|B2B|p": m("OB-07", "0 - 30 lbs (standard)"), "case|D2C|p": m("OB-07", "0 - 30 lbs (standard)"),
                    "each|B2B|p": m("OB-08", "B2B / regular order"), "each|D2C|p": m("OB-08", "D2C / Drop-ship")}),
        "OB-ROUTING": _on(price=m("OB-13", "Per bill of lading")),
        # storage: initial at receipt + recurring monthly share one rate in the price lists
        "ST-STORAGE": _on(units={"pallet": {"on": True}, "sqft": {"on": True}, "cubic": {"on": True}},
                          prices={"pallet||p": m("ST-01", "Recurring - monthly"), "sqft||p": m("ST-05", "Location square footage"),
                                  "cubic||p": m("ST-06", "Per cubic foot")}),
        "RT-RETURN": _on(units={"each": {"on": True}}, prices={"each||p": m("RT-01", "Per item (piece)")}),
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
    }
    return {
        "customer": {"company": "Standard Charge Template", "code": "STANDARD", "channel": "Both"},
        "title": "Standard warehouse services rates",
        "note": f"Standard rates from all customers' price lists ({len(customers)} customers, median rate per line).",
        "selections": sel,
    }
