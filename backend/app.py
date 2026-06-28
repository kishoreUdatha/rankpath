from pathlib import Path

from fastapi import FastAPI, Depends, Form, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from .db import BacktestResult, CATEGORIES, College, Cutoff, get_session, init_db
from .predictor import BUCKETS, group_by_bucket, predict

ROOT = Path(__file__).resolve().parent.parent
TEMPLATES = Jinja2Templates(directory=str(ROOT / "templates"))

DISCLAIMER = (
    "RankPath is an analytics tool based on historical MCC AIQ Round 1 cutoffs. "
    "It does not guarantee admission. Always verify against official MCC notifications."
)

app = FastAPI(title="RankPath", version="0.1.0")
app.mount("/static", StaticFiles(directory=str(ROOT / "static")), name="static")


@app.on_event("startup")
def _startup() -> None:
    init_db()


@app.get("/", response_class=HTMLResponse)
def home(request: Request, db: Session = Depends(get_session)):
    n_colleges = db.query(College).count()
    n_cutoffs = db.query(Cutoff).count()
    years = sorted({y for (y,) in db.query(Cutoff.year).distinct().all()})
    return TEMPLATES.TemplateResponse(
        "index.html",
        {
            "request": request,
            "categories": CATEGORIES,
            "n_colleges": n_colleges,
            "n_cutoffs": n_cutoffs,
            "years": years,
            "disclaimer": DISCLAIMER,
        },
    )


@app.post("/predict", response_class=HTMLResponse)
def predict_route(
    request: Request,
    rank: int = Form(...),
    category: str = Form(...),
    limit: int = Form(50),
    db: Session = Depends(get_session),
):
    if rank <= 0 or category not in CATEGORIES:
        return TEMPLATES.TemplateResponse(
            "results.html",
            {
                "request": request,
                "error": "Invalid rank or category.",
                "disclaimer": DISCLAIMER,
            },
            status_code=400,
        )
    predictions = predict(db, candidate_rank=rank, category=category, limit=limit)
    groups = group_by_bucket(predictions)
    bucket_order = [name for name, _ in BUCKETS]
    return TEMPLATES.TemplateResponse(
        "results.html",
        {
            "request": request,
            "rank": rank,
            "category": category,
            "groups": groups,
            "bucket_order": bucket_order,
            "total": len(predictions),
            "disclaimer": DISCLAIMER,
        },
    )


@app.get("/api/predict")
def api_predict(
    rank: int,
    category: str,
    limit: int = 50,
    db: Session = Depends(get_session),
):
    if rank <= 0 or category not in CATEGORIES:
        return JSONResponse({"error": "invalid rank or category"}, status_code=400)
    predictions = predict(db, candidate_rank=rank, category=category, limit=limit)
    return {
        "disclaimer": DISCLAIMER,
        "rank": rank,
        "category": category,
        "count": len(predictions),
        "predictions": [p.to_dict() for p in predictions],
    }


@app.get("/colleges", response_class=HTMLResponse)
def colleges(request: Request, db: Session = Depends(get_session)):
    items = (
        db.query(College).order_by(College.name).all()
    )
    return TEMPLATES.TemplateResponse(
        "colleges.html",
        {"request": request, "colleges": items, "disclaimer": DISCLAIMER},
    )


@app.get("/college/{college_id}", response_class=HTMLResponse)
def college_detail(college_id: int, request: Request, db: Session = Depends(get_session)):
    college = db.query(College).get(college_id)
    if college is None:
        return HTMLResponse("Not found", status_code=404)
    cutoffs = []
    for course in college.courses:
        for c in course.cutoffs:
            cutoffs.append({"course": course.name, **c.__dict__})
    cutoffs.sort(key=lambda c: (c["year"], c["category"]), reverse=True)
    return TEMPLATES.TemplateResponse(
        "college_detail.html",
        {"request": request, "college": college, "cutoffs": cutoffs, "disclaimer": DISCLAIMER},
    )


@app.get("/backtest", response_class=HTMLResponse)
def backtest_page(request: Request, db: Session = Depends(get_session)):
    rows = (
        db.query(BacktestResult).order_by(BacktestResult.run_at.desc()).all()
    )
    return TEMPLATES.TemplateResponse(
        "backtest.html",
        {"request": request, "rows": rows, "disclaimer": DISCLAIMER},
    )


@app.get("/disclaimer", response_class=HTMLResponse)
def disclaimer_page(request: Request):
    return TEMPLATES.TemplateResponse(
        "disclaimer.html", {"request": request, "disclaimer": DISCLAIMER}
    )


@app.get("/health")
def health():
    return {"status": "ok"}
