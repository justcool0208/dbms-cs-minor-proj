from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models, schemas

router = APIRouter(prefix="/repos", tags=["Branches"])


@router.post("/{repo_id}/branches", response_model=schemas.BranchOut, status_code=201)
def create_branch(repo_id: int, payload: schemas.BranchCreate, db: Session = Depends(get_db)):
    if not db.query(models.Repository).filter(models.Repository.id == repo_id).first():
        raise HTTPException(status_code=404, detail="Repository not found")

    existing = db.query(models.Branch).filter(
        models.Branch.repo_id == repo_id,
        models.Branch.name == payload.name
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Branch already exists")

    # Fork from another branch's HEAD
    head_commit_id = None
    if payload.from_branch:
        src = db.query(models.Branch).filter(
            models.Branch.repo_id == repo_id,
            models.Branch.name == payload.from_branch
        ).first()
        if src:
            head_commit_id = src.head_commit_id

    branch = models.Branch(repo_id=repo_id, name=payload.name, head_commit_id=head_commit_id)
    db.add(branch)
    db.commit()
    db.refresh(branch)
    return branch


@router.get("/{repo_id}/branches", response_model=list[schemas.BranchOut])
def list_branches(repo_id: int, db: Session = Depends(get_db)):
    if not db.query(models.Repository).filter(models.Repository.id == repo_id).first():
        raise HTTPException(status_code=404, detail="Repository not found")
    return db.query(models.Branch).filter(models.Branch.repo_id == repo_id).all()


@router.delete("/{repo_id}/branches/{branch_name}", status_code=204)
def delete_branch(repo_id: int, branch_name: str, db: Session = Depends(get_db)):
    branch = db.query(models.Branch).filter(
        models.Branch.repo_id == repo_id,
        models.Branch.name == branch_name
    ).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    if branch_name == "main":
        raise HTTPException(status_code=400, detail="Cannot delete the default branch")
    db.delete(branch)
    db.commit()


@router.post("/{repo_id}/merge", response_model=schemas.MergeOut)
def merge_branches(repo_id: int, payload: schemas.MergeRequest, db: Session = Depends(get_db)):
    """Fast-forward merge: moves target branch HEAD to source branch HEAD."""
    src = db.query(models.Branch).filter(
        models.Branch.repo_id == repo_id,
        models.Branch.name == payload.source_branch
    ).first()
    tgt = db.query(models.Branch).filter(
        models.Branch.repo_id == repo_id,
        models.Branch.name == payload.target_branch
    ).first()
    if not src or not tgt:
        raise HTTPException(status_code=404, detail="Branch not found")

    user = db.query(models.User).filter(models.User.id == payload.merged_by).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    merge_log = models.MergeLog(
        repo_id=repo_id,
        source_branch_id=src.id,
        target_branch_id=tgt.id,
        merged_by=payload.merged_by,
    )
    db.add(merge_log)
    db.flush()

    # Fast-forward: set target HEAD to source HEAD
    tgt.head_commit_id = src.head_commit_id
    merge_log.merge_commit_id = src.head_commit_id
    merge_log.status = "success"
    db.commit()
    db.refresh(merge_log)
    return merge_log
