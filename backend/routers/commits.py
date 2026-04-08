import hashlib
import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models, schemas

router = APIRouter(prefix="/repos", tags=["Commits"])


def _sha256(content: str) -> str:
    return hashlib.sha256(content.encode()).hexdigest()


def _get_or_create_blob(db: Session, repo_id: int, content: str) -> models.Blob:
    sha = _sha256(content)
    blob = db.query(models.Blob).filter(
        models.Blob.repo_id == repo_id, models.Blob.sha == sha
    ).first()
    if not blob:
        blob = models.Blob(repo_id=repo_id, sha=sha, content=content, size=len(content.encode()))
        db.add(blob)
        db.flush()
    return blob


def _build_tree(db: Session, repo_id: int, files: list[schemas.TreeEntryIn], tree_sha: str) -> models.Tree:
    tree = models.Tree(repo_id=repo_id, sha=tree_sha)
    db.add(tree)
    db.flush()
    for f in files:
        blob = _get_or_create_blob(db, repo_id, f.content)
        entry = models.TreeEntry(
            tree_id=tree.id,
            name=f.name,
            path=f.path,
            blob_id=blob.id,
            file_type=f.file_type,
            mode=f.mode,
        )
        db.add(entry)
    db.flush()
    return tree


@router.post("/{repo_id}/commits", response_model=schemas.CommitOut, status_code=201)
def create_commit(repo_id: int, payload: schemas.CommitCreate, db: Session = Depends(get_db)):
    repo = db.query(models.Repository).filter(models.Repository.id == repo_id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    author = db.query(models.User).filter(models.User.id == payload.author_id).first()
    if not author:
        raise HTTPException(status_code=404, detail="Author not found")

    branch = db.query(models.Branch).filter(
        models.Branch.repo_id == repo_id,
        models.Branch.name == payload.branch_name
    ).first()
    if not branch:
        raise HTTPException(status_code=404, detail=f"Branch '{payload.branch_name}' not found")

    parent_commit_id = branch.head_commit_id

    # Build tree SHA from file paths+contents
    tree_data = sorted([(f.path, f.content) for f in payload.files])
    tree_sha = _sha256(json.dumps(tree_data))

    tree = _build_tree(db, repo_id, payload.files, tree_sha)

    # Commit SHA = hash of (repo, author, message, tree, parent)
    commit_raw = f"{repo_id}:{payload.author_id}:{payload.message}:{tree_sha}:{parent_commit_id}"
    commit_sha = _sha256(commit_raw)

    if db.query(models.Commit).filter(models.Commit.sha == commit_sha).first():
        raise HTTPException(status_code=400, detail="Identical commit already exists")

    commit = models.Commit(
        repo_id=repo_id,
        sha=commit_sha,
        message=payload.message,
        author_id=payload.author_id,
        tree_id=tree.id,
        parent_commit_id=parent_commit_id,
    )
    db.add(commit)
    db.flush()

    # Advance branch head
    branch.head_commit_id = commit.id
    db.commit()
    db.refresh(commit)
    return commit


@router.get("/{repo_id}/commits", response_model=list[schemas.CommitOut])
def list_commits(repo_id: int, branch: str = "main", db: Session = Depends(get_db)):
    """Walk the commit chain from branch HEAD backwards (git log)."""
    branch_obj = db.query(models.Branch).filter(
        models.Branch.repo_id == repo_id,
        models.Branch.name == branch
    ).first()
    if not branch_obj:
        raise HTTPException(status_code=404, detail="Branch not found")

    commits = []
    current_id = branch_obj.head_commit_id
    while current_id:
        c = db.query(models.Commit).filter(models.Commit.id == current_id).first()
        if not c:
            break
        commits.append(c)
        current_id = c.parent_commit_id
    return commits


@router.get("/{repo_id}/commits/{commit_sha}/diff", response_model=schemas.DiffOut)
def get_diff(repo_id: int, commit_sha: str, db: Session = Depends(get_db)):
    """Show files changed between a commit and its parent."""
    commit = db.query(models.Commit).filter(
        models.Commit.repo_id == repo_id,
        models.Commit.sha == commit_sha
    ).first()
    if not commit:
        raise HTTPException(status_code=404, detail="Commit not found")

    def _tree_files(tree_id) -> dict:
        """Returns {path: content}"""
        if not tree_id:
            return {}
        entries = db.query(models.TreeEntry).filter(models.TreeEntry.tree_id == tree_id).all()
        result = {}
        for e in entries:
            blob = db.query(models.Blob).filter(models.Blob.id == e.blob_id).first()
            result[e.path] = blob.content if blob else ""
        return result

    new_files = _tree_files(commit.tree_id)
    parent_sha = None
    old_files = {}
    if commit.parent_commit_id:
        parent = db.query(models.Commit).filter(models.Commit.id == commit.parent_commit_id).first()
        if parent:
            parent_sha = parent.sha
            old_files = _tree_files(parent.tree_id)

    diffs = []
    all_paths = set(new_files) | set(old_files)
    for path in sorted(all_paths):
        if path in new_files and path not in old_files:
            diffs.append(schemas.FileDiff(path=path, status="added", new_content=new_files[path]))
        elif path in old_files and path not in new_files:
            diffs.append(schemas.FileDiff(path=path, status="deleted", old_content=old_files[path]))
        elif new_files[path] != old_files[path]:
            diffs.append(schemas.FileDiff(path=path, status="modified",
                                          old_content=old_files[path], new_content=new_files[path]))

    return schemas.DiffOut(commit_sha=commit_sha, parent_sha=parent_sha, files=diffs)
