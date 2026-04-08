from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models, schemas

router = APIRouter(prefix="/repos", tags=["Tags"])


@router.post("/{repo_id}/tags", response_model=schemas.TagOut, status_code=201)
def create_tag(repo_id: int, payload: schemas.TagCreate, db: Session = Depends(get_db)):
    if not db.query(models.Repository).filter(models.Repository.id == repo_id).first():
        raise HTTPException(status_code=404, detail="Repository not found")
    if not db.query(models.Commit).filter(models.Commit.id == payload.commit_id,
                                          models.Commit.repo_id == repo_id).first():
        raise HTTPException(status_code=404, detail="Commit not found in this repo")

    existing = db.query(models.Tag).filter(
        models.Tag.repo_id == repo_id, models.Tag.name == payload.name
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Tag already exists")

    tag = models.Tag(
        repo_id=repo_id,
        name=payload.name,
        commit_id=payload.commit_id,
        message=payload.message,
        tagger_id=payload.tagger_id,
    )
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


@router.get("/{repo_id}/tags", response_model=list[schemas.TagOut])
def list_tags(repo_id: int, db: Session = Depends(get_db)):
    if not db.query(models.Repository).filter(models.Repository.id == repo_id).first():
        raise HTTPException(status_code=404, detail="Repository not found")
    return db.query(models.Tag).filter(models.Tag.repo_id == repo_id).all()


@router.get("/{repo_id}/tree", response_model=list[schemas.TreeEntryOut])
def get_tree(repo_id: int, branch: str = "main", db: Session = Depends(get_db)):
    """Return the file tree with contents for the latest commit on a branch."""
    branch_obj = db.query(models.Branch).filter(
        models.Branch.repo_id == repo_id,
        models.Branch.name == branch
    ).first()
    if not branch_obj or not branch_obj.head_commit_id:
        return []
    commit = db.query(models.Commit).filter(models.Commit.id == branch_obj.head_commit_id).first()
    if not commit:
        return []

    entries = db.query(models.TreeEntry).filter(models.TreeEntry.tree_id == commit.tree_id).all()
    result = []
    for e in entries:
        blob = db.query(models.Blob).filter(models.Blob.id == e.blob_id).first() if e.blob_id else None
        result.append(schemas.TreeEntryOut(
            id=e.id,
            name=e.name,
            path=e.path,
            blob_id=e.blob_id,
            file_type=e.file_type,
            mode=e.mode,
            content=blob.content if blob else None,
        ))
    return result
