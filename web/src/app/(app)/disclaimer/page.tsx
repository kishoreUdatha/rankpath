import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DisclaimerPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Disclaimer &amp; Data Policy</h1>
        <p className="text-ink-500 mt-2">Last updated: {new Date().toLocaleDateString("en-IN")}</p>
      </header>

      <Card>
        <CardHeader><CardTitle>Not a guarantee of admission</CardTitle></CardHeader>
        <CardContent className="prose prose-sm max-w-none text-ink-700">
          <p>
            Every shortlist on RankPath is a <strong>probability based on previous allotment trends</strong> across
            category, quota, rank, state and college preference. Counselling outcomes are governed by the
            <strong> Medical Counselling Committee (DGHS)</strong>, state authorities and individual institutions; the
            seat matrix, fee structure, reservation policies and round-by-round movement can change at any time.
          </p>
          <p>
            <strong>Always verify against the official notice on mcc.nic.in</strong> and the relevant state counselling
            portal before making any decision. RankPath provides analytics, not admission advice.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>What we collect</CardTitle></CardHeader>
        <CardContent className="prose prose-sm max-w-none text-ink-700">
          <ul>
            <li>Public allotment result PDFs/XLS/CSVs from official counselling authority pages.</li>
            <li>Per row: <strong>rank, category, quota, college, course, round, year</strong>.</li>
            <li>Provenance: source URL, source filename, last-updated timestamp.</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>What we deliberately do NOT collect</CardTitle></CardHeader>
        <CardContent className="prose prose-sm max-w-none text-ink-700">
          <ul>
            <li>No candidate names, phone numbers, email IDs, dates of birth, or application numbers.</li>
            <li>No login-only pages. We never log in to a counselling portal as a candidate.</li>
            <li>Any candidate name accidentally present in raw PDFs is <strong>masked at parse time</strong>.</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Prediction model</CardTitle></CardHeader>
        <CardContent className="prose prose-sm max-w-none text-ink-700">
          <p>Projected closing rank = <code>0.50 × Y(t-1) + 0.30 × Y(t-2) + 0.20 × Y(t-3)</code>.</p>
          <p>Confidence bands:</p>
          <ul>
            <li><strong>80–100</strong> High chance · <strong>55–79</strong> Moderate · <strong>30–54</strong> Low · <strong>&lt;30</strong> Unlikely</li>
          </ul>
          <p>The model does not account for: NEET-difficulty swings, seat-matrix expansions/contractions, new colleges,
             policy changes (e.g. reservation revisions), or round-specific movement patterns. Treat the projection as a
             starting point, not a final answer.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Contact &amp; data correction</CardTitle></CardHeader>
        <CardContent className="prose prose-sm max-w-none text-ink-700">
          <p>If you spot incorrect data attributed to a particular college or category, please open an issue in our
             repository with the source PDF link so we can reconcile. We re-process raw files monthly.</p>
        </CardContent>
      </Card>
    </div>
  );
}
