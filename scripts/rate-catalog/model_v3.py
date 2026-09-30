"""Rate card model v3 - 'charge builder' structure for the Quotation webform.

Category -> Charge.  A charge is either
  simple : one price line (unit + benchmark default), or
  builder: progressive questions modelled on the billing engine's rule conditions:
     1. conditions  - "Does the rate differ by ...?"  (facility, title, carrier, receipt type, ship method, offload type ...)
     2. units       - "Charge per ..."  (container, pallet, case, each, hour, receipt, cubic, weight ...)
     3. drivers     - per unit, "Price varies by ..." : an attribute (container size, pallet size, item size ...)
                      or a volume tier (case count, SKU count, pallet count ...).  Progressive mode = pick ONE.
     4. minimum     - per receipt / container / load / order / month
     5. second      - different rate for additional units (first / additional)
  'when' rules hide units / drivers that do not apply to the condition values already chosen
  (e.g. offload type = Palletized only -> no case / each units, no case-count or SKU-count tiers).
Defaults are benchmark prices (UNIS price-list median / current template / industry midpoint - see v2 workbook).
"""

FACILITIES = ["Buena Park, CA", "Riverside, CA", "Hayward / Sacramento, CA", "Tacoma, WA", "Phoenix, AZ", "Reno, NV",
              "Dallas, TX", "Houston, TX", "Chicago (Joliet), IL", "Indianapolis, IN", "Atlanta, GA", "Savannah, GA",
              "Norfolk, VA", "Northampton, PA"]
FLOOR = ["Floor loaded", "Shotgun"]
PALLET = ["Palletized", "Slip sheet"]


def v(label, d=None):
    return {"v": label, "d": d}


def cond(cid, label, values, common=False, free=False, help=""):
    return {"id": cid, "label": label, "values": values, "common": common, "free": free, "help": help}


def drv(did, label, kind, values, when=None, calc=False, help=""):
    """kind: attr | volume.  calc=True -> ask Range vs Incremental tier calculation (engine CalculationOption)."""
    return {"id": did, "label": label, "kind": kind, "values": values, "when": when or {}, "calc": calc, "help": help}


def unit(uid, label, flat, lo, hi, basis, drivers=(), mins=(), second=False, common=True, when=None, by=None, min_default=None, note="", by_combo=()):
    """by = {condId: {value: default}};  by_combo = [({condId: value, ...}, default)] - most specific, checked first."""
    return {"id": uid, "label": label, "flat": flat, "lo": lo, "hi": hi, "basis": basis, "drivers": list(drivers),
            "mins": list(mins), "second": second, "common": common, "when": when or {}, "by": by or {},
            "byCombo": [{"when": w, "d": d} for w, d in by_combo], "minDefault": min_default or {}, "note": note}


def builder(cid, name, desc, conds, units, settings=(), tier="main", channel="Both", triggers=(), codes=(), invalid=()):
    """invalid = combinations of condition values that cannot occur (never generated as rate rows)."""
    return {"id": cid, "kind": "builder", "name": name, "desc": desc, "conds": conds, "units": units,
            "settings": list(settings), "tier": tier, "channel": channel, "triggers": list(triggers), "codes": list(codes),
            "invalid": list(invalid)}

# D2C orders ship by small parcel only
D2C_PARCEL_ONLY = [{"businessType": ["D2C"], "shipMethod": ["Truckload", "LTL", "Will call"]}]


def simple(cid, name, desc, unit_, default, lo, hi, basis, channel="Both", tier="main", pct=False, new=False, codes=()):
    return {"id": cid, "kind": "simple", "name": name, "desc": desc, "unit": unit_, "default": default, "lo": lo, "hi": hi,
            "basis": basis, "channel": channel, "tier": tier, "pct": pct, "new": new, "codes": list(codes)}


# ------------------------------------------------------------------ shared condition sets
C_FACILITY = cond("facility", "Facility", FACILITIES, help="Different price per UNIS building.")
C_TITLE = cond("title", "Title / brand", [], free=True, help="Client inventory title or brand (sub-account) - type values.")
C_CARRIER = cond("carrier", "Carrier", ["UPS", "FedEx", "USPS", "DHL", "Amazon", "LSO", "Customer pick-up"], help="Inbound or outbound carrier.")
C_SHIP_IN = cond("shipMethod", "Ship method", ["Truckload / container", "LTL", "LCL", "Small parcel", "Will call"], common=True)
C_SHIP_OUT = cond("shipMethod", "Ship method", ["Truckload", "LTL", "Small parcel", "Will call"], common=True)
C_RECEIPT = cond("receiptType", "Receipt type", ["Regular", "Customer return", "Retailer return", "Transload", "Cross-dock"])
C_OFFLOAD = cond("offloadType", "Offload type", ["Floor loaded", "Palletized", "Shotgun", "Slip sheet"], common=True,
                 help="How the freight is loaded in the container / trailer. Drives which units make sense.")
C_BIZ = cond("businessType", "Channel (B2B / D2C)", ["B2B", "D2C"], common=True, help="Wholesale / retail vs direct-to-consumer.")
C_ORDERTYPE = cond("orderType", "Order type", ["Regular", "Drop-ship", "Transload", "Cross-dock"])
C_RETAILER = cond("retailer", "Retailer / sales channel", ["Amazon", "Walmart", "Costco", "Target", "Shopify", "Other"], help="Retailer-specific pricing.")
C_TEMP = cond("temperature", "Temperature zone", ["Dry / ambient", "Cooler"], common=True)

CONTAINER_SIZES = [v("20'", 425), v("40'", 600), v("40' HC", 625), v("45'", 650), v("48' trailer", 575), v("53' trailer", 575)]
CASE_BANDS = [v("0 - 500 cases", 490), v("501 - 1,000 cases", 520), v("1,001 - 1,500 cases", 550), v("1,501 - 2,500 cases", 610), v("Over 2,500 cases", 630)]
SKU_BANDS = [v("1 - 5 SKUs", None), v("6 - 10 SKUs", None), v("11 - 25 SKUs", None), v("Over 25 SKUs", None)]
PALLET_BANDS_CNTR = [v("1 - 20 pallets", 490), v("21 - 40 pallets", 590), v("Over 40 pallets", 650)]
PALLET_BANDS = [v("1 - 20 pallets", 10.5), v("21 - 40 pallets", 9.5), v("Over 40 pallets", 8.5)]
TV = [v('Up to 32"', 1.36), v('37" - 43"', 2.40), v('46" - 50"', 4.32), v('55" - 60"', 3.85), v('65"', 5.05), v('70" - 75"', 7.72), v('80" - 86"', 11.32), v('98" and larger', None)]
TV_ST = [v('Up to 32"', 0.40), v('37" - 43"', 0.68), v('46" - 50"', 1.18), v('55" - 60"', 1.66), v('65"', 2.90), v('70" - 75"', 3.65), v('80" - 86"', 5.80), v('98" and larger', None)]
MINS_RCV = ["receipt", "container", "load"]

CATEGORIES = []


def category(cid, name, desc, charges):
    CATEGORIES.append({"id": cid, "name": name, "desc": desc, "charges": charges})


# ================================================================== 1. SETUP & SYSTEMS
category("setup", "Setup & Systems", "One-time onboarding and ongoing system access.", [
    simple("SU-SETUP", "Account setup & implementation", "Kickoff, WMS & billing setup, SOPs, training, UAT and go-live.", "One-time", 1000, 500, 2500, "Industry midpoint"),
    simple("SU-ITEM", "Initial item-master import", "Load the client's SKU list from a spreadsheet at onboarding.", "One-time", 300, 0, 500, "UNIS template"),
    simple("SU-SKU", "Additional SKU setup", "Each SKU created manually after go-live, incl. dims / weight.", "SKU", 5.75, 1, 6, "UNIS template"),
    simple("SU-WMS", "WMS / portal user", "Portal login, standard reports, system maintenance.", "User / month", 175, 100, 250, "UNIS median (n=92)"),
    simple("SU-EDI", "EDI setup - per trading partner", "Map, test and certify the standard EDI document set for one partner.", "Trading partner", 2500, 1500, 5000, "Industry midpoint", channel="B2B"),
    simple("SU-ECOM", "E-commerce platform connection", "Connect a store / marketplace (Shopify, Amazon, Walmart ...).", "Connection", 250, 0, 500, "Industry midpoint", channel="D2C", new=True),
    simple("SU-EDITX", "EDI / FTP transaction", "Each 940 / 945 / 856 / 850 document or FTP file processed.", "Document", 0.50, 0.25, 1.00, "UNIS median (n=1,385)", tier="advanced"),
    simple("SU-VAN", "EDI VAN charges", "VAN provider cost re-billed plus markup.", "% on cost", 0.20, 0, 0.20, "UNIS template", tier="advanced", pct=True),
    simple("SU-RETAILER", "Retailer label & document setup", "Configure retailer-specific carton labels, packing slips and routing docs.", "Retailer", 625, 250, 1000, "Industry midpoint", channel="B2B", tier="advanced"),
    simple("SU-IT", "IT support / development", "Custom reports, workflow or integration changes; 15-min increments.", "Hour", 150, 125, 200, "UNIS template", tier="advanced"),
    simple("SU-ENT", "Enterprise WMS subscription", "Unlimited users, dedicated environment.", "Entity / year", 18000, 10000, 25000, "UNIS price list (n=2)", tier="advanced"),
])

# ================================================================== 2. INBOUND
category("inbound", "Inbound", "Receiving freight into the warehouse.", [
    builder("IN-OFFLOAD", "Offload / Receiving",
            "Unload the container, trailer or parcel delivery, count, label and receive into the WMS.",
            [C_OFFLOAD, C_SHIP_IN, C_RECEIPT, C_FACILITY, C_TITLE, C_CARRIER],
            [unit("container", "Container", 550, 350, 900, "UNIS case-tier medians / industry",
                  [drv("containerSize", "Container size", "attr", CONTAINER_SIZES),
                   drv("caseCount", "Case count in container", "volume", CASE_BANDS, when={"offloadType": FLOOR}, calc=True,
                       help="Range: whole container priced at its band. Incremental: base + per-case over the top band."),
                   drv("skuCount", "SKU count in container", "volume", SKU_BANDS, when={"offloadType": FLOOR}, calc=True),
                   drv("palletCount", "Pallet count in container", "volume", PALLET_BANDS_CNTR, when={"offloadType": PALLET}, calc=True)],
                  second=True, by={"offloadType": {"Palletized": 400, "Slip sheet": 450, "Shotgun": 650}}),
             unit("pallet", "Pallet", 10.50, 8, 15, "UNIS median (n=779)",
                  [drv("palletSize", "Pallet size", "attr", [v("Standard (48x40)", 10.5), v("Oversize", 16)]),
                   drv("palletMix", "Full / partial / mixed pallet", "attr", [v("Full pallet, single SKU", 10.5), v("Partial pallet", 10.5), v("Mixed-SKU pallet", 14)]),
                   drv("containerSize", "Container size", "attr", [v(x["v"], None) for x in CONTAINER_SIZES]),
                   drv("palletCount", "Pallet count per receipt", "volume", PALLET_BANDS, calc=True)],
                  mins=MINS_RCV, second=True, when={"offloadType": PALLET}, min_default={"load": 325, "container": 325, "receipt": 150}),
             unit("case", "Case / carton", 0.35, 0.25, 1.25, "UNIS median (n=494)",
                  [drv("caseWeight", "Case weight", "attr", [v("0 - 50 lbs", 0.35), v("51 - 80 lbs", 0.60), v("Over 80 lbs", 1.25)]),
                   drv("containerSize", "Container size", "attr", [v(x["v"], None) for x in CONTAINER_SIZES]),
                   drv("caseCount", "Case count per receipt", "volume", CASE_BANDS[:1] + [v("Over 500 cases", 0.30)], calc=True),
                   drv("skuCount", "SKU count per receipt", "volume", SKU_BANDS, calc=True)],
                  mins=MINS_RCV, second=True, when={"offloadType": FLOOR}, min_default={"container": 325, "receipt": 50, "load": 325}),
             unit("each", "Each / unit", 0.30, 0.15, 0.50, "Industry midpoint",
                  [drv("itemSize", "Item type / size (e.g. TV screen size)", "attr", TV),
                   drv("eachCount", "Units per receipt", "volume", [v("1 - 1,000 units", 0.30), v("Over 1,000 units", 0.25)], calc=True)],
                  mins=MINS_RCV, second=True, when={"offloadType": FLOOR}, min_default={"receipt": 50}),
             unit("hour", "Labor hour", 50, 40, 60, "UNIS median (n=412)",
                  [drv("hours", "Hours per receipt", "volume", [v("First hour", 50), v("Each additional hour", 45)])],
                  mins=MINS_RCV, min_default={"receipt": 45}, note="D2C template: inbound & stow $45/hr."),
             unit("receipt", "Receipt (flat)", 50, 25, 150, "Industry midpoint", common=False, second=True),
             unit("cubic", "Cubic foot", 0.23, 0.15, 0.40, "UNIS median (n=62)",
                  [drv("cubicVol", "Cubic feet per receipt", "volume", [v("0 - 1,000 cu ft", 0.23), v("Over 1,000 cu ft", 0.18)], calc=True)], mins=MINS_RCV, common=False),
             unit("weight", "Weight (per 100 lb)", 1.00, 0.50, 2.00, "Industry midpoint",
                  [drv("weightVol", "Weight per receipt", "volume", [v("0 - 10,000 lb", 1.00), v("Over 10,000 lb", 0.80)], calc=True)], mins=MINS_RCV, common=False)],
            triggers=["Offload", "Billed Upon Receipt"], codes=["HANDLING-0252", "HANDLING-0188"]),
    builder("IN-PUTAWAY", "Put away",
            "Move received freight from the dock to its storage location and confirm in the WMS.",
            [C_OFFLOAD, C_FACILITY],
            [unit("pallet", "Pallet", 4.50, 3, 6, "UNIS median (n=330)"),
             unit("case", "Case / carton", 0.15, 0.10, 0.30, "Industry midpoint", common=False),
             unit("each", "Each", 0.05, 0.02, 0.10, "Industry midpoint", common=False)],
            triggers=["Put Away"]),
    builder("IN-TRANSLOAD", "Transload", "Unload an inbound container and reload onto outbound trailers without storage.",
            [C_OFFLOAD, C_SHIP_IN, C_FACILITY],
            [unit("container", "Container", 575, 350, 650, "UNIS median (n=151)",
                  [drv("containerSize", "Container size", "attr", [v("20'", 350), v("40'", 575), v("40' HC", 600), v("53' trailer", 575)]),
                   drv("caseCount", "Case count in container", "volume", [v("0 - 1,000 cases", 580), v("1,001 - 3,000 cases", 745), v("Over 3,000 cases", 750)], when={"offloadType": FLOOR}, calc=True),
                   drv("palletCount", "Pallet count in container", "volume", [v("1 - 20 pallets", 470), v("Over 20 pallets", 590)], when={"offloadType": PALLET}, calc=True)]),
             unit("pallet", "Pallet", 10.50, 6, 12, "UNIS median (n=5)", when={"offloadType": PALLET}),
             unit("case", "Case / carton", 0.45, 0.25, 0.60, "UNIS median (n=48)", when={"offloadType": FLOOR}),
             unit("hour", "Labor hour", 50, 40, 60, "UNIS labor rate", common=False)],
            tier="advanced", channel="B2B", triggers=["Transload"]),
    simple("IN-XDOCK", "Cross-dock (per pallet)", "Receive and ship pallets through the dock without storage.", "Pallet", 8.50, 5, 12, "Industry midpoint", channel="B2B", tier="advanced"),
    simple("IN-SORT", "Sort & segregation", "Sort commingled cartons by SKU / lot when a receipt has more than 5 SKUs.", "Carton", 0.25, 0.15, 0.50, "UNIS median (n=425)", channel="B2B", tier="advanced"),
    simple("IN-SHOTGUN", "Shotgun-loaded surcharge", "Extra labor for cartons thrown loose into the container.", "Carton", 0.35, 0.25, 0.60, "UNIS median (n=97)", channel="B2B", tier="advanced"),
    simple("IN-PALLETIZE", "Re-palletize / pallet rebuild", "Rebuild damaged or non-standard pallets to warehouse standard.", "Pallet", 9.25, 6, 15, "UNIS median (n=14)", channel="B2B", tier="advanced"),
    simple("IN-LOT", "Lot / expiry capture", "Record lot number / expiry at receipt for FIFO / FEFO.", "Carton", 0.20, 0.10, 0.30, "Industry midpoint", tier="advanced", new=True),
])

# ================================================================== 3. OUTBOUND
category("outbound", "Outbound", "Order processing, picking, packing and shipping - B2B and D2C.", [
    builder("OB-ORDER", "Order processing",
            "Release the order, print BOL / packing list (B2B) or shipping label (D2C), confirm shipment.",
            [C_BIZ, C_SHIP_OUT, C_ORDERTYPE, C_RETAILER, C_CARRIER, C_FACILITY, C_TITLE],
            [unit("order", "Order", 20, 1.5, 25, "UNIS median B2B (n=1,069) / D2C (n=782)",
                  [drv("orderWeight", "Package weight", "attr", [v("0 - 5 lbs", 2.50), v("5 - 10 lbs", 3.50), v("10 - 30 lbs", 5.25), v("Over 30 lbs", None)],
                       when={"businessType": ["D2C"]}, help="D2C template: under 1 lb $2, 5-10 lb $3."),
                   drv("orderVolume", "Monthly order volume", "volume", [v("0 - 3,500 orders", None), v("3,501 - 10,000 orders", None), v("Over 10,000 orders", None)], calc=True)],
                  by={"businessType": {"B2B": 20, "D2C": 2.50}}, by_combo=[({"businessType": "B2B", "shipMethod": "Small parcel"}, 3.00)]),
             unit("load", "Load / shipment", 25, 15, 50, "UNIS median (n=5)", common=False),
             unit("line", "Order line", 1.75, 0.50, 3.00, "Industry midpoint", common=False),
             unit("case", "Carton shipped", 3.00, 1.00, 4.00, "UNIS median (n=11)", common=False)],
            triggers=["Order Processing"], invalid=D2C_PARCEL_ONLY),
    builder("OB-PICK", "Picking",
            "Pick the ordered pallets, cartons or units and stage them for packing / shipping.",
            [C_BIZ, C_SHIP_OUT, C_RETAILER, C_ORDERTYPE, C_FACILITY, C_TITLE],
            [unit("pallet", "Full pallet", 9.00, 6, 15, "UNIS median (n=474)",
                  [drv("palletCount", "Pallets per order", "volume", [v("1 - 12 pallets", 9.00), v("Over 12 pallets", 8.00)], calc=True)],
                  mins=["order"], when={"businessType": ["B2B"]}),
             unit("case", "Case / carton", 1.05, 0.50, 1.75, "UNIS median (n=800)",
                  [drv("caseWeight", "Case weight", "attr", [v("0 - 30 lbs", 1.05), v("31 - 60 lbs", 1.50), v("Over 60 lbs", 10.50)]),
                   drv("caseCount", "Cases per order", "volume", [v("1 - 50 cases", 1.05), v("Over 50 cases", 0.90)], calc=True)],
                  mins=["order"], second=True, min_default={"order": 20}),
             unit("each", "Each / unit", 0.50, 0.25, 1.25, "UNIS median D2C (n=156)",
                  [drv("unitWeight", "Unit weight", "attr", [v("0 - 5 lbs", 0.50), v("5 - 30 lbs", 0.75), v("Over 30 lbs", 1.50)]),
                   drv("orderWeight", "Order weight", "attr", [v("0 - 30 lbs", 0.50), v("30 - 90 lbs", 1.00), v("Over 90 lbs", 2.00)])],
                  mins=["order"], second=True, by={"businessType": {"B2B": 1.05, "D2C": 0.50}},
                  note="First / additional split = industry 'pick & pack' style (first $3.00 incl. order, additional $0.75)."),
             unit("inner", "Inner pack", 0.60, 0.40, 1.00, "UNIS median (n=27)", common=False),
             unit("order", "Order (flat)", 6.50, 2, 25, "UNIS median (n=7)", common=False),
             unit("weight", "Weight / volume (bulk)", 0.20, 0.10, 0.40, "UNIS median cu ft (n=40)", common=False)],
            triggers=["Pick"], invalid=D2C_PARCEL_ONLY),
    builder("OB-PACK", "Packing", "Pack picked items into a shipping carton / mailer.",
            [C_BIZ, C_SHIP_OUT],
            [unit("order", "Order", 0.50, 0.35, 1.00, "UNIS median (n=41)"),
             unit("case", "Carton packed", 0.50, 0.35, 1.25, "UNIS median (n=8)")],
            triggers=["Packing"], invalid=D2C_PARCEL_ONLY),
    simple("OB-LABEL", "Shipping label - print & apply", "UCC-128 / carrier label printed and applied, or client label applied.", "Label", 0.30, 0.25, 0.75, "UNIS median (n=79)", codes=[]),
    simple("OB-ROUTING", "Routing / retailer compliance", "Retailer routing request and appointment through the retailer portal.", "BOL", 7.50, 7.50, 25, "UNIS median (n=526)", channel="B2B"),
    simple("OB-PALLETBUILD", "Outbound pallet build & wrap", "Build a shipping pallet from picked cartons, wrap and label.", "Pallet", 5.60, 5, 12, "UNIS median (n=6)", channel="B2B"),
    builder("OB-LOAD", "Outbound loading", "Floor-load or pallet-load the outbound trailer / container.",
            [C_SHIP_OUT, C_FACILITY],
            [unit("container", "Container / trailer", 475, 300, 650, "Industry midpoint",
                  [drv("containerSize", "Container size", "attr", [v(x["v"], None) for x in CONTAINER_SIZES]),
                   drv("caseCount", "Cases loaded", "volume", [v("0 - 500 cases", None), v("501 - 1,500 cases", None), v("Over 1,500 cases", None)], calc=True)]),
             unit("pallet", "Pallet", 5.60, 4, 9, "UNIS median (n=6)"),
             unit("case", "Case (floor-loaded)", 2.62, 2, 3.5, "UNIS median (n=4)")],
            tier="advanced", channel="B2B", triggers=["Loading"]),
])

# ================================================================== 4. STORAGE
category("storage", "Storage", "Where and how inventory is stored, billed per period.", [
    builder("ST-STORAGE", "Storage",
            "Store inventory in pallet positions, bins, dedicated space or by volume.",
            [C_TEMP, C_FACILITY, C_TITLE],
            [unit("pallet", "Pallet position", 14, 12, 30, "UNIS median (n=1,037); template $22",
                  [drv("stack", "Stack height / location", "attr", [v("Rack position", 15.50), v("Floor, 1-high (tall / oversize)", 27.80), v("Floor, 2-high", 16.50), v("Floor, 3-high", 12.00), v("Floor, 4-high +", 8.25)]),
                   drv("palletSize", "Pallet size", "attr", [v("Standard (48x40, up to 60 in high)", 14), v("Oversize", 26)]),
                   drv("aging", "Days in storage", "volume", [v("0 - 180 days", 14), v("Over 180 days (aged)", 21)])],
                  mins=["month"], min_default={"month": 7250}),
             unit("bin", "Bin / shelf location", 4, 3, 12, "UNIS D2C template",
                  [drv("binSize", "Location type", "attr", [v("Small bin", 4), v("Large bin", 8), v("Shelf / rack", 11)])], mins=["month"]),
             unit("each", "Each / unit", 0.68, 0.30, 6, "UNIS median (TV)",
                  [drv("itemSize", "Item type / size (e.g. TV screen size)", "attr", TV_ST)], mins=["month"]),
             unit("sqft", "Square foot (dedicated space)", 1.25, 0.90, 1.75, "UNIS median (n=192)", mins=["month"], min_default={"month": 7250}),
             unit("cubic", "Cubic foot", 0.55, 0.30, 0.85, "Industry midpoint", mins=["month"], common=False),
             unit("case", "Case / carton", 0.30, 0.10, 0.50, "Industry midpoint", common=False),
             unit("weight", "Weight", 8.47, 5, 30, "UNIS median (n=8)", common=False)],
            settings=[{"id": "initial", "label": "Initial storage at receipt", "options": ["Full month at receipt", "Half month if received on / after the 15th", "No initial charge - recurring only"]},
                      {"id": "cycle", "label": "Recurring billing cycle", "options": ["Monthly (1st of month)", "Semi-monthly", "Weekly", "Daily"]}],
            triggers=["Recurring Storage", "Initial Storage"], codes=["STORAGE INCOME-0028", "Sublease Revenue-0001"]),
])

# ================================================================== 5. RETURNS
category("returns", "Returns", "Receiving and dispositioning returned goods.", [
    builder("RT-RETURN", "Returns processing",
            "Receive the return, minor inspection, photo, report to client, hold for disposition.",
            [cond("returnType", "Return type", ["Consumer return (D2C)", "Retailer return (B2B)"], common=True), C_FACILITY, C_TITLE],
            [unit("package", "Package / tracking #", 2.50, 2, 4, "UNIS D2C template", when={"returnType": ["Consumer return (D2C)"]}),
             unit("each", "Item", 0.85, 0.50, 1.50, "UNIS median (n=181)", second=True),
             unit("case", "Carton", 2.50, 1.50, 4, "UNIS median (n=141)", when={"returnType": ["Retailer return (B2B)"]}),
             unit("pallet", "Pallet", 14, 8, 20, "Industry midpoint", when={"returnType": ["Retailer return (B2B)"]}, common=False),
             unit("hour", "Labor hour", 42, 38, 55, "UNIS median (n=11)", common=False)],
            triggers=["Return"], codes=["RMS-001"]),
    simple("RT-INSPECT", "Detailed inspection / grading", "Test and grade returned units beyond the minor check.", "Item", 2.00, 1, 3, "Industry midpoint", tier="advanced", codes=["RMS-002", "RMS-003", "RMS-004"]),
    simple("RT-RESTOCK", "Restock to inventory", "Return a sellable unit to available stock.", "Item", 1.00, 0.50, 1.50, "Industry midpoint", tier="advanced", codes=["RMS-006", "HANDLING-0236"]),
    simple("RT-DISPOSAL", "Disposal / destruction", "Dispose of unsellable product; hauling at cost.", "Item", 0.60, 0.25, 1.00, "Industry midpoint", tier="advanced", codes=["ACCESSORIAL-0011"]),
    simple("RT-RESHIP", "Drop-ship re-processing", "Re-ship a returned / refused drop-ship order.", "Unit", 4.00, 2.50, 5.00, "UNIS median (n=105)", channel="D2C", tier="advanced", codes=["HANDLING-0192"]),
])

# ================================================================== 6. VAS
category("vas", "Value-Added Services", "Kitting, labeling, packaging and marketplace prep.", [
    simple("VA-KIT", "Kitting / bundling", "Assemble up to 3 components into a kit or multi-pack per work order.", "Kit", 1.85, 0.75, 2.50, "UNIS usage avg (17 customers)",
           codes=["HANDLING-0208", "HANDLING-0207", "HANDLING-0187", "HANDLING-0185", "HANDLING-0186"]),
    simple("VA-RELABEL", "Item label / relabel", "Apply or replace product labels.", "Unit", 0.38, 0.20, 0.60, "UNIS median (n=7)",
           codes=["ACC-0002", "HANDLING-0210", "RELABELING", "HANDLING-0209", "HANDLING-0232"]),
    simple("VA-FNSKU", "FNSKU / marketplace label", "Marketplace barcode label per unit.", "Unit", 0.35, 0.20, 0.50, "Industry midpoint", codes=["HANDLING-0184"]),
    simple("VA-SERIAL", "Serial number capture", "Scan and record serial numbers.", "Scan", 0.75, 0.25, 1.25, "UNIS median (n=558)", codes=["HANDLING-0243", "HANDLING-0211"]),
    simple("VA-PACKSLIP", "Packing slip", "Print and insert a packing slip.", "Order", 0.35, 0.10, 0.35, "UNIS median (n=150)", channel="D2C", codes=["ACCESSORIAL-0023"]),
    simple("VA-BRANDED", "Branded packaging", "Client-branded box / mailer and tape (min. 2,000 orders / month).", "Order", 0.35, 0.25, 0.75, "UNIS D2C template", channel="D2C", new=True),
    simple("VA-INSERT", "Insert / flier / sticker", "Add marketing inserts or stickers.", "Item", 0.15, 0.10, 0.25, "UNIS D2C template", channel="D2C", new=True),
    simple("VA-FRAGILE", "Fragile / tissue wrap", "Wrap items in tissue or bubble wrap.", "Item", 0.50, 0.35, 1.00, "UNIS D2C template", channel="D2C", new=True),
    simple("VA-PHOTO", "Photo on request", "Photograph product / cartons on request.", "Photo", 1.00, 0.50, 2.00, "UNIS median (n=74)", tier="advanced", codes=["ACCESSORIAL-0027", "RMS-005"]),
    simple("VA-OVERBOX", "Overbox", "Place the product carton inside a plain shipping box.", "Box", 0.50, 0.50, 1.50, "UNIS D2C template", channel="D2C", tier="advanced", codes=["ACC-0003", "OVERBOX"]),
    simple("VA-DUNNAGE", "Void fill / dunnage", "Extra void fill beyond standard crinkle paper.", "Order", 0.50, 0.15, 0.50, "UNIS D2C template", channel="D2C", tier="advanced", codes=["DUNNAGE"]),
    simple("VA-GIFT", "Gift wrap / gift message", "Gift wrap and printed gift note.", "Order", 2.00, 1, 3, "Industry midpoint", channel="D2C", tier="advanced", new=True),
    simple("VA-POLYBAG", "Poly bag + suffocation label", "Marketplace prep poly-bagging.", "Unit", 0.55, 0.35, 0.75, "Industry midpoint", tier="advanced", new=True),
    simple("VA-SKUCONV", "SKU conversion / relabel", "Convert inventory to a new SKU / marketplace listing.", "Unit", 0.50, 0.25, 0.75, "Industry midpoint", tier="advanced", codes=["ACC-0004"]),
])

# ================================================================== 7. OTHER CHARGES (misc)
category("other", "Other Charges", "Labor, compliance, documents, materials, freight and yard.", [
    simple("OT-LABOR", "Warehouse labor", "Work outside standard handling; task recorded on the work order. 15-min increments.", "Hour", 50, 45, 65, "UNIS median (n=779)",
           codes=["HANDLING-0199", "HOURLY LABOR", "HANDLING-0213", "ACCESSORIAL-0032", "ACCESSORIAL-0029", "HANDLING-0238", "HANDLING-0246", "HANDLING-0240",
                  "HANDLING-0204", "HANDLING-0227", "HANDLING-0212", "HANDLING-0201", "HANDLING-0221", "OTHERS-0002", "HANDLING-0226", "HANDLING-0233"]),
    simple("OT-OT", "Overtime / weekend labor", "Client-requested after-hours work.", "Hour", 75, 65, 95, "UNIS median (n=713)", codes=["HANDLING-0225", "HANDLING-0223", "HANDLING-0224"]),
    simple("OT-COUNT", "Cycle count / physical inventory", "Client-requested counts.", "Hour", 50, 45, 65, "UNIS template", codes=["ACCESSORIAL-0010"]),
    simple("OT-MANUALORDER", "Manual order entry", "CSR keys an order not received electronically.", "Order", 15, 5, 20, "UNIS median (n=675)"),
    simple("OT-RUSH", "Rush order (same day)", "Order received after cut-off, shipped same day.", "Order", 50, 25, 75, "UNIS median (n=746)"),
    simple("OT-CANCEL", "Cancelled order (after pick)", "Plus return-to-stock labor at the hourly rate.", "Order", 10, 5, 25, "UNIS median (n=675)", codes=["ACCESSORIAL-0007"]),
    simple("OT-NOASN", "No ASN / packing list", "ASN not received before arrival.", "Receipt", 50, 35, 75, "UNIS median (n=458)", codes=["ACCESSORIAL-0018"]),
    simple("OT-MANUALRCPT", "Manual receipt entry", "CSR keys a receipt not sent electronically.", "Receipt", 15, 10, 25, "UNIS median (n=114)"),
    simple("OT-OSD", "OSD / damage documentation", "Photos and report for overage, shortage, damage.", "Hour", 50, 45, 65, "UNIS median (n=389)", codes=["HANDLING-0219"]),
    simple("OT-ADDRESS", "Address correction", "Ship-to changed after release; plus carrier fee.", "Occurrence", 2.50, 2, 5, "UNIS D2C template", channel="D2C", codes=["ACCESSORIAL-0037"]),
    simple("OT-DOCS", "Custom shipping / customs document", "International BOL, commercial invoice, customs-bond docs.", "Document", 10, 5, 15, "UNIS median (n=507)",
           codes=["ACCESSORIAL-0009", "ACCESSORIAL-0006", "ACCESSORIAL-0008"]),
    simple("OT-PALLET-A", "Pallet - Grade A", "New / premium 40x48 pallet supplied.", "Pallet", 18.75, 15, 25, "UNIS template", channel="B2B", new=True),
    simple("OT-PALLET-B", "Pallet - Grade B", "Recycled 40x48 pallet supplied.", "Pallet", 14.75, 8, 15, "UNIS template", channel="B2B", new=True),
    simple("OT-WRAP", "Stretch wrap", "Wrap a pallet for shipment.", "Pallet", 5.70, 3, 8, "UNIS template", channel="B2B", codes=["ACCESSORIAL-0033"]),
    simple("OT-SUPPLIES", "Packaging & supplies", "Boxes, mailers, tape etc. purchased for the client.", "% on cost", 0.20, 0.10, 0.25, "UNIS median (n=692)", pct=True,
           codes=["Freight-0001", "ACCESSORIAL-0035", "ACCESSORIAL-0019", "ACCESSORIAL-0022", "ACCESSORIAL-0038"]),
    simple("OT-FREIGHT", "Postage & freight (UNIS accounts)", "Carrier postage / freight re-billed plus markup.", "% on cost", 0.20, 0, 0.20, "UNIS template", pct=True,
           codes=["Small Parcel-0005", "TRANSPORTATION-0002"]),
    simple("OT-3PPOSTAGE", "Client's own carrier account", "Handling when the client's carrier account is used.", "Order", 0.75, 0.25, 1.00, "UNIS template", channel="D2C", codes=["HANDLING-0182"]),
    # advanced
    simple("OT-RUSHRCPT", "Rush receipt (same day)", "Receipt processed same day on request.", "Receipt", 45, 35, 75, "UNIS median (n=141)", tier="advanced"),
    simple("OT-CANCELPRE", "Cancelled order (before pick)", "Often waived.", "Order", 10, 0, 10, "UNIS median (n=19)", tier="advanced"),
    simple("OT-MISSEDAPPT", "Missed appointment", "Carrier misses a dock appointment (inbound or outbound).", "Occurrence", 50, 50, 150, "UNIS median (n=990)", channel="B2B", tier="advanced"),
    simple("OT-COPIES", "Copies / document scans", "On request.", "Page", 0.45, 0.25, 1.00, "UNIS median (n=550)", tier="advanced", codes=["ACCESSORIAL-0026", "ACCESSORIAL-0012"]),
    simple("OT-MANIFEST", "International / customs manifest", "Per international order.", "Order", 0.50, 0.50, 2.00, "UNIS median (n=56)", channel="D2C", tier="advanced", codes=["ACCESSORIAL-0013"]),
    simple("OT-STRAP", "Plastic strapping", "Per pallet.", "Pallet", 6.50, 4, 8, "UNIS template", channel="B2B", tier="advanced", codes=["OTHERS-0004"]),
    simple("OT-CORNER", "Corner boards", "Per pallet.", "Pallet", 6.50, 4, 8, "UNIS template", channel="B2B", tier="advanced", new=True),
    simple("OT-SLIP", "Slip sheet / top sheet", "Per pallet.", "Pallet", 4.00, 2, 6, "Industry midpoint", channel="B2B", tier="advanced", codes=["SLIPSHEET", "OTHERS-0005"]),
    simple("OT-PEAK", "Peak-season surcharge (Nov - Dec)", "Per order during peak.", "Order", 0.50, 0.25, 0.75, "Industry midpoint", channel="D2C", tier="advanced", new=True),
    simple("OT-YARD", "Yard / container storage", "Container parked beyond free time.", "Container / day", 35, 25, 50, "UNIS median (n=188)", channel="B2B", tier="advanced",
           codes=["STORAGE INCOME-0027", "YARD-0002"]),
    simple("OT-HOSTLER", "Yard hostler move", "Yard-truck move of a trailer / container.", "Move", 91, 50, 125, "UNIS usage", channel="B2B", tier="advanced", codes=["HANDLING-0250", "HANDLING-0251"]),
    simple("OT-OUTSIDECARRIER", "Outside-carrier container handling", "Gate / scheduling when inbound drayage is not UNIS.", "Container", 175, 100, 250, "UNIS median (n=21)", channel="B2B", tier="advanced",
           codes=["OTHERS-0003", "TRANSPORTATION-0001"]),
    simple("OT-ACCOUNT", "Account management fee", "Dedicated support, reporting, reviews.", "Month", 250, 250, 1500, "UNIS median (n=43)", tier="advanced",
           codes=["ACCESSORIAL-0005", "ACCESSORIAL-0017", "HANDLING-0191"]),
    simple("OT-MINIMUM", "Monthly minimum billing", "Difference billed if total monthly charges fall below this.", "Month", 3000, 1000, 5000, "Industry midpoint", tier="advanced", new=True),
    simple("OT-PASSTHRU", "Facility pass-throughs", "Rental equipment, waste removal, utilities, security.", "% on cost", 0.20, 0.10, 0.25, "UNIS template", pct=True, tier="advanced",
           codes=["ACCESSORIAL-0028", "ACCESSORIAL-0036", "ACCESSORIAL-0034", "HANDLING-0241"]),
])

# Trigger point -> charge (codes whose system trigger identifies the charge)
TRIGGER_TO_CHARGE = {
    "Offload": "IN-OFFLOAD", "Billed Upon Receipt": "IN-OFFLOAD", "Put Away": "IN-PUTAWAY", "Transload": "IN-TRANSLOAD", "Crossdock": "IN-XDOCK",
    "Sorting": "IN-SORT", "Shotgun": "IN-SHOTGUN", "Palletizing": "IN-PALLETIZE",
    "Order Processing": "OB-ORDER", "Pick": "OB-PICK", "Packing": "OB-PACK", "Loading": "OB-LOAD", "Labeling": "OB-LABEL",
    "Recurring Storage": "ST-STORAGE", "Initial Storage": "ST-STORAGE", "Yard Storage": "OT-YARD", "Return": "RT-RETURN",
    "Manual Order Entry": "OT-MANUALORDER", "Rush Order": "OT-RUSH", "Rush Receipt": "OT-RUSHRCPT", "Manual Receipt Entry": "OT-MANUALRCPT",
    "Manual Order Processing": "OT-MANUALRCPT", "Missed Appointment Fee": "OT-MISSEDAPPT",
    "EDI Order Processing": "SU-EDITX", "EDI Receipt Processing": "SU-EDITX", "FTP Order Processing (UNIS FTP Hosting)": "SU-EDITX",
    "FTP Receipt Processing (UNIS FTP Hosting)": "SU-EDITX", "EDI Order VAN Charge": "SU-VAN", "Transportation": "OT-FREIGHT",
}
# Explicit codes for charges not identified by trigger (Accessorial / General Task Closed / Direct Billing Approved)
EXTRA_CODES = {
    "SU-SETUP": ["HANDLING-0206", "HANDLING-0235", "HANDLING-0205", "HANDLING-0218", "HANDLING-0189", "HANDLING-0190", "HANDLING-0229", "HANDLING-0230",
                 "HANDLING-0202", "HANDLING-0222", "HANDLING-0220", "HANDLING-0248"],
    "SU-ITEM": ["HANDLING-0200"], "SU-SKU": ["ACCESSORIAL-0014"], "SU-WMS": ["SYSTEM & MANAGEMENT FEE-0005", "SYSTEM & MANAGEMENT FEE-0003"],
    "SU-ENT": ["SYSTEM & MANAGEMENT FEE-0004"], "SU-EDI": ["HANDLING-0194", "HANDLING-0193"], "SU-RETAILER": ["HANDLING-0244"], "SU-IT": ["HANDLING-0217"],
    "OT-CANCEL": ["ACCESSORIAL-0002"], "OT-CANCELPRE": ["ACCESSORIAL-0001"], "OB-ROUTING": ["HANDLING-0239"],
    "IN-OFFLOAD": ["HANDLING-0195"], "OB-LOAD": ["HANDLING-0197"],
}
INTERNAL = ["ACCESSORIAL-0004", "HANDLING-0198", "STORAGE INCOME-0029", "Small Parcel-0006", "DRAYAGE-0002", "DISCOUNT-0001", "Gift-0001",
            "LATE CHARGE-0001", "SECURITY DEPOSIT-0001", "MISCELLANEOUS REVENUE-0001", "ACCESSORIAL-0003", "HANDLING-0254"]

# ------------------------------------------------------------------ proposal (customer rate sheet) layout
# Section order follows the UNIS Northampton Business Proposal template.
PROPOSAL_SECTIONS = [
    {"id": "inbound", "label": "Inbound Handling", "note": "Rates include unloading, receiving and entry of inventory into the WMS unless stated otherwise."},
    {"id": "outbound", "label": "Outbound Handling", "note": "An order is billed as order processing + picking + any accessorial actually used."},
    {"id": "storage", "label": "Storage", "note": ""},
    {"id": "returns", "label": "Return Program", "note": "Includes receipt, minor inspection and a report to the client with a photo of each unit."},
    {"id": "vas", "label": "Value-Added Services", "note": ""},
    {"id": "accessorial", "label": "Accessorial Charges", "note": "Labor billed in 15-minute increments."},
    {"id": "it", "label": "IT & EDI Charges", "note": ""},
    {"id": "materials", "label": "Materials & Other Charges", "note": "Supplies purchased by UNIS are billed at cost plus the markup shown."},
]
CATEGORY_TO_SECTION = {"setup": "it", "inbound": "inbound", "outbound": "outbound", "storage": "storage", "returns": "returns", "vas": "vas", "other": "accessorial"}
MATERIALS = ["OT-PALLET-A", "OT-PALLET-B", "OT-WRAP", "OT-STRAP", "OT-CORNER", "OT-SLIP", "OT-SUPPLIES", "OT-FREIGHT", "OT-PASSTHRU"]
# Synonymous simple charges shown as ONE proposal row when their rates are equal
MERGE_GROUPS = [
    {"id": "manual-entry", "label": "Manual order / receipt entry", "members": ["OT-MANUALORDER", "OT-MANUALRCPT"]},
    {"id": "rush", "label": "Rush order / receipt (same day)", "members": ["OT-RUSH", "OT-RUSHRCPT"]},
    {"id": "cancel", "label": "Cancelled order", "members": ["OT-CANCEL", "OT-CANCELPRE"]},
    {"id": "labor", "label": "Warehouse labor / cycle count", "members": ["OT-LABOR", "OT-COUNT"]},
    {"id": "pallet-secure", "label": "Plastic strapping / corner boards", "members": ["OT-STRAP", "OT-CORNER"]},
    {"id": "wms-setup", "label": "Item setup", "members": ["SU-ITEM", "SU-SKU"]},
]
