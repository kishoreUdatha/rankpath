"""Regenerate the admit-probability calibration table used by web/src/lib/prediction.ts.

Fits the isotonic survival curve P(g >= ratio), where g = actual_closing / projected,
on the newest CLEAN ground-truth year. Currently truth = 2024 projected from 2023
(2025 R1 AIQ was stray-round mislabels and is purged; see fix_2025_round_mislabels.py).
5-fold CV reports out-of-sample calibration error vs the original hand-drawn curve.

Copy the printed CALIBRATION array into prediction.ts. Once a clean 2025/2026 R1 result
PDF is ingested, switch TRUTH_YEAR and use a 2-year projection basis.

Usage:  .venv-etl/Scripts/python.exe scripts/refit_calibration.py
"""
import os, sqlite3, bisect
from collections import defaultdict

DEV = os.path.join(os.path.dirname(__file__), "..", "web", "prisma", "dev.db")
TRUTH_YEAR = 2024  # newest year with clean, full R1 data


def orig_score(r):  # original hand-drawn curve (pre-calibration baseline), prob [0,1]
    if r <= 0.60: s = 100.0
    elif r <= 0.85: s = 90 - (r - 0.60) * (10 / 0.25)
    elif r <= 1.00: s = 80 - (r - 0.85) * (25 / 0.15)
    elif r <= 1.05: s = 55 - (r - 1.00) * (10 / 0.05)
    elif r <= 1.20: s = 45 - (r - 1.05) * (15 / 0.15)
    elif r <= 1.50: s = 30 - (r - 1.20) * (20 / 0.30)
    else: s = max(0.0, 10 - (r - 1.5) * 20)
    return s / 100.0


class Survival:
    def __init__(self, gs): self.g = sorted(gs); self.n = len(self.g)
    def p(self, rho):
        return (self.n - bisect.bisect_left(self.g, rho)) / self.n if self.n else 0.0


def ece(preds, outs, bins=10):
    B = [[0, 0.0, 0] for _ in range(bins)]
    for p, o in zip(preds, outs):
        k = min(bins - 1, int(p * bins)); B[k][0] += 1; B[k][1] += p; B[k][2] += o
    N = len(preds)
    return sum((c / N) * abs(sp / c - so / c) for c, sp, so in B if c)


def brier(preds, outs):
    return sum((p - o) ** 2 for p, o in zip(preds, outs)) / len(preds)


def main():
    con = sqlite3.connect(DEV)
    cells = defaultdict(dict)
    for cid, crs, cat, q, yr, cr in con.execute(
            "SELECT collegeId,courseId,category,quota,year,closingRank FROM CutoffSummary WHERE round='R1'"):
        cells[(cid, crs, cat, q)][yr] = cr
    con.close()

    prev = TRUTH_YEAR - 1
    data = defaultdict(list)  # cat -> [(proj, actual, g)]; 1-year basis: proj = prev-year closing
    for (cid, crs, cat, q), yv in cells.items():
        if TRUTH_YEAR in yv and prev in yv and yv[prev] > 0:
            data[cat].append((yv[prev], yv[TRUTH_YEAR], yv[TRUTH_YEAR] / yv[prev]))

    K = 5
    print(f"REFIT CALIBRATION  truth={TRUTH_YEAR} from {prev}  (5-fold CV vs original curve)")
    print(f"{'category':<10}{'cells':>7}{'ECE orig':>10}{'ECE cal':>10}{'drop':>9}")
    print("-" * 46)
    pooled = [0, 0, 0.0, 0.0]
    for cat in sorted(data, key=lambda c: -len(data[c])):
        D = data[cat]
        if len(D) < 20: continue
        pc, oc, pk, ok = [], [], [], []
        for f in range(K):
            train = [d for i, d in enumerate(D) if i % K != f]
            test = [d for i, d in enumerate(D) if i % K == f]
            if not train or not test: continue
            S = Survival([g for _, _, g in train])
            pool = sorted(a for _, a, _ in train)
            if len(pool) > 120: pool = pool[::max(1, len(pool) // 120)]
            for proj, actual, _ in test:
                for r in pool:
                    rho = r / proj; out = 1.0 if r <= actual else 0.0
                    pc.append(orig_score(rho)); oc.append(out)
                    pk.append(S.p(rho)); ok.append(out)
        if not pc: continue
        ec, ecal, ev = ece(pc, oc), ece(pk, ok), len(pc)
        print(f"{cat:<10}{len(D):>7}{ec:>10.4f}{ecal:>10.4f}{(ec - ecal):>9.4f}")
        pooled[0] += len(D); pooled[1] += ev; pooled[2] += ec * ev; pooled[3] += ecal * ev
    ev = pooled[1]
    print("-" * 46)
    print(f"{'POOLED':<10}{pooled[0]:>7}{pooled[2] / ev:>10.4f}{pooled[3] / ev:>10.4f}"
          f"{(pooled[2] - pooled[3]) / ev:>9.4f}")

    allg = [g for D in data.values() for _, _, g in D]
    Sall = Survival(allg)
    knots = [0.30, 0.40, 0.50, 0.60, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95, 1.00, 1.05,
             1.10, 1.15, 1.20, 1.25, 1.30, 1.35, 1.40, 1.50, 1.60, 1.70, 1.80, 1.90,
             2.00, 2.20, 2.50]
    print(f"\nCALIBRATION array for prediction.ts (fit on {len(allg)} cells):")
    print("  " + ", ".join(f"[{k:.2f}, {Sall.p(k):.4f}]" for k in knots))


if __name__ == "__main__":
    main()
