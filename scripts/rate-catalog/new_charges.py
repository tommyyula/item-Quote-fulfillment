"""New charge ideas (71) - 'New charge ideas' sheet of Standard Rate Sheet - Common Items Coverage.xlsx.

Charges that have no system charge code yet: from ITEM SaaS quotes (AI gate, RFID, GPS) and 2026 market
research. Prices are indicative (USD) - validate before quoting.

Placement:
  STANDARD = the most commonly used -> visible, in the default template and the Standard Charge Template.
  "main"   = visible in its category.
  "adv"    = folded under "More charges" (niche, project-specific or overlapping an existing charge).
"""

# ---- three new categories (others go into the existing ones)
NEW_CATEGORIES = [
    ("tech", "Technology, Data & AI", "Platform and data fees, AI usage, IT support and consulting."),
    ("smart", "Security, IoT & Automation", "AI cameras and gates, RFID, GPS, sensors, robotics and yard systems."),
    ("terms", "Commercial Terms", "Contract-level surcharges, escalators and payment terms."),
]
# category order on the page (categories[1] must stay "inbound")
CATEGORY_ORDER = ["setup", "inbound", "outbound", "storage", "returns", "vas", "tech", "smart", "other", "terms"]
NEW_SECTIONS = [  # proposal (rate sheet) sections, after "IT & EDI Charges"
    {"id": "tech", "label": "Technology, Data & AI", "note": "Indicative rates; usage-based items are billed from system usage reports."},
    {"id": "smart", "label": "Security, IoT & Automation", "note": "Hardware has a 1-year warranty; installation travel is billed at cost."},
    {"id": "terms", "label": "Commercial Terms", "note": ""},
]
NEW_CATEGORY_TO_SECTION = {"tech": "tech", "smart": "smart", "terms": "terms"}

ITEM_QUOTE = "ITEM SaaS quote 2025"
MKT = "Market guides 2026"
EST = "Industry estimate"

# (sheet #, id, category, tier, name, description, unit, default, low, high, basis, options, suggested system item name)
# options: pct=True (rate is a fraction), channel="B2B" / "D2C"
CHARGES = [
    # 1 Technology & data
    (1, "TE-TECHFEE", "tech", "main", "Technology fee", "WMS, portal, tracking and integrations recovered per order instead of a flat platform fee.", "Order", 0.18, 0.10, 0.25, MKT, {}, "TECHNOLOGY FEE PER ORDER"),
    (2, "TE-API", "tech", "main", "API access", "Client systems calling WMS APIs (inventory, orders, tracking); allowance per tier, overage per 1,000 calls.", "1,000 calls", 25, 10, 50, MKT, {}, "API ACCESS / CALL FEE"),
    (3, "TE-DATA", "tech", "main", "System data storage", "Documents, POD / BOL, photos and video above the included allowance (e.g. 50 GB per account).", "GB / month", 0.10, 0.05, 0.25, MKT, {}, "SYSTEM DATA STORAGE"),
    (4, "TE-ARCHIVE", "tech", "adv", "Extended data retention / archive", "Keep history, images and video beyond standard retention (e.g. over 24 months, legal hold).", "Account / year", 1200, 500, 3000, EST, {}, "EXTENDED DATA RETENTION"),
    (5, "TE-REPORT", "tech", "main", "Custom report / dashboard", "Build a client-specific report, KPI dashboard or scheduled export (one-time).", "Report", 400, 150, 1000, MKT, {}, "CUSTOM REPORT DEVELOPMENT"),
    (6, "TE-BIFEED", "tech", "adv", "BI / data feed subscription", "Recurring data feed to the client's BI / data warehouse (Snowflake, Power BI).", "Feed / month", 250, 100, 500, EST, {}, "BI DATA FEED SUBSCRIPTION"),
    (7, "TE-ECOMMONTH", "tech", "main", "Marketplace connector (monthly)", "Ongoing connection per sales channel (Shopify, Amazon, Walmart, TikTok Shop); setup is a separate one-time charge.", "Channel / month", 75, 25, 150, MKT, {"channel": "D2C"}, "MARKETPLACE CONNECTOR MONTHLY"),
    (8, "TE-FACILITY", "tech", "adv", "Additional facility / entity in WMS", "Each extra site or legal entity configured for the client.", "Facility / month", 300, 100, 750, EST, {}, "ADDITIONAL WMS FACILITY / ENTITY"),
    (9, "TE-SANDBOX", "tech", "adv", "Sandbox / test environment", "Separate environment for UAT or integration testing after go-live.", "Month", 500, 200, 1000, EST, {}, "SANDBOX ENVIRONMENT"),
    (10, "TE-SSO", "tech", "adv", "SSO / advanced security", "SAML single sign-on, audit logs and IP allow-listing for the client portal.", "Account / month", 250, 100, 500, EST, {}, "SSO / ADVANCED SECURITY"),
    (11, "TE-DEVICE", "tech", "main", "Scanner / printer rental", "RF guns, mobile and label printers provided for dedicated client operations.", "Device / month", 90, 40, 150, EST, {}, "HANDHELD SCANNER / PRINTER RENTAL"),
    # 2 AI usage
    (12, "TE-AITOKEN", "tech", "main", "AI token usage", "LLM tokens used by AI features (assistant, document AI, agents), re-billed at cost plus markup.", "% on cost", 0.25, 0.15, 0.30, MKT, {"pct": True}, "AI TOKEN USAGE"),
    (13, "TE-AIAGENT", "tech", "adv", "AI agent resolution", "AI agent answers where-is-my-order, returns and delivery questions for the client's end customers.", "Resolution", 1.00, 0.50, 2.00, MKT, {}, "AI AGENT RESOLUTION"),
    (14, "TE-AIDOC", "tech", "adv", "AI document processing", "Read BOL, POD, packing lists and invoices into the WMS / billing (OCR and extraction).", "Page", 0.15, 0.05, 0.50, EST, {}, "AI DOCUMENT PROCESSING"),
    (15, "TE-AIVISION", "tech", "adv", "AI vision QC / damage detection", "Camera check of cartons / pallets at receiving or packing; photo evidence for claims.", "Scan", 0.05, 0.02, 0.10, EST, {}, "AI VISION QC"),
    (16, "TE-AIPLAN", "tech", "adv", "AI slotting / labor / demand forecasting", "Recurring optimisation of slotting, labor plans or replenishment for the client.", "Facility / month", 1200, 500, 2500, EST, {}, "AI OPTIMIZATION SUBSCRIPTION"),
    # 3 AI camera & security
    (17, "SM-AICAM", "smart", "main", "AI camera license", "Cloud video and AI analytics per camera (people / vehicle detection, search).", "Camera / month", 21, 15, 33, MKT, {}, "AI CAMERA LICENSE"),
    (18, "SM-AIGATE", "smart", "main", "AI security gate subscription", "Gate software: plate / container OCR, check-in, reject-entry and trailer in / out reports.", "Gate / year", 30000, 20000, 40000, ITEM_QUOTE, {}, "AI SECURITY GATE SUBSCRIPTION"),
    (19, "SM-AIBLDG", "smart", "main", "AI building surveillance subscription", "Rooftop / perimeter AI camera coverage per building.", "Building / year", 50000, 35000, 65000, ITEM_QUOTE, {}, "AI BUILDING SURVEILLANCE SUBSCRIPTION"),
    (20, "SM-VIDRET", "smart", "adv", "Video retention extension", "Keep footage 90 / 365 days instead of the standard 30.", "Camera / month", 10, 5, 15, MKT, {}, "VIDEO RETENTION EXTENSION"),
    (21, "SM-VIDREQ", "smart", "main", "Video footage retrieval", "Pull and review footage for a claim, theft or carrier dispute.", "Request", 100, 50, 150, EST, {}, "VIDEO FOOTAGE RETRIEVAL"),
    (22, "SM-GATECAM", "smart", "adv", "AI gate camera (installed)", "Additional / replacement gate camera incl. installation; travel extra.", "Camera", 4000, 3000, 5000, ITEM_QUOTE, {}, "AI GATE CAMERA + INSTALLATION"),
    (23, "SM-ROOFCAM", "smart", "adv", "AI rooftop camera (installed)", "Additional / replacement rooftop camera incl. installation.", "Camera", 3500, 2500, 4500, ITEM_QUOTE, {}, "AI ROOFTOP CAMERA + INSTALLATION"),
    (24, "SM-SECINSTALL", "smart", "adv", "Security system installation", "Site-wide installation (cabling, mounts, network) for the gate and rooftop system.", "Building", 35000, 25000, 70000, ITEM_QUOTE, {}, "SECURITY SYSTEM INSTALLATION"),
    # 4 RFID, GPS & IoT
    (25, "SM-RFID", "smart", "main", "RFID software subscription", "Pallet / trailer / dock RFID tracking software.", "Facility / year", 30000, 20000, 40000, ITEM_QUOTE, {}, "RFID SOFTWARE SUBSCRIPTION"),
    (26, "SM-RFIDHW", "smart", "adv", "Forklift RFID reader", "Reader hardware mounted on a forklift.", "Forklift", 1500, 1000, 2000, ITEM_QUOTE, {}, "FORKLIFT RFID READER"),
    (27, "SM-RFIDINST", "smart", "adv", "Forklift RFID reader installation", "Install and commission a forklift reader.", "Forklift", 1500, 1000, 2000, ITEM_QUOTE, {}, "FORKLIFT RFID READER INSTALLATION"),
    (28, "SM-RFIDTAG", "smart", "main", "RFID label / tag", "RFID label for a pallet, trailer or dock location.", "Label", 0.12, 0.05, 0.20, ITEM_QUOTE, {}, "RFID LABEL"),
    (29, "SM-GPS", "smart", "main", "Truck GPS tracking subscription", "GPS tracking per truck (optional dual dash cams).", "Truck / month", 27, 13.95, 60, ITEM_QUOTE, {}, "TRUCK GPS TRACKING SUBSCRIPTION"),
    (30, "SM-GPSHW", "smart", "adv", "Truck GPS / dash cam (installed)", "GPS unit (and cameras) installed per truck.", "Truck", 500, 300, 3000, ITEM_QUOTE, {}, "TRUCK GPS / DASH CAM + INSTALLATION"),
    (31, "SM-IOT", "smart", "main", "IoT temperature / humidity monitoring", "Continuous sensor monitoring, alerts and compliance log for sensitive inventory.", "Sensor / month", 15, 5, 25, EST, {}, "IOT SENSOR MONITORING"),
    (32, "SM-WARRANTY", "smart", "adv", "Hardware extended warranty", "Cover after the standard 1-year warranty on cameras, readers and GPS units.", "% of hardware price / year", 0.15, 0.10, 0.20, EST, {"pct": True}, "HARDWARE EXTENDED WARRANTY"),
    # 5 Support & services
    (33, "TE-SUPPORT", "tech", "main", "Yearly remote tech support", "Remote support for licensed software and hardware.", "Facility / year", 12000, 4500, 20000, ITEM_QUOTE, {}, "YEARLY REMOTE TECH SUPPORT"),
    (34, "TE-ONSITE", "tech", "main", "Onsite support", "Engineer on site, 8 hours included; travel extra.", "Day", 1200, 1000, 1600, ITEM_QUOTE, {}, "ONSITE SUPPORT PER DAY"),
    (35, "TE-CONSULT", "tech", "adv", "Remote IT consultant / data service", "Out-of-scope IT / data projects (similar to IT support / development).", "Hour", 150, 125, 200, ITEM_QUOTE, {}, "REMOTE IT CONSULTANT"),
    (36, "TE-TRAVEL", "tech", "main", "Travel expenses", "Consultant / installer travel billed at actual cost (0% = at cost).", "% on cost", 0, 0, 0.10, ITEM_QUOTE, {"pct": True}, "TRAVEL EXPENSES"),
    (37, "TE-AFTERHRS", "tech", "adv", "After-hours / emergency support", "Premium on the hourly / daily support rate outside business hours or for a critical SLA.", "% premium on support rate", 0.50, 0.50, 1.00, EST, {"pct": True}, "AFTER-HOURS SUPPORT PREMIUM"),
    (38, "TE-CSM", "tech", "adv", "Dedicated customer success / solutions engineer", "Named CSM or engineer allocated to the account (share of an FTE).", "Month", 4000, 1500, 9000, EST, {}, "DEDICATED SOLUTIONS ENGINEER"),
    # 6 Robotics & automation
    (39, "SM-ROBOTCOUNT", "smart", "main", "Robot / drone cycle count", "Autonomous drone or robot scans rack locations and reports exceptions; replaces manual counts.", "Location scanned", 0.08, 0.03, 0.15, EST, {}, "ROBOT / DRONE CYCLE COUNT"),
    (40, "SM-ROBOTPROG", "smart", "adv", "Inventory robot program", "Recurring autonomous count program for a dedicated client facility (RaaS pass-through).", "Facility / month", 4500, 2000, 8000, EST, {}, "INVENTORY ROBOT PROGRAM"),
    (41, "SM-AMRPICK", "smart", "adv", "AMR-assisted pick", "Per-pick fee where picks run on collaborative robots; replaces or surcharges manual pick.", "Pick", 0.05, 0.03, 0.06, MKT, {}, "AMR ASSISTED PICK"),
    (42, "SM-ROBOTFLEET", "smart", "adv", "Dedicated robot fleet", "Robots dedicated to one client (RaaS pass-through).", "Robot / month", 1800, 1200, 2500, MKT, {}, "DEDICATED ROBOT FLEET"),
    (43, "ST-ASRS", "storage", "adv", "Automated storage (AS/RS) bin", "Storage in AutoStore / shuttle bins - premium for density and speed.", "Bin / month", 4, 2, 6, EST, {}, "AUTOMATED STORAGE BIN"),
    (44, "SM-DIMS", "smart", "adv", "SKU dimensioning & photo", "Capture dims, weight and photos per SKU (Cubiscan) at onboarding or on change.", "SKU", 1.25, 0.50, 2.00, EST, {}, "SKU DIMENSIONING & PHOTO"),
    # 7 Yard & dock
    (45, "SM-YARD", "smart", "adv", "Yard management subscription", "Trailer and container visibility, moves and dwell reporting.", "Facility / month", 3000, 1500, 5000, MKT, {"channel": "B2B"}, "YARD MANAGEMENT SUBSCRIPTION"),
    (46, "SM-DOCKAPPT", "smart", "adv", "Dock appointment portal", "Self-service carrier booking, reminders and no-show tracking.", "Facility / month", 500, 175, 1300, MKT, {"channel": "B2B"}, "DOCK APPOINTMENT PORTAL"),
    (47, "SM-GATETX", "smart", "adv", "Automated gate transaction", "Each truck in / out captured by OCR / AI gate.", "Gate transaction", 1.50, 0.50, 3.00, EST, {"channel": "B2B"}, "AUTOMATED GATE TRANSACTION"),
    (48, "SM-EV", "smart", "adv", "EV charging", "Charging client / carrier electric vehicles on site (plus port fee per month).", "kWh", 0.25, 0.15, 0.35, MKT, {}, "EV CHARGING"),
    # 8 Storage & inventory policy
    (49, "ST-AGED", "storage", "main", "Long-term (aged) storage surcharge", "Inventory older than 180 / 365 days, on top of the storage rate.", "Pallet / month", 5, 2, 10, MKT, {}, "AGED INVENTORY STORAGE SURCHARGE"),
    (50, "ST-PEAK", "storage", "main", "Peak-season storage premium", "Storage premium October - January.", "% on storage (Oct - Jan)", 0.35, 0.25, 0.50, MKT, {"pct": True}, "PEAK SEASON STORAGE PREMIUM"),
    (51, "ST-OVERSTOCK", "storage", "adv", "Overstock / utilization surcharge", "When weeks of cover exceed a limit (e.g. over 22 weeks).", "Cu ft / month", 0.90, 0.44, 1.88, MKT, {}, "STORAGE UTILIZATION SURCHARGE"),
    (52, "ST-SKUFEE", "storage", "adv", "Per-SKU / slow-mover fee", "Per active SKU, or per SKU with no movement in 90 days.", "SKU / month", 1.00, 0.50, 2.00, MKT, {}, "PER SKU / SLOW MOVER FEE"),
    (53, "ST-HAZMAT", "storage", "main", "Hazmat / dangerous goods surcharge", "DG segregation and handling, on the affected SKUs' charges.", "% on DG SKU charges", 0.25, 0.15, 0.40, MKT, {"pct": True}, "HAZMAT SURCHARGE"),
    (54, "ST-SECURE", "storage", "main", "High-value / secured cage storage", "Caged or CCTV-covered secure area.", "Pallet / month", 10, 5, 20, EST, {}, "HIGH VALUE CAGE STORAGE"),
    (55, "ST-BONDED", "storage", "adv", "Bonded / FTZ storage & reporting", "Bonded inventory control and customs reporting; plus per entry.", "Month", 750, 250, 2000, EST, {}, "BONDED / FTZ STORAGE"),
    (56, "ST-INSURE", "storage", "adv", "Declared-value insurance", "Coverage above the standard warehouse legal liability.", "% of declared value / month", 0.001, 0.0005, 0.0015, EST, {"pct": True}, "DECLARED VALUE INSURANCE"),
    (57, "OT-WALL", "other", "adv", "Annual physical inventory (flat)", "Full wall-to-wall count quoted as one fee.", "Count", 3500, 1500, 7500, MKT, {}, "ANNUAL PHYSICAL INVENTORY"),
    (58, "OT-RECALL", "other", "adv", "Recall / quarantine management", "Hold, segregate and report lots under recall.", "Hour", 55, 45, 75, EST, {}, "RECALL / QUARANTINE MANAGEMENT"),
    # 9 Order & carrier
    (59, "OB-ORDERMOD", "outbound", "main", "Order change after release", "Change address, items or carrier after the order is released to the floor.", "Change", 6, 3, 12, MKT, {}, "ORDER MODIFICATION AFTER RELEASE"),
    (60, "OB-DIMAUDIT", "outbound", "adv", "Dim-weight / carrier invoice audit", "Reconcile carrier dim-weight adjustments and audit carrier invoices.", "Order", 0.50, 0.25, 1.00, MKT, {"channel": "D2C"}, "CARRIER INVOICE AUDIT"),
    (61, "OT-SURCHARGE", "other", "main", "Carrier surcharge pass-through", "Carrier fuel, residential and DAS surcharges re-billed with a markup.", "% on carrier surcharges", 0.05, 0.03, 0.08, MKT, {"pct": True}, "CARRIER SURCHARGE PASS-THROUGH"),
    (62, "RT-RTS", "returns", "main", "Undeliverable / return to sender", "Process a package returned by the carrier as undeliverable.", "Package", 6, 4, 10, MKT, {"channel": "D2C"}, "RETURN TO SENDER HANDLING"),
    (63, "IN-UNSCHED", "inbound", "adv", "Unscheduled receipt", "Freight arrives without an appointment.", "Receipt", 125, 75, 250, MKT, {"channel": "B2B"}, "UNSCHEDULED RECEIPT"),
    (64, "TE-CARBON", "tech", "adv", "Carbon / emissions report", "Monthly shipment emissions report (Scope 3) for the client's ESG reporting.", "Month", 250, 100, 500, EST, {}, "CARBON EMISSIONS REPORT"),
    # 10 Commercial terms
    (65, "TM-ENERGY", "terms", "adv", "Warehouse energy surcharge", "Index-linked surcharge on the warehouse bill.", "% on warehouse bill", 0.02, 0.01, 0.03, MKT, {"pct": True}, "WAREHOUSE ENERGY SURCHARGE"),
    (66, "TM-CARD", "terms", "main", "Credit-card processing fee", "When invoices are paid by card.", "% of card payment", 0.03, 0.025, 0.035, MKT, {"pct": True}, "CREDIT CARD PROCESSING FEE"),
    (67, "TM-ESCALATOR", "terms", "main", "Annual rate escalator", "Automatic yearly price increase on all rates.", "% per year", 0.03, 0, 0.05, MKT, {"pct": True}, "ANNUAL RATE ESCALATOR"),
    (68, "TM-OFFBOARD", "terms", "main", "Inventory release / offboarding", "Pick and load all remaining inventory at contract end; plus per pallet.", "Unit", 1.50, 0.50, 2.50, MKT, {}, "INVENTORY RELEASE / OFFBOARDING FEE"),
    (69, "TM-EARLYTERM", "terms", "main", "Early termination fee", "When the client exits before the term, as a share of the monthly minimum (300% = 3 months).", "% of monthly minimum", 3, 2, 6, MKT, {"pct": True}, "EARLY TERMINATION FEE"),
    (70, "TM-WAIVER", "terms", "adv", "First-month license waiver (clawback)", "First month's license fee waived; due if the client terminates within 2 years.", "% of first-month license", 1, 1, 1, ITEM_QUOTE, {"pct": True}, "FIRST MONTH LICENSE WAIVER CLAWBACK"),
    (71, "TM-LATE", "terms", "main", "Late-payment interest", "Interest on overdue invoices.", "% per month on overdue balance", 0.01, 0.005, 0.015, ITEM_QUOTE, {"pct": True}, "LATE PAYMENT INTEREST"),
]

# The most commonly used: visible, in the default template and the Standard Charge Template
STANDARD = ["TE-TECHFEE", "TE-DATA", "ST-AGED", "OB-ORDERMOD", "TM-CARD", "TM-ESCALATOR", "TM-OFFBOARD", "TM-LATE"]

assert len(CHARGES) == 71 and sorted(c[0] for c in CHARGES) == list(range(1, 72))
assert len({c[1] for c in CHARGES}) == 71
assert all(c[3] == "main" for c in CHARGES if c[1] in STANDARD)


def charges(simple):
    """category id -> [charge dicts], built with model_v3.simple()."""
    out = {}
    for n, cid, cat, tier, name, desc, unit, d, lo, hi, basis, opt, _ in CHARGES:
        out.setdefault(cat, []).append(simple(cid, name, desc, unit, d, lo, hi, basis, channel=opt.get("channel", "Both"),
                                              tier="main" if tier == "main" else "advanced", pct=opt.get("pct", False), new=True))
    return out


NEW_ITEM_NAMES = {c[1]: c[12] for c in CHARGES}
