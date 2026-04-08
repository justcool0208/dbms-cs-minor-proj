from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime


# ── Users ────────────────────────────────────────────
class UserCreate(BaseModel):
    username: str
    email: str

class UserOut(BaseModel):
    id: int
    username: str
    email: str
    created_at: datetime

    class Config:
        from_attributes = True


# ── Repositories ─────────────────────────────────────
class RepoCreate(BaseModel):
    name: str
    description: Optional[str] = None
    owner_id: int

class RepoOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    owner_id: int
    default_branch: str
    created_at: datetime
    updated_at: datetime
    owner: Optional[UserOut] = None

    class Config:
        from_attributes = True


# ── Blobs ─────────────────────────────────────────────
class BlobCreate(BaseModel):
    repo_id: int
    content: str

class BlobOut(BaseModel):
    id: int
    repo_id: int
    sha: str
    size: int
    created_at: datetime

    class Config:
        from_attributes = True


# ── Tree Entries ──────────────────────────────────────
class TreeEntryIn(BaseModel):
    name: str
    path: str
    content: str           # raw file content; backend hashes & stores as blob
    file_type: str = "file"
    mode: str = "100644"

class TreeEntryOut(BaseModel):
    id: int
    name: str
    path: str
    blob_id: Optional[int]
    file_type: str
    mode: str
    content: Optional[str] = None   # actual file content from the blob

    class Config:
        from_attributes = True


# ── Commits ───────────────────────────────────────────
class CommitCreate(BaseModel):
    repo_id: int
    author_id: int
    message: str
    branch_name: str = "main"
    files: List[TreeEntryIn] = []   # files included in this commit

class CommitOut(BaseModel):
    id: int
    repo_id: int
    sha: str
    message: str
    author_id: int
    tree_id: int
    parent_commit_id: Optional[int]
    created_at: datetime
    author: Optional[UserOut] = None

    class Config:
        from_attributes = True


# ── Branches ──────────────────────────────────────────
class BranchCreate(BaseModel):
    repo_id: int
    name: str
    from_branch: Optional[str] = "main"   # branch to fork from

class BranchOut(BaseModel):
    id: int
    repo_id: int
    name: str
    head_commit_id: Optional[int]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Tags ──────────────────────────────────────────────
class TagCreate(BaseModel):
    repo_id: int
    name: str
    commit_id: int
    message: Optional[str] = None
    tagger_id: int

class TagOut(BaseModel):
    id: int
    repo_id: int
    name: str
    commit_id: int
    message: Optional[str]
    tagger_id: int
    created_at: datetime

    class Config:
        from_attributes = True


# ── Merge ─────────────────────────────────────────────
class MergeRequest(BaseModel):
    repo_id: int
    source_branch: str
    target_branch: str
    merged_by: int

class MergeOut(BaseModel):
    id: int
    repo_id: int
    source_branch_id: int
    target_branch_id: int
    merge_commit_id: Optional[int]
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


# ── Diff ─────────────────────────────────────────────
class FileDiff(BaseModel):
    path: str
    status: str        # added | modified | deleted
    old_content: Optional[str] = None
    new_content: Optional[str] = None

class DiffOut(BaseModel):
    commit_sha: str
    parent_sha: Optional[str]
    files: List[FileDiff]
