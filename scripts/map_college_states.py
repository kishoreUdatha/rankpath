"""Backfill College.stateId for colleges that have none.

Strategy (in priority order, first hit wins):
  1. Exact name match against the source rankpath.db College.state column.
  2. Explicit state name embedded in the (OCR-spaced) college name.
  3. Curated city/institute keyword -> state map.

Run:  .venv-etl/Scripts/python.exe scripts/map_college_states.py [--dry]
"""
import sqlite3, re, sys, os

DEV = os.path.join(os.path.dirname(__file__), "..", "web", "prisma", "dev.db")
SRC = os.path.join(os.path.dirname(__file__), "..", "data", "rankpath.db")
DRY = "--dry" in sys.argv

def norm(s: str) -> str:
    """lowercase, strip all non-alphanumerics (collapses OCR spaces)."""
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())

# --- explicit full state names (de-spaced) -> code --------------------------
STATE_NAMES = {
    "andhrapradesh": "AP", "telangana": "TG", "tamilnadu": "TN", "karnataka": "KA",
    "kerala": "KL", "maharashtra": "MH", "rajasthan": "RJ", "gujarat": "GJ",
    "madhyapradesh": "MP", "chhattisgarh": "CG", "chattisgarh": "CG", "jharkhand": "JH",
    "westbengal": "WB", "odisha": "OD", "orissa": "OD", "bihar": "BR", "punjab": "PB",
    "haryana": "HR", "himachalpradesh": "HP", "uttarakhand": "UK", "uttaranchal": "UK",
    "uttarpradesh": "UP", "newdelhi": "DL", "delhi": "DL", "kashmir": "JK",
    "assam": "AS", "puducherry": "PY", "pondicherry": "PY", "manipur": "MN",
    "tripura": "TR", "nagaland": "NL", "mizoram": "MZ", "meghalaya": "ML",
    "arunachalpradesh": "AR", "andamanandnicobar": "AN", "chandigarh": "CH",
    "goa": "GA", "dadranagarhaveli": "DN",
}

# --- city / institute keyword -> code ---------------------------------------
# de-spaced substrings; more specific tokens win by being checked in this order
CITY = {
    # Tamil Nadu
    "TN": ["chennai", "madras", "kilpauk", "stanley", "thanjavur", "theni",
           "thoothukudi", "tirunelveli", "tiruchirap", "tiruchi", "viswanatham",
           "coimbatore", "chengalpatt", "dharmapuri", "dharamapuri", "mohankumara",
           "kanyakumari", "asaripallam", "perundurai", "kallakurichi", "krishnagiri",
           "nagapattinam", "nilgiris", "omandurar", "ramanathapuram", "thiruvallur",
           "villupuram", "kancheepuram", "chettinad", "thaimoogambiga", "tamilnadugovt",
           "acsmedical", "srisathyasai", "karur", "salem", "perambalur", "vellore",
           "saveetha", "sriramachandra", "vinayakamission", "thiruvarur"],
    # Telangana
    "TG": ["hyderabad", "secunderabad", "osmania", "musheerabad", "warangal",
           "kakatiya", "nalgonda", "nizamabad", "khaleelwadi", "nirmal", "suryapet",
           "siddipet", "jagtial", "mahabubabad", "mahabubangar", "mahabubnagar",
           "mancherial", "ramagundam", "jangaon", "kamareddy", "wanaparthy",
           "bhadradri", "kothagudem", "khammam", "asifabad", "jogulamba", "gadwal",
           "sangareddy", "karimnagar", "bhupalpally", "vikarabad", "kodangal",
           "gandhimedical", "jayashankar"],
    # Andhra Pradesh
    "AP": ["nellore", "kadapa", "eluru", "machilipatna", "nandyal", "ananthapuram",
           "anantapur", "rajamahendrava", "srikakulam", "tirupati", "padmavathi",
           "visakhapatnam", "vizag", "guntur", "kurnool", "ongole", "kakinada",
           "vijayawada", "gitaminstitue", "rajivgandhi"],
    # Karnataka
    "KA": ["bangalor", "bengalur", "belgaum", "belagavi", "bidar", "hubli", "hubballi",
           "mysor", "mandya", "hassan", "shimoga", "shivamogga", "raichur", "gulbarga",
           "kalaburagi", "gadag", "chikkaballap", "chikkamagaluru", "chitradurga",
           "haveri", "karwar", "kodagu", "yadgiri", "kolar", "koppal", "mangalor",
           "mangalur", "kshegde", "jagadguru", "rajarajeswari", "bldeuniversit",
           "vijaynagar", "ballari", "bellary", "kims", "karnatakinst", "tumkur",
           "tumakuru", "sdumedical", "sisiddhartha", "yenepoya", "kasturba",
           "bijapur", "vijayapura", "karad", "banglore", "bangluru"],
    # Kerala
    "KL": ["thiruvananthapuram", "trivandrum", "thrissur", "kozhikode", "calicut",
           "kochi", "ernakulam", "idukki", "palakkad", "kollam", "alappuzha",
           "allappuzha", "kottayam", "kannur", "manjeri", "amritaschool"],
    # Maharashtra
    "MH": ["mumbai", "navimumbai", "pune", "nagpur", "aurangabad", "nanded", "latur",
           "miraj", "osmanabad", "akola", "satara", "sangli", "solapur", "sholapur",
           "dhule", "jalgaon", "gondia", "yavatmal", "ambajogai", "kolhapur",
           "sindhudurg", "parbhani", "nandurbar", "wardha", "panvel", "vashi",
           "bjgovernment", "grantmedical", "sethgs", "lokmanyatilak", "topiwala",
           "nairhosp", "indiragandhigovt", "dattameghe", "vasantrao", "bhausaheb",
           "swamiramanand", "hinduhridaya", "rajivgandhimedicalcollegethane",
           "bharatividyapee", "dypatil", "krishnainst", "symbiosis", "mgminst",
           "mahatmagandhimission", "mahatmagandimission", "sevagram"],
    # Rajasthan
    "RJ": ["jaipur", "jodhpur", "udaipur", "ajmer", "bikaner", "kota", "bundi",
           "dausa", "karauli", "alwar", "bhilwara", "dholpur", "hanumangarh",
           "jaisalmer", "barmer", "dungarpur", "sirohi", "sikar", "bharatpur",
           "jhalawar", "chittorgarh", "smsmedical", "rntmedical", "ruhs",
           "sardarpatel", "jawaharlalnehrumedicalajmer", "sjpmedical", "shrikalyan",
           "pali"],
    # Gujarat
    "GJ": ["ahmedabad", "vadodara", "baroda", "surat", "rajkot", "morbi", "navsari",
           "godhra", "panchmahal", "rajpipla", "gmers", "medicalcollegebaroda",
           "sbksmed", "sumandeep", "bhavnagar", "jamnagar", "valsad"],
    # Madhya Pradesh
    "MP": ["indore", "bundelkhand", "ratlam", "mandsaur", "gwalior", "bhopal",
           "jabalpur", "rewa", "shahdol", "vidisha", "sagarmedical"],
    # Chhattisgarh
    "CG": ["raipur", "bilaspur", "jagdalpur", "kanker", "korba", "rajnandgaon",
           "ambikapur", "surguja", "mahasamund", "ptjnm", "durg", "chandrakar"],
    # Bihar
    "BR": ["patna", "bhagalpur", "bettiah", "purnea", "darbhanga", "gaya", "nalanda",
           "muzaffarpur", "igims", "vardhman"],
    # Jharkhand
    "JH": ["ranchi", "jamshedpur", "dumka", "hazaribag", "hazaribah", "palamu",
           "medinirai", "deoghar", "deogarh", "rajendrainst", "phulojhano",
           "sheikhbhikhari"],
    # West Bengal
    "WB": ["kolkata", "kolkatta", "bankura", "burdwan", "malda", "darjeeling",
           "northbengal", "kalyani", "diamondharbour", "raiganj", "ipgmer",
           "rgkar", "scbmedical", "instofpgmed", "nrsmedical", "scbmed", "midnapore"],
    # Odisha
    "OD": ["cuttack", "burla", "brahmapur", "berhampur", "koraput", "baripada",
           "bhubaneswar", "sundargarh", "vssmedical", "mkcg", "gajapati",
           "saheedlaxman", "raghunathmurmu"],
    # Punjab
    "PB": ["faridkot", "patiala", "amritsar", "bathinda", "gurugovind",
           "rajindra"],
    # Haryana
    "HR": ["rohtak", "sonepat", "sonipat", "karnal", "kalpanachawla", "ptbdsharma",
           "pgimsrohtak", "mminst", "mullana", "nuh", "mewat", "esicmedicalcollegefaridabad"],
    # Himachal Pradesh
    "HP": ["tanda", "nahan", "hamirpur", "chamba", "shimla", "igmc", "nerchowk",
           "rajendraprasad", "ysparmar", "radhakrishnan"],
    # Uttarakhand
    "UK": ["dehradun", "haldwani", "rishikesh", "rishikes", "garhwali", "almora",
           "doonmedcial", "doonmedical", "uttaranchalf", "sobansinghjeena",
           "veerchandra"],
    # Uttar Pradesh
    "UP": ["meerut", "allahabad", "prayagraj", "jhansi", "aligarh", "lucknow",
           "varanasi", "gorakhpur", "etah", "mirzapur", "amethi", "ghazipur",
           "hardoi", "badaun", "basti", "faizabad", "ayodhya", "banda", "raibareli",
           "raebareli", "llrm", "motilalnehru", "maharanilaxmi", "kgmu", "kgmeduniv",
           "bhuvaranasi", "imsbhu", "instofmedsciencesbhu", "kanpur", "gsvm",
           "saifai", "jawaharlalnehrumedicalcollegeamu", "ranidurgavati",
           "autonomousstatemedical", "ranidurgavatimedicalcollegebanda"],
    # Delhi
    "DL": ["maulanaazad", "ahilyabai", "ladyhardinge", "ucms", "vmmc", "rmlhospital",
           "abvimscentral", "delhicollege"],
    # Jammu & Kashmir
    "JK": ["jammu", "srinagar", "baramulla", "handwara", "rajouri", "kathua",
           "anantnag", "doda", "ladakh"],
    # Assam
    "AS": ["guwahati", "guahawti", "nagaon", "dibrugarh", "silchar", "barpeta",
           "jorhat", "tezpur", "diphu"],
    # Puducherry
    "PY": ["puducherry", "pondicherry", "jipmer", "karaikal", "aarupadai",
           "indiragandhiinstitute", "srilakshminarayan", "mgdc", "sripadmavathi"],
    # Manipur
    "MN": ["imphal", "churachandpur", "jlnims", "jnims"],
    # others / small
    "TR": ["agartala"],
    "NL": ["kohima", "nagalandinstitute", "phreibag", "phirebagie"],
    "MZ": ["aizawl", "falkawn", "zorammedical"],
    "ML": ["shillong", "neigrihms"],
    "AR": ["naharlagun", "itanagar", "tomoriba"],
    "AN": ["andaman", "portblair", "aniims"],
    "CH": ["chandigarh", "chandigar"],
    "GA": ["goamedical", "bambolim"],
    "DN": ["silvassa", "namomedical"],
}

# Specials that must win before generic city tokens (token collisions)
SPECIAL = [
    ("ranidurgavati", "UP"),    # Banda, not Durg(CG)
    ("aiimsdeogarh", "JH"), ("aiimsdeoghar", "JH"),
    ("aiimsbathinda", "PB"), ("aiimsguwahati", "AS"), ("aiimsguahawti", "AS"),
    ("aiimsjammu", "JK"), ("aiimsmangalagiri", "AP"), ("aiimsrajkot", "GJ"),
    ("aiimsbhubaneswar", "OD"), ("aiimsgorakhpur", "UP"), ("aiimsjodhpur", "RJ"),
    ("aiimskalyani", "WB"), ("aiimsmadurai", "TN"), ("aiimsnagpur", "MH"),
    ("aiimspatna", "BR"), ("aiimsraibareli", "UP"), ("aiimsraipur", "CG"),
    ("aiimsrishikesh", "UK"),
    ("kasturbamedicalcollegemanipal", "KA"),  # the Mangalore campus row
]

def resolve(name: str):
    n = norm(name)
    for kw, code in SPECIAL:
        if kw in n:
            return code, "special"
    for sname, code in STATE_NAMES.items():
        if sname in n:
            # avoid 'delhi' matching nothing else; 'goa' too short handled above
            return code, "statename"
    for code, kws in CITY.items():
        for kw in kws:
            if kw in n:
                return code, f"city:{kw}"
    return None, None

def main():
    src = sqlite3.connect(SRC)
    srcmap = {norm(n): st.strip() for n, st in
              src.execute("SELECT name,state FROM College WHERE state IS NOT NULL AND state<>''")}
    dev = sqlite3.connect(DEV)
    stateId = {code: sid for code, sid in dev.execute("SELECT code,id FROM State")}
    nulls = dev.execute("SELECT id,name FROM College WHERE stateId IS NULL").fetchall()

    updates, byreason, unresolved = [], {}, []
    for cid, name in nulls:
        code = srcmap.get(norm(name)); reason = "sourcematch"
        if not code:
            code, reason = resolve(name)
        if code and code in stateId:
            updates.append((stateId[code], cid))
            byreason[reason.split(":")[0]] = byreason.get(reason.split(":")[0], 0) + 1
        else:
            unresolved.append(name)

    print(f"NULL-state colleges: {len(nulls)}")
    print(f"resolved: {len(updates)}  | by method: {byreason}")
    print(f"unresolved: {len(unresolved)}")
    for u in unresolved:
        print("   ?", u)

    if not DRY and updates:
        dev.executemany("UPDATE College SET stateId=? WHERE id=?", updates)
        dev.commit()
        print(f"\nCOMMITTED {len(updates)} updates.")
    elif DRY:
        print("\n(dry run — no writes)")

if __name__ == "__main__":
    main()
