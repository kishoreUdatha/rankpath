// Shared Indian state/UT list (codes match the State table). Used by the
// registration form, predictor wizard and quick-predict so a student's
// domicile pre-fills correctly.
export const STATES: { code: string; name: string }[] = [
  { code: "AP", name: "Andhra Pradesh" }, { code: "AR", name: "Arunachal Pradesh" },
  { code: "AS", name: "Assam" }, { code: "BR", name: "Bihar" }, { code: "CG", name: "Chhattisgarh" },
  { code: "GA", name: "Goa" }, { code: "GJ", name: "Gujarat" }, { code: "HR", name: "Haryana" },
  { code: "HP", name: "Himachal Pradesh" }, { code: "JH", name: "Jharkhand" }, { code: "KA", name: "Karnataka" },
  { code: "KL", name: "Kerala" }, { code: "MP", name: "Madhya Pradesh" }, { code: "MH", name: "Maharashtra" },
  { code: "MN", name: "Manipur" }, { code: "ML", name: "Meghalaya" }, { code: "MZ", name: "Mizoram" },
  { code: "NL", name: "Nagaland" }, { code: "OD", name: "Odisha" }, { code: "PB", name: "Punjab" },
  { code: "RJ", name: "Rajasthan" }, { code: "TN", name: "Tamil Nadu" }, { code: "TG", name: "Telangana" },
  { code: "TR", name: "Tripura" }, { code: "UP", name: "Uttar Pradesh" }, { code: "UK", name: "Uttarakhand" },
  { code: "WB", name: "West Bengal" }, { code: "DL", name: "Delhi" }, { code: "JK", name: "Jammu & Kashmir" },
  { code: "PY", name: "Puducherry" }, { code: "CH", name: "Chandigarh" }, { code: "AN", name: "Andaman & Nicobar" },
  { code: "DN", name: "Dadra & Nagar Haveli" },
];

export const STATE_CODES = new Set(STATES.map((s) => s.code));
