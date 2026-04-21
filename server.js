import express from "express";

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 5173;

const GCS_BASE =
  "https://storage.googleapis.com/elkin-garcia-workspace-mlb-gameday-obp-odds-prod/data";

app.disable("x-powered-by");

app.get("/api/matchups", async (req, res) => {
  const date = String(req.query.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).type("text/plain").send("Invalid date. Use YYYY-MM-DD.");
    return;
  }

  const url = `${GCS_BASE}/${date}_matchups.csv`;

  let upstream;
  try {
    upstream = await fetch(url, { cache: "no-store" });
  } catch (e) {
    res.status(502).type("text/plain").send(`Upstream fetch failed: ${String(e)}`);
    return;
  }

  if (!upstream.ok) {
    res
      .status(upstream.status)
      .type("text/plain")
      .send(`Upstream returned HTTP ${upstream.status} for ${url}`);
    return;
  }

  const csv = await upstream.text();
  res.status(200).type("text/csv; charset=utf-8").send(csv);
});

app.use(express.static(".", { extensions: ["html"] }));

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Dev server running on http://localhost:${port}`);
});

