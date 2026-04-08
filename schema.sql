-- =====================================================
-- Relational Git Version Control - MySQL Schema
-- =====================================================

CREATE DATABASE IF NOT EXISTS git_vcs;
USE git_vcs;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Repositories table
CREATE TABLE IF NOT EXISTS repositories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    owner_id INT NOT NULL,
    default_branch VARCHAR(50) DEFAULT 'main',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_repo (owner_id, name)
);

-- Blobs - stores file content (the actual data)
CREATE TABLE IF NOT EXISTS blobs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    repo_id INT NOT NULL,
    sha VARCHAR(64) NOT NULL,          -- SHA-256 hash of content
    content LONGTEXT,
    size INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE CASCADE,
    UNIQUE KEY unique_blob (repo_id, sha)
);

-- Trees - represents directory snapshots
CREATE TABLE IF NOT EXISTS trees (
    id INT AUTO_INCREMENT PRIMARY KEY,
    repo_id INT NOT NULL,
    sha VARCHAR(64) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE CASCADE,
    UNIQUE KEY unique_tree (repo_id, sha)
);

-- Tree entries - maps file names/paths to blobs within a tree
CREATE TABLE IF NOT EXISTS tree_entries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tree_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,         -- file or folder name
    path VARCHAR(1000) NOT NULL,        -- full relative path
    blob_id INT,                        -- NULL if it's a subtree
    file_type ENUM('file','dir') DEFAULT 'file',
    mode VARCHAR(10) DEFAULT '100644',  -- unix-style permissions
    FOREIGN KEY (tree_id) REFERENCES trees(id) ON DELETE CASCADE,
    FOREIGN KEY (blob_id) REFERENCES blobs(id) ON DELETE SET NULL
);

-- Commits table
CREATE TABLE IF NOT EXISTS commits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    repo_id INT NOT NULL,
    sha VARCHAR(64) NOT NULL UNIQUE,    -- SHA-256 of commit metadata
    message TEXT NOT NULL,
    author_id INT NOT NULL,
    tree_id INT NOT NULL,               -- snapshot of the working directory
    parent_commit_id INT,               -- NULL for initial commit
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES users(id),
    FOREIGN KEY (tree_id) REFERENCES trees(id),
    FOREIGN KEY (parent_commit_id) REFERENCES commits(id) ON DELETE SET NULL
);

-- Branches table
CREATE TABLE IF NOT EXISTS branches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    repo_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    head_commit_id INT,                 -- current tip of branch
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE CASCADE,
    FOREIGN KEY (head_commit_id) REFERENCES commits(id) ON DELETE SET NULL,
    UNIQUE KEY unique_branch (repo_id, name)
);

-- Tags table
CREATE TABLE IF NOT EXISTS tags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    repo_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    commit_id INT NOT NULL,
    message TEXT,
    tagger_id INT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE CASCADE,
    FOREIGN KEY (commit_id) REFERENCES commits(id) ON DELETE CASCADE,
    FOREIGN KEY (tagger_id) REFERENCES users(id),
    UNIQUE KEY unique_tag (repo_id, name)
);

-- Merge logs (records merge operations)
CREATE TABLE IF NOT EXISTS merge_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    repo_id INT NOT NULL,
    source_branch_id INT NOT NULL,
    target_branch_id INT NOT NULL,
    merge_commit_id INT,
    merged_by INT NOT NULL,
    status ENUM('success','conflict','pending') DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE CASCADE,
    FOREIGN KEY (source_branch_id) REFERENCES branches(id),
    FOREIGN KEY (target_branch_id) REFERENCES branches(id),
    FOREIGN KEY (merge_commit_id) REFERENCES commits(id) ON DELETE SET NULL,
    FOREIGN KEY (merged_by) REFERENCES users(id)
);

-- =====================================================
-- Sample seed data
-- =====================================================

INSERT INTO users (username, email) VALUES
  ('alice', 'alice@example.com'),
  ('bob',   'bob@example.com');
