from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine
import models

# Create all tables on startup
models.Base.metadata.create_all(bind=engine)

from routers import users, repos, commits, branches, tags

app = FastAPI(
    title="Git VCS — Relational Implementation",
    description="A relational database implementation of Git-style version control using FastAPI + MySQL.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router)
app.include_router(repos.router)
app.include_router(commits.router)
app.include_router(branches.router)
app.include_router(tags.router)


@app.get("/", tags=["Health"])
def root():
    return {"status": "ok", "message": "Git VCS API is running 🚀"}
