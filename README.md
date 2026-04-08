# GitDB — Relational Implementation of Git Version Control

> A DBMS course project that implements Git's core version control concepts using a **MySQL relational database**, a **FastAPI** REST backend, and a **GitHub-inspired** web frontend.

---

## Table of Contents

1. [What Is This?](#what-is-this)
2. [How Git Concepts Map to SQL Tables](#how-git-concepts-map-to-sql-tables)
3. [Database Schema](#database-schema)
4. [How the System Works](#how-the-system-works)
5. [Project Structure](#project-structure)
6. [Setup & Run](#setup--run)
7. [API Reference](#api-reference)
8. [Using the UI](#using-the-ui)

---

## What Is This?

Real Git stores its data as a **content-addressed object store** on the filesystem (blobs, trees, commits as binary files). This project re-creates the same model inside a **relational database** — every Git object becomes a row, every relationship becomes a foreign key.

The goal is to show that Git's data model is fundamentally relational:

| Git Concept | Real Git Storage | This Project |
|---|---|---|
| File content | Binary blob file | `blobs` table row |
| Directory snapshot | Tree object file | `trees` + `tree_entries` rows |
| Commit | Commit object file | `commits` table row |
| Branch | Text file with a SHA | `branches` table row |
| Tag | Tag object file | `tags` table row |
| History | DAG of object files | Linked list via `parent_commit_id` FK |

---

## How Git Concepts Map to SQL Tables

### 1. Blob — File Content Storage

In real Git, a blob is a compressed file holding raw content, named by its SHA-1 hash.

Here, when you commit a file:
1. The content is SHA-256 hashed.
2. If a blob with that hash already exists (deduplication), it is reused.
3. Otherwise a new row is inserted into `blobs`.

```sql
-- Two commits with identical README.md → only ONE blob row
SELECT * FROM blobs WHERE sha = '<hash-of-content>';
```

**Key property:** Content is *immutable*. You never update a blob, only create new ones.

---

### 2. Tree — Directory Snapshot

A tree maps file names/paths to blobs. Every commit points to exactly one tree that represents the entire working directory at that moment.

```
commit
  └── tree
        ├── tree_entry → blob (README.md)
        ├── tree_entry → blob (main.py)
        └── tree_entry → blob (utils.py)
```

The `tree_entries` table is the join table between `trees` and `blobs`, also storing the file path and permissions.

---

### 3. Commit — Snapshot in Time

A commit row records:
- **What** changed → `tree_id` (points to the directory snapshot)
- **Who** did it → `author_id`
- **Why** → `message`
- **When** → `created_at`
- **What came before** → `parent_commit_id`

The `parent_commit_id` self-referential foreign key is how Git's history chain works in this system. Walking backwards from a branch's `head_commit_id` gives you the full commit log.

```sql
-- Equivalent of "git log"
WITH RECURSIVE log AS (
  SELECT * FROM commits WHERE id = <branch_head_id>
  UNION ALL
  SELECT c.* FROM commits c JOIN log l ON c.id = l.parent_commit_id
)
SELECT sha, message, created_at FROM log;
```

---

### 4. Branch — A Pointer to a Commit

In real Git, a branch is literally just a text file containing a SHA. Here, it is a row in the `branches` table with a `head_commit_id` foreign key.

**Creating a branch** → INSERT one row.  
**Making a commit** → UPDATE `head_commit_id` to the new commit's id.  
**Branching is free** — no data is copied.

---

### 5. Merge — Moving a Pointer

This project implements **fast-forward merge**: when you merge branch A into branch B, the target branch's `head_commit_id` is simply set to point to the source branch's HEAD. The operation is recorded in `merge_logs`.

---

### 6. Diff — Comparing Trees

A diff is computed by:
1. Loading the tree entries of commit N.
2. Loading the tree entries of commit N's parent.
3. Comparing the two sets of `{path → content}` maps.

Files present only in N → **Added**  
Files present only in parent → **Deleted**  
Files in both but with different blob SHA → **Modified**

No binary patching. Pure SQL joins.

---

## Database Schema

```
┌──────────┐     ┌───────────────┐     ┌─────────┐
│  users   │────▶│ repositories  │────▶│branches │
└──────────┘     └───────────────┘     └────┬────┘
                        │                   │
                        ▼                   │
                  ┌─────────┐               │
                  │ commits │◀──────────────┘
                  └────┬────┘  head_commit_id
                       │
               ┌───────┴───────┐
               ▼               ▼
           ┌───────┐      ┌────────┐
           │ trees │      │ tags   │
           └───┬───┘      └────────┘
               │
      ┌────────▼──────────┐
      │   tree_entries    │
      └────────┬──────────┘
               │
           ┌───▼───┐
           │ blobs │  ← actual file content
           └───────┘
```

### Tables

| Table | Key Columns | Purpose |
|---|---|---|
| `users` | `id, username, email` | Accounts / authors |
| `repositories` | `id, name, owner_id, default_branch` | Git repos |
| `blobs` | `id, sha (SHA-256), content, size` | Immutable file content |
| `trees` | `id, sha` | Directory snapshots |
| `tree_entries` | `tree_id, name, path, blob_id` | File listings inside a tree |
| `commits` | `id, sha, message, author_id, tree_id, parent_commit_id` | Commit history |
| `branches` | `id, name, repo_id, head_commit_id` | Branch pointers |
| `tags` | `id, name, commit_id, tagger_id, message` | Named commit references |
| `merge_logs` | `source_branch_id, target_branch_id, status` | Merge operation records |

---

## Project Structure

```
DBMS/
├── schema.sql                  ← Run this in MySQL first
├── README.md
│
├── backend/
│   ├── main.py                 ← FastAPI app entry point
│   ├── database.py             ← SQLAlchemy engine + session
│   ├── models.py               ← ORM models (one class per table)
│   ├── schemas.py              ← Pydantic request/response types
│   ├── .env                    ← DB credentials (edit this!)
│   ├── requirements.txt
│   └── routers/
│       ├── users.py            ← POST /users, GET /users
│       ├── repos.py            ← CRUD for repositories
│       ├── commits.py          ← Create commits, git log, diff
│       ├── branches.py         ← Create/delete branches, merge
│       └── tags.py             ← Tags + file tree viewer
│
└── frontend/
    ├── index.html              ← Single-page app shell + modals
    ├── style.css               ← GitHub dark theme
    └── app.js                  ← All UI logic (no framework)
```

---

## Setup & Run

### Step 1 — Create the MySQL Database

Open MySQL Workbench or CLI and run:

```sql
SOURCE C:/path/to/DBMS/schema.sql;
```

This creates the `git_vcs` database and all 9 tables with sample users.

---

### Step 2 — Configure Database Credentials

Edit `backend/.env`:

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password_here
DB_NAME=git_vcs
```

---

### Step 3 — Install Python Dependencies

```powershell
cd backend
pip install -r requirements.txt
```

---

### Step 4 — Start the Backend

```powershell
cd backend
uvicorn main:app --reload
```

- API runs at: **http://localhost:8000**
- Interactive API docs: **http://localhost:8000/docs**

---

### Step 5 — Open the Frontend

Double-click `frontend/index.html` in File Explorer, or open it with Live Server in VS Code.

> No build step required. The frontend is plain HTML, CSS, and JavaScript.

---

## API Reference

### Users
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/users/` | Create a user |
| `GET`  | `/users/` | List all users |
| `GET`  | `/users/{id}` | Get one user |

### Repositories
| Method | Path | Description |
|--------|------|-------------|
| `POST`   | `/repos/` | Create repository (also creates `main` branch) |
| `GET`    | `/repos/` | List all repositories |
| `GET`    | `/repos/{id}` | Get repository details |
| `DELETE` | `/repos/{id}` | Delete repository (cascades) |

### Commits
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/repos/{id}/commits` | Create a commit with files |
| `GET`  | `/repos/{id}/commits?branch=main` | Get commit history (git log) |
| `GET`  | `/repos/{id}/commits/{sha}/diff` | Get diff vs parent commit |

### Branches
| Method | Path | Description |
|--------|------|-------------|
| `POST`   | `/repos/{id}/branches` | Create a branch (fork from another) |
| `GET`    | `/repos/{id}/branches` | List branches |
| `DELETE` | `/repos/{id}/branches/{name}` | Delete a branch |
| `POST`   | `/repos/{id}/merge` | Fast-forward merge |

### Tags & File Tree
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/repos/{id}/tags` | Create a tag |
| `GET`  | `/repos/{id}/tags` | List tags |
| `GET`  | `/repos/{id}/tree?branch=main` | Get file tree with content |

---

## Using the UI

### Typical Workflow

```
1. Create a user          →  Users → + New User
2. Create a repository    →  + New Repository (top right)
3. Open the repository    →  Click the repo card
4. Make a commit          →  + Commit button → add files → Commit Changes
5. Browse files           →  Click any filename → view full content
6. View history           →  Commits tab → click a SHA chip → see diff
7. Create a branch        →  ⎇ New Branch button → enter name
8. Merge branches         →  Branches tab → Merge button
9. Tag a release          →  Tags tab → New Tag → pick a commit
```

### UI Pages

| Page | What you see |
|---|---|
| **Home** | All repositories as cards |
| **Users** | User table with create button |
| **Repo → Code** | File browser (latest commit on branch), branch switcher |
| **File Viewer** | Full file content with line numbers |
| **Repo → Commits** | Commit history log |
| **Commit Diff** | Files changed in that commit (added/modified/deleted) |
| **Repo → Branches** | All branches, create/delete/merge |
| **Repo → Tags** | Tagged commits |
