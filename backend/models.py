from sqlalchemy import (
    Column, Integer, String, Text, DateTime, ForeignKey, Enum, BigInteger
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(100), unique=True, nullable=False)
    created_at = Column(DateTime, default=func.now())

    repositories = relationship("Repository", back_populates="owner")
    commits = relationship("Commit", back_populates="author")


class Repository(Base):
    __tablename__ = "repositories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    default_branch = Column(String(50), default="main")
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    owner = relationship("User", back_populates="repositories")
    branches = relationship("Branch", back_populates="repository", cascade="all, delete")
    commits = relationship("Commit", back_populates="repository", cascade="all, delete")
    blobs = relationship("Blob", back_populates="repository", cascade="all, delete")
    trees = relationship("Tree", back_populates="repository", cascade="all, delete")
    tags = relationship("Tag", back_populates="repository", cascade="all, delete")


class Blob(Base):
    """Stores file contents (immutable, content-addressed)."""
    __tablename__ = "blobs"

    id = Column(Integer, primary_key=True, index=True)
    repo_id = Column(Integer, ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False)
    sha = Column(String(64), nullable=False)
    content = Column(Text)
    size = Column(Integer, default=0)
    created_at = Column(DateTime, default=func.now())

    repository = relationship("Repository", back_populates="blobs")


class Tree(Base):
    """A directory snapshot (collection of blobs and sub-trees)."""
    __tablename__ = "trees"

    id = Column(Integer, primary_key=True, index=True)
    repo_id = Column(Integer, ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False)
    sha = Column(String(64), nullable=False)
    created_at = Column(DateTime, default=func.now())

    repository = relationship("Repository", back_populates="trees")
    entries = relationship("TreeEntry", back_populates="tree", cascade="all, delete")
    commits = relationship("Commit", back_populates="tree")


class TreeEntry(Base):
    """Maps file names to blobs within a tree."""
    __tablename__ = "tree_entries"

    id = Column(Integer, primary_key=True, index=True)
    tree_id = Column(Integer, ForeignKey("trees.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    path = Column(String(1000), nullable=False)
    blob_id = Column(Integer, ForeignKey("blobs.id", ondelete="SET NULL"), nullable=True)
    file_type = Column(Enum("file", "dir"), default="file")
    mode = Column(String(10), default="100644")

    tree = relationship("Tree", back_populates="entries")
    blob = relationship("Blob")


class Commit(Base):
    __tablename__ = "commits"

    id = Column(Integer, primary_key=True, index=True)
    repo_id = Column(Integer, ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False)
    sha = Column(String(64), unique=True, nullable=False)
    message = Column(Text, nullable=False)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    tree_id = Column(Integer, ForeignKey("trees.id"), nullable=False)
    parent_commit_id = Column(Integer, ForeignKey("commits.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=func.now())

    repository = relationship("Repository", back_populates="commits")
    author = relationship("User", back_populates="commits")
    tree = relationship("Tree", back_populates="commits")
    parent = relationship("Commit", remote_side="Commit.id", foreign_keys=[parent_commit_id])


class Branch(Base):
    __tablename__ = "branches"

    id = Column(Integer, primary_key=True, index=True)
    repo_id = Column(Integer, ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    head_commit_id = Column(Integer, ForeignKey("commits.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    repository = relationship("Repository", back_populates="branches")
    head_commit = relationship("Commit", foreign_keys=[head_commit_id])


class Tag(Base):
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, index=True)
    repo_id = Column(Integer, ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    commit_id = Column(Integer, ForeignKey("commits.id", ondelete="CASCADE"), nullable=False)
    message = Column(Text)
    tagger_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=func.now())

    repository = relationship("Repository", back_populates="tags")
    commit = relationship("Commit")
    tagger = relationship("User")


class MergeLog(Base):
    __tablename__ = "merge_logs"

    id = Column(Integer, primary_key=True, index=True)
    repo_id = Column(Integer, ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False)
    source_branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False)
    target_branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False)
    merge_commit_id = Column(Integer, ForeignKey("commits.id", ondelete="SET NULL"), nullable=True)
    merged_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(Enum("success", "conflict", "pending"), default="pending")
    created_at = Column(DateTime, default=func.now())

    source_branch = relationship("Branch", foreign_keys=[source_branch_id])
    target_branch = relationship("Branch", foreign_keys=[target_branch_id])
    merge_commit = relationship("Commit")
    user = relationship("User")
