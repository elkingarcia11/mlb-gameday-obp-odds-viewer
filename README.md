# MLB Gameday OBP Odds Viewer

Landing page that loads today’s `{YYYY-MM-DD}_matchups.csv` from GCS and shows it as a color-coded table.

## Run locally

1. Install dependencies

```bash
npm install
```

2. Start dev server

```bash
npm run dev
```

Then open `http://localhost:5173`.

## Deploy to Google Cloud Run (Dockerfile)

Build and run locally:

```bash
docker build -t mlb-gameday-obp-odds-viewer .
docker run --rm -p 8080:8080 mlb-gameday-obp-odds-viewer
```

Then open `http://localhost:8080`.

Deploy with gcloud (example):

```bash
gcloud run deploy mlb-gameday-obp-odds-viewer \
  --source . \
  --region us-central1 \
  --allow-unauthenticated
```

## How it works

- The UI fetches matchup data via `GET /api/matchups?date=YYYY-MM-DD`.
- `server.js` proxies the CSV from GCS to avoid browser CORS issues.
- The **Download** button opens the raw CSV for the selected date in a new tab.

## Row color rules (as implemented)

Only color-code rows when **both** of these are true:

- `NHO > 0`
- `NPO < 0`

Then:

- **GREAT (green)**: `odds == "not favorite"`
- **good (yellow)**: `odds == "favorite"`

Where:

- `NHO` = `net_hitting_obp`
- `NPO` = `net_pitching_obp`

