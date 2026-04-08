/* =====================================================
   GitDB — Frontend App  (GitHub-like SPA)
   ===================================================== */

const API = 'http://localhost:8000';

// ── State ────────────────────────────────────────────
let state = {
  users:   [],
  repos:   [],
  // current repo context
  repo:    null,
  branch:  'main',
  branches:[],
  // current view: 'home' | 'users' | 'repo' | 'file' | 'commit'
  view:    'home',
  repoTab: 'code',   // code | commits | branches | tags
};

// ── Boot ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadGlobals();
  render();
});

async function loadGlobals() {
  [state.users, state.repos] = await Promise.all([
    apiFetch('/users/').catch(() => []),
    apiFetch('/repos/').catch(() => []),
  ]);
}

// ── Router ───────────────────────────────────────────
async function goHome() {
  await loadGlobals();
  state.view = 'home';
  state.repo = null;
  render();
}

async function showView(v) {
  state.view = v;
  render();
}

async function openRepo(repo) {
  state.repo   = repo;
  state.view   = 'repo';
  state.repoTab = 'code';
  state.branch = repo.default_branch || 'main';
  state.branches = await apiFetch(`/repos/${repo.id}/branches`).catch(() => []);
  render();
}

async function switchRepoTab(tab) {
  state.repoTab = tab;
  render();
}

async function switchBranch(branchName) {
  state.branch = branchName;
  render();
}

// ── Render ───────────────────────────────────────────
function render() {
  const app = document.getElementById('app');
  switch (state.view) {
    case 'home':   app.innerHTML = renderHome();   break;
    case 'users':  app.innerHTML = renderUsers();  break;
    case 'repo':   renderRepo(app);                break;
    case 'file':   renderFile(app);                break;
    case 'commit': renderCommitDiff(app);          break;
    default:       app.innerHTML = renderHome();
  }
}

// ── HOME ──────────────────────────────────────────────
function renderHome() {
  if (!state.repos.length) {
    return `
      <div class="home-header">
        <h2>Repositories</h2>
        <button class="btn-new" onclick="openModal('modal-new-repo')">+ New Repository</button>
      </div>
      <div class="empty-state">
        <div class="big">📂</div>
        <p>No repositories yet.</p>
        <button class="btn-primary" onclick="openModal('modal-new-repo')">Create your first repository</button>
      </div>`;
  }
  return `
    <div class="home-header">
      <h2>Repositories <span style="color:var(--muted);font-weight:400;font-size:16px">(${state.repos.length})</span></h2>
      <button class="btn-new" onclick="openModal('modal-new-repo')">+ New Repository</button>
    </div>
    <div class="repo-grid">
      ${state.repos.map(r => `
        <div class="repo-card" onclick="openRepo(${JSON.stringify(r).replace(/"/g,'&quot;')})">
          <div class="repo-card-name">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8Z"/></svg>
            ${r.name}
          </div>
          <div class="repo-card-desc">${r.description || '<em style="color:var(--muted)">No description</em>'}</div>
          <div class="repo-card-meta">
            <span><span class="dot-green">⬤</span> ${r.default_branch}</span>
            <span>Owner #${r.owner_id}</span>
            <span>${timeAgo(r.created_at)}</span>
          </div>
        </div>
      `).join('')}
    </div>`;
}

// ── USERS ─────────────────────────────────────────────
function renderUsers() {
  return `
    <div class="users-header">
      <h2>Users</h2>
      <button class="btn-new" onclick="openModal('modal-new-user')">+ New User</button>
    </div>
    ${!state.users.length
      ? `<div class="empty-state"><div class="big">👤</div><p>No users yet.</p>
          <button class="btn-primary" onclick="openModal('modal-new-user')">Create first user</button></div>`
      : `<table class="user-table">
          <thead><tr><th>User</th><th>Email</th><th>ID</th><th>Joined</th></tr></thead>
          <tbody>
          ${state.users.map(u => `
            <tr>
              <td><span class="user-avatar">${u.username[0].toUpperCase()}</span>${u.username}</td>
              <td style="color:var(--muted)">${u.email}</td>
              <td><code>#${u.id}</code></td>
              <td style="color:var(--muted)">${timeAgo(u.created_at)}</td>
            </tr>`).join('')}
          </tbody>
        </table>`
    }`;
}

// ── REPO VIEW ─────────────────────────────────────────
async function renderRepo(app) {
  const r = state.repo;
  app.innerHTML = `
    <div class="repo-breadcrumb">
      <a onclick="goHome()">Repositories</a>
      <span class="sep">/</span>
      ${r.name}
    </div>
    <div class="repo-tabs">
      <button class="repo-tab ${state.repoTab==='code'?'active':''}"     onclick="switchRepoTab('code')">📄 Code</button>
      <button class="repo-tab ${state.repoTab==='commits'?'active':''}"  onclick="switchRepoTab('commits')">● Commits</button>
      <button class="repo-tab ${state.repoTab==='branches'?'active':''}" onclick="switchRepoTab('branches')">⎇ Branches</button>
      <button class="repo-tab ${state.repoTab==='tags'?'active':''}"     onclick="switchRepoTab('tags')">🏷 Tags</button>
    </div>
    <div id="repo-tab-content"><div class="empty-state">Loading...</div></div>`;

  const content = document.getElementById('repo-tab-content');

  switch (state.repoTab) {
    case 'code':     await renderCodeTab(content); break;
    case 'commits':  await renderCommitsTab(content); break;
    case 'branches': await renderBranchesTab(content); break;
    case 'tags':     await renderTagsTab(content); break;
  }
}

// ── CODE TAB ──────────────────────────────────────────
async function renderCodeTab(container) {
  const r = state.repo;
  const branchOpts = state.branches.map(b =>
    `<option value="${b.name}" ${b.name===state.branch?'selected':''}>${b.name}</option>`).join('');

  let files = [];
  let lastCommit = null;
  try {
    files = await apiFetch(`/repos/${r.id}/tree?branch=${encodeURIComponent(state.branch)}`);
    const commits = await apiFetch(`/repos/${r.id}/commits?branch=${encodeURIComponent(state.branch)}`);
    lastCommit = commits[0] || null;
  } catch {}

  const authorName = lastCommit
    ? (state.users.find(u => u.id === lastCommit.author_id)?.username || `#${lastCommit.author_id}`)
    : null;

  container.innerHTML = `
    <div class="branch-bar">
      <div class="branch-select-wrap">
        <span class="branch-icon">⎇</span>
        <select class="input" id="branch-switcher" onchange="switchBranch(this.value)">${branchOpts}</select>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn-outline btn-sm" onclick="openCommitModal()">+ Commit</button>
        <button class="btn-outline btn-sm" onclick="openModal('modal-branch')">⎇ New Branch</button>
      </div>
    </div>

    <div class="file-table">
      <div class="file-table-header">
        ${lastCommit
          ? `<div class="commit-info">${esc(lastCommit.message)}</div>
             <span style="color:var(--muted);font-size:12px">${authorName} · ${timeAgo(lastCommit.created_at)}</span>
             <span class="sha-chip" onclick="viewCommit('${lastCommit.sha}')">${lastCommit.sha.substring(0,7)}</span>`
          : `<div class="commit-info" style="color:var(--muted)">No commits yet</div>`
        }
      </div>
      ${!files.length
        ? `<div class="no-files">
             <p style="color:var(--muted);margin-bottom:16px">This branch has no committed files yet.</p>
             <button class="btn-primary" onclick="openCommitModal()">Make your first commit</button>
           </div>`
        : files.map(f => `
            <div class="file-row" onclick="viewFile(${JSON.stringify(f).replace(/"/g,'&quot;')})">
              <span class="file-row-icon">📄</span>
              <span class="file-row-name">${esc(f.name)}</span>
              <span class="file-row-date">${f.mode}</span>
            </div>`).join('')
      }
    </div>`;
}

// ── COMMITS TAB ───────────────────────────────────────
async function renderCommitsTab(container) {
  const r = state.repo;
  let commits = [];
  try {
    commits = await apiFetch(`/repos/${r.id}/commits?branch=${encodeURIComponent(state.branch)}`);
  } catch {}

  const branchOpts = state.branches.map(b =>
    `<option value="${b.name}" ${b.name===state.branch?'selected':''}>${b.name}</option>`).join('');

  container.innerHTML = `
    <div class="commits-header">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="color:var(--muted);font-size:13px">⎇</span>
        <select class="input" onchange="state.branch=this.value;switchRepoTab('commits')">${branchOpts}</select>
        <span style="color:var(--muted);font-size:13px">${commits.length} commit${commits.length!==1?'s':''}</span>
      </div>
    </div>
    ${!commits.length
      ? `<div class="empty-state"><p>No commits on this branch yet.</p>
          <button class="btn-primary" onclick="openCommitModal()">Make first commit</button></div>`
      : `<div class="commit-group-header">Commits on ${state.branch}</div>
         <div class="commit-list">
         ${commits.map(c => {
           const author = state.users.find(u => u.id === c.author_id)?.username || `#${c.author_id}`;
           return `
            <div class="commit-item">
              <div class="commit-dot"></div>
              <div class="commit-msg-wrap">
                <div class="commit-msg">${esc(c.message)}</div>
                <div class="commit-sub">
                  <span>${author}</span>
                  <span>committed ${timeAgo(c.created_at)}</span>
                  ${c.parent_commit_id ? '' : '<span style="color:var(--green)">Initial commit</span>'}
                </div>
              </div>
              <div class="commit-right">
                <span class="sha-chip" onclick="viewCommit('${c.sha}')" title="View diff">${c.sha.substring(0,7)}</span>
              </div>
            </div>`;
         }).join('')}
         </div>`
    }`;
}

// ── BRANCHES TAB ──────────────────────────────────────
async function renderBranchesTab(container) {
  const r = state.repo;
  const branches = state.branches;

  container.innerHTML = `
    <div class="section-actions">
      <button class="btn-primary" onclick="openModal('modal-branch')">⎇ New branch</button>
      <button class="btn-outline" onclick="openMergeModal()">⇄ Merge</button>
    </div>
    ${!branches.length
      ? `<div class="empty-state"><p>No branches found.</p></div>`
      : `<div class="branch-list">
         ${branches.map(b => `
           <div class="branch-item">
             <div class="branch-name">
               <span>⎇</span> ${b.name}
               ${b.name === r.default_branch ? '<span class="default-badge">default</span>' : ''}
             </div>
             <div class="branch-meta">Updated ${timeAgo(b.updated_at)}</div>
             ${b.name !== r.default_branch
               ? `<button class="btn-danger btn-sm" onclick="deleteBranch('${b.name}',${b.id})">Delete</button>`
               : ''}
           </div>`).join('')}
         </div>`
    }`;
}

// ── TAGS TAB ──────────────────────────────────────────
async function renderTagsTab(container) {
  const r = state.repo;
  let tags = [];
  let commits = [];
  try {
    [tags, commits] = await Promise.all([
      apiFetch(`/repos/${r.id}/tags`),
      apiFetch(`/repos/${r.id}/commits?branch=${encodeURIComponent(state.branch)}`),
    ]);
  } catch {}

  // store commits for modal
  window._tagCommits = commits;

  container.innerHTML = `
    <div class="section-actions">
      <button class="btn-primary" onclick="openTagModal()">🏷 New tag</button>
    </div>
    ${!tags.length
      ? `<div class="empty-state"><p>No tags yet. Tag a commit to mark a release.</p></div>`
      : `<div class="branch-list">
         ${tags.map(t => {
           const tagger = state.users.find(u=>u.id===t.tagger_id)?.username || `#${t.tagger_id}`;
           return `
            <div class="tag-item">
              <div class="tag-name">🏷 ${esc(t.name)}</div>
              <div class="tag-meta">${t.message || ''} · by ${tagger} · ${timeAgo(t.created_at)}</div>
              <code style="font-size:11px">commit #${t.commit_id}</code>
            </div>`;
         }).join('')}
         </div>`
    }`;
}

// ── FILE VIEWER ───────────────────────────────────────
async function viewFile(file) {
  state.view = 'file';
  state._file = file;
  render();
}

function renderFile(app) {
  const f = state._file;
  const content = f.content || '';
  const lines   = content.split('\n');

  app.innerHTML = `
    <div class="back-link" onclick="state.view='repo';state.repoTab='code';render()">
      ← Back to ${state.repo.name}
    </div>
    <div class="file-viewer">
      <div class="file-viewer-header">
        <div>
          <span class="path">${state.repo.name}</span>
          <span style="color:var(--muted)"> / </span>
          <span style="font-weight:600">${esc(f.name)}</span>
        </div>
        <div class="file-viewer-meta">
          <span>${lines.length} lines</span>
          <span>${f.size ? f.size + ' bytes' : (new Blob([content]).size) + ' bytes'}</span>
          <code>${f.mode}</code>
        </div>
      </div>
      <div class="file-content">
        <table>
          ${lines.map((line, i) => `
            <tr>
              <td class="line-num">${i+1}</td>
              <td class="line-code">${esc(line)}</td>
            </tr>`).join('')}
        </table>
      </div>
    </div>`;
}

// ── COMMIT DIFF ───────────────────────────────────────
async function viewCommit(sha) {
  state.view = 'commit';
  state._commitSha = sha;
  render();
}

async function renderCommitDiff(app) {
  const r = state.repo;
  const sha = state._commitSha;
  app.innerHTML = `<div class="back-link" onclick="state.view='repo';state.repoTab='commits';render()">← Back to commits</div><div class="empty-state">Loading diff...</div>`;

  let diff = null;
  try {
    diff = await apiFetch(`/repos/${r.id}/commits/${sha}/diff`);
  } catch(e) {
    app.innerHTML += `<div class="empty-state" style="color:var(--red)">${e.message}</div>`;
    return;
  }

  const allCommits = await apiFetch(`/repos/${r.id}/commits?branch=${state.branch}`).catch(()=>[]);
  const commit = allCommits.find(c => c.sha === sha);
  const author = commit ? (state.users.find(u=>u.id===commit.author_id)?.username||`#${commit.author_id}`) : '–';

  app.innerHTML = `
    <div class="back-link" onclick="state.view='repo';state.repoTab='commits';render()">← Back to commits</div>
    <div class="diff-commit-header">
      <div class="diff-commit-dot"></div>
      <div>
        <div class="diff-commit-msg">${commit ? esc(commit.message) : sha}</div>
        <div class="diff-commit-meta">
          <span>Author: <strong>${author}</strong></span>
          ${commit ? `<span>${timeAgo(commit.created_at)}</span>` : ''}
          <code style="font-size:11px">${sha.substring(0,12)}…</code>
          ${diff.parent_sha ? `<span style="color:var(--muted)">Parent: <code style="font-size:11px">${diff.parent_sha.substring(0,7)}</code></span>` : '<span style="color:var(--green)">Initial commit</span>'}
        </div>
      </div>
    </div>
    <div style="margin-bottom:12px;font-size:13px;color:var(--muted)">
      ${diff.files.length} file${diff.files.length!==1?'s':''} changed
    </div>
    ${!diff.files.length
      ? '<div class="empty-state">No file changes in this commit.</div>'
      : diff.files.map(f => renderDiffFile(f)).join('')
    }`;
}

function renderDiffFile(f) {
  let rows = '';
  if (f.status === 'added') {
    (f.new_content||'').split('\n').forEach((line,i) => {
      rows += `<tr class="diff-added"><td class="diff-ln">${i+1}</td><td class="diff-code">${esc(line)}</td></tr>`;
    });
  } else if (f.status === 'deleted') {
    (f.old_content||'').split('\n').forEach((line,i) => {
      rows += `<tr class="diff-deleted"><td class="diff-ln">${i+1}</td><td class="diff-code">${esc(line)}</td></tr>`;
    });
  } else {
    (f.old_content||'').split('\n').forEach((line,i) => {
      rows += `<tr class="diff-deleted"><td class="diff-ln">${i+1}</td><td class="diff-code">${esc(line)}</td></tr>`;
    });
    (f.new_content||'').split('\n').forEach((line,i) => {
      rows += `<tr class="diff-added"><td class="diff-ln">${i+1}</td><td class="diff-code">${esc(line)}</td></tr>`;
    });
  }

  return `
    <div class="diff-file-block">
      <div class="diff-file-header">
        <span class="diff-badge ${f.status}">${{added:'+ Added',deleted:'- Deleted',modified:'~ Modified'}[f.status]}</span>
        <span>${esc(f.path)}</span>
      </div>
      <table class="diff-table">${rows}</table>
    </div>`;
}

// ── MODALS ────────────────────────────────────────────
function openModal(id) {
  const userOpts = state.users.map(u=>`<option value="${u.id}">${u.username}</option>`).join('');
  if (id==='modal-new-repo')  document.getElementById('new-repo-owner').innerHTML = userOpts;
  if (id==='modal-new-user')  { document.getElementById('new-user-name').value=''; document.getElementById('new-user-email').value=''; }
  if (id==='modal-merge')     document.getElementById('merge-user').innerHTML = userOpts;
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// Close backdrop click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-backdrop')) e.target.classList.add('hidden');
});

function openCommitModal() {
  const userOpts = state.users.map(u=>`<option value="${u.id}">${u.username}</option>`).join('');
  const branchOpts = state.branches.map(b=>`<option value="${b.name}" ${b.name===state.branch?'selected':''}>${b.name}</option>`).join('');
  document.getElementById('cm-author').innerHTML = userOpts;
  document.getElementById('cm-branch').innerHTML = branchOpts;
  document.getElementById('cm-message').value = '';
  document.getElementById('cm-files').innerHTML = '';
  window._cmFileCount = 0;
  addCommitFile();
  document.getElementById('modal-commit').classList.remove('hidden');
}

function openTagModal() {
  const userOpts = state.users.map(u=>`<option value="${u.id}">${u.username}</option>`).join('');
  const commitOpts = (window._tagCommits||[]).map(c =>
    `<option value="${c.id}">${c.sha.substring(0,7)} — ${c.message.substring(0,40)}</option>`).join('');
  document.getElementById('new-tag-user').innerHTML = userOpts;
  // inject commit select into tag modal
  const modal = document.getElementById('modal-tag').querySelector('.modal-body');
  // find or create commit select
  let sel = document.getElementById('new-tag-commit');
  if (!sel) {
    sel = document.createElement('select');
    sel.className = 'input';
    sel.id = 'new-tag-commit';
    sel.style.cssText = 'width:100%;margin-bottom:12px';
    const label = document.createElement('label');
    label.className = 'field-label';
    label.textContent = 'Commit';
    modal.insertBefore(label, modal.children[2]);
    modal.insertBefore(sel, modal.children[3]);
  }
  sel.innerHTML = commitOpts;
  document.getElementById('new-tag-name').value = '';
  document.getElementById('new-tag-msg').value  = '';
  document.getElementById('modal-tag').classList.remove('hidden');
}

function openMergeModal() {
  const userOpts = state.users.map(u=>`<option value="${u.id}">${u.username}</option>`).join('');
  document.getElementById('merge-user').innerHTML = userOpts;
  document.getElementById('merge-src').value = '';
  document.getElementById('merge-tgt').value = 'main';
  document.getElementById('modal-merge').classList.remove('hidden');
}

// ── COMMIT FILE ROWS ──────────────────────────────────
function addCommitFile() {
  window._cmFileCount = (window._cmFileCount||0) + 1;
  const id = window._cmFileCount;
  const div = document.createElement('div');
  div.className = 'commit-file-row';
  div.id = `cfr-${id}`;
  div.innerHTML = `
    <input class="input" id="cfn-${id}" placeholder="filename.txt" style="flex:1;min-width:120px" />
    <textarea id="cfc-${id}" placeholder="File content..."></textarea>
    <button class="btn-danger btn-sm" onclick="document.getElementById('cfr-${id}').remove()" style="margin-top:4px">✕</button>`;
  document.getElementById('cm-files').appendChild(div);
}

// ── SUBMIT ACTIONS ────────────────────────────────────
async function submitNewUser() {
  const username = document.getElementById('new-user-name').value.trim();
  const email    = document.getElementById('new-user-email').value.trim();
  if (!username||!email) return toast('Fill all fields','err');
  try {
    await apiFetch('/users/', {method:'POST', body:JSON.stringify({username,email})});
    toast(`User "${username}" created`);
    closeModal('modal-new-user');
    await loadGlobals();
    render();
  } catch(e) { toast(e.message,'err'); }
}

async function submitNewRepo() {
  const owner_id    = parseInt(document.getElementById('new-repo-owner').value);
  const name        = document.getElementById('new-repo-name').value.trim();
  const description = document.getElementById('new-repo-desc').value.trim();
  if (!name||!owner_id) return toast('Fill all fields','err');
  try {
    await apiFetch('/repos/', {method:'POST', body:JSON.stringify({name,description,owner_id})});
    toast(`Repository "${name}" created`);
    closeModal('modal-new-repo');
    await loadGlobals();
    render();
  } catch(e) { toast(e.message,'err'); }
}

async function submitCommit() {
  const repo_id    = state.repo.id;
  const author_id  = parseInt(document.getElementById('cm-author').value);
  const branch_name= document.getElementById('cm-branch').value;
  const message    = document.getElementById('cm-message').value.trim();
  if (!author_id||!branch_name||!message) return toast('Fill all fields','err');

  const files = [];
  document.querySelectorAll('.commit-file-row').forEach(row => {
    const num  = row.id.replace('cfr-','');
    const name = document.getElementById(`cfn-${num}`)?.value.trim();
    const cont = document.getElementById(`cfc-${num}`)?.value || '';
    if (name) files.push({name, path:name, content:cont});
  });
  if (!files.length) return toast('Add at least one file','err');

  try {
    await apiFetch(`/repos/${repo_id}/commits`, {
      method:'POST',
      body: JSON.stringify({repo_id, author_id, branch_name, message, files}),
    });
    toast('Commit created!');
    closeModal('modal-commit');
    state.branches = await apiFetch(`/repos/${repo_id}/branches`).catch(()=>[]);
    state.branch = branch_name;
    render();
  } catch(e) { toast(e.message,'err'); }
}

async function submitNewBranch() {
  const repo_id     = state.repo.id;
  const name        = document.getElementById('new-branch-name').value.trim();
  const from_branch = document.getElementById('new-branch-from').value.trim() || 'main';
  if (!name) return toast('Enter branch name','err');
  try {
    await apiFetch(`/repos/${repo_id}/branches`, {
      method:'POST',
      body: JSON.stringify({repo_id, name, from_branch}),
    });
    toast(`Branch "${name}" created`);
    closeModal('modal-branch');
    state.branches = await apiFetch(`/repos/${repo_id}/branches`).catch(()=>[]);
    render();
  } catch(e) { toast(e.message,'err'); }
}

async function deleteBranch(name, id) {
  if (!confirm(`Delete branch "${name}"?`)) return;
  try {
    await apiFetch(`/repos/${state.repo.id}/branches/${encodeURIComponent(name)}`, {method:'DELETE'});
    toast(`Branch "${name}" deleted`);
    state.branches = await apiFetch(`/repos/${state.repo.id}/branches`).catch(()=>[]);
    render();
  } catch(e) { toast(e.message,'err'); }
}

async function submitNewTag() {
  const repo_id   = state.repo.id;
  const name      = document.getElementById('new-tag-name').value.trim();
  const tagger_id = parseInt(document.getElementById('new-tag-user').value);
  const commit_id = parseInt(document.getElementById('new-tag-commit')?.value);
  const message   = document.getElementById('new-tag-msg').value.trim();
  if (!name||!tagger_id||!commit_id) return toast('Fill all fields','err');
  try {
    await apiFetch(`/repos/${repo_id}/tags`, {
      method:'POST',
      body: JSON.stringify({repo_id, name, commit_id, tagger_id, message}),
    });
    toast(`Tag "${name}" created`);
    closeModal('modal-tag');
    render();
  } catch(e) { toast(e.message,'err'); }
}

async function submitMerge() {
  const repo_id       = state.repo.id;
  const source_branch = document.getElementById('merge-src').value.trim();
  const target_branch = document.getElementById('merge-tgt').value.trim();
  const merged_by     = parseInt(document.getElementById('merge-user').value);
  if (!source_branch||!target_branch||!merged_by) return toast('Fill all fields','err');
  try {
    const res = await apiFetch(`/repos/${repo_id}/merge`, {
      method:'POST',
      body: JSON.stringify({repo_id, source_branch, target_branch, merged_by}),
    });
    toast(`Merged "${source_branch}" → "${target_branch}" (${res.status})`);
    closeModal('modal-merge');
    state.branches = await apiFetch(`/repos/${repo_id}/branches`).catch(()=>[]);
    render();
  } catch(e) { toast(e.message,'err'); }
}

// ── API ───────────────────────────────────────────────
async function apiFetch(path, opts={}) {
  const r = await fetch(API+path, {
    headers:{'Content-Type':'application/json'},
    ...opts,
  });
  if (!r.ok) {
    const e = await r.json().catch(()=>({detail:r.statusText}));
    throw new Error(e.detail||'API Error');
  }
  if (r.status===204) return null;
  return r.json();
}

// ── UTILS ─────────────────────────────────────────────
function esc(s) {
  return String(s||'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso), now = Date.now();
  const s = Math.floor((now - d)/1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}

function toast(msg, type='ok') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  clearTimeout(t._t);
  t._t = setTimeout(()=>t.className='toast hidden', 3000);
}
