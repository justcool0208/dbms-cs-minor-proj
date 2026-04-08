from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models, schemas

router = APIRouter(prefix="/repos", tags=["Repositories"])


@router.post("/", response_model=schemas.RepoOut, status_code=201)
def create_repo(payload: schemas.RepoCreate, db: Session = Depends(get_db)):
    owner = db.query(models.User).filter(models.User.id == payload.owner_id).first()
    if not owner:
        raise HTTPException(status_code=404, detail="Owner user not found")
    existing = db.query(models.Repository).filter(
        models.Repository.owner_id == payload.owner_id,
        models.Repository.name == payload.name
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Repository name already exists for this user")

    repo = models.Repository(
        name=payload.name,
        description=payload.description,
        owner_id=payload.owner_id,
    )
    db.add(repo)
    db.commit()
    db.refresh(repo)

    # Auto-create default branch (main)
    branch = models.Branch(repo_id=repo.id, name="main", head_commit_id=None)
    db.add(branch)
    db.commit()

    return repo


@router.get("/", response_model=list[schemas.RepoOut])
def list_repos(db: Session = Depends(get_db)):
    return db.query(models.Repository).all()


@router.get("/{repo_id}", response_model=schemas.RepoOut)
def get_repo(repo_id: int, db: Session = Depends(get_db)):
    repo = db.query(models.Repository).filter(models.Repository.id == repo_id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    return repo


@router.delete("/{repo_id}", status_code=204)
def delete_repo(repo_id: int, db: Session = Depends(get_db)):
    repo = db.query(models.Repository).filter(models.Repository.id == repo_id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    db.delete(repo)
    db.commit()
