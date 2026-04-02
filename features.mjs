// features.mjs
// Shared loader for Patch Notes and Future Updates pages

const STATUS_ELEMENT_ID = 'docStatus';
const CONTAINER_ID = 'documentsContainer';

const statusEl = document.getElementById(STATUS_ELEMENT_ID);
const containerEl = document.getElementById(CONTAINER_ID);

function setStatus(message, type = 'info') {
    console.log(type, ": ", message);
}

function prettyTitle(filename) {
    return filename
        .replace(/\.[^.]+$/, '')       // drop extension
        .replace(/[_-]+/g, ' ')        // separators to spaces
        .replace(/\s+/g, ' ')          // normalize spacing
        .trim()
        .replace(/\b\w/g, (m) => m.toUpperCase()) || filename;
}

function renderDocCard(doc) {
    const card = document.createElement('div');
    card.className = 'card doc-card';

    const header = document.createElement('div');
    header.className = 'doc-header';

    const title = document.createElement('h3');
    title.textContent = prettyTitle(doc.name);

    const meta = document.createElement('div');
    meta.className = 'doc-meta';
    const updatedAt = new Date(doc.modified);
    meta.textContent = isNaN(updatedAt.getTime())
        ? ''
        : `Updated ${updatedAt.toLocaleString()}`;

    header.appendChild(title);
    header.appendChild(meta);

    const body = document.createElement('pre');
    body.className = 'doc-body';
    body.textContent = 'Loading...';

    card.appendChild(header);
    card.appendChild(body);

    // Load document content asynchronously
    fetch(`/${doc.path}`)
        .then((res) => {
            if (!res.ok) {
                throw new Error(`Failed to load ${doc.name}`);
            }
            return res.text();
        })
        .then((text) => {
            body.textContent = text.trim() || '(Empty document)';
        })
        .catch((err) => {
            console.error(err);
            body.textContent = 'Could not load this document.';
        });

    return card;
}

async function fetchDocuments(folder) {
    const res = await fetch(`/api/documents/${folder}`);
    if (!res.ok) {
        throw new Error('Unable to fetch documents');
    }
    const data = await res.json();
    return data.docs || [];
}

function renderDocuments(docs) {
    if (!containerEl) return;
    containerEl.innerHTML = '';

    if (!docs.length) {
        const empty = document.createElement('div');
        empty.className = 'card';
        empty.innerHTML = '<p>No documents yet.</p>';
        containerEl.appendChild(empty);
        setStatus('No documents found.', 'info');
        return;
    }

    docs.forEach((doc) => {
        const card = renderDocCard(doc);
        containerEl.appendChild(card);
    });
    setStatus(`Loaded ${docs.length} document${docs.length > 1 ? 's' : ''}.`, 'success');
}

async function init() {
    if (!containerEl) return;

    const folder = containerEl.dataset.docFolder;
    if (!folder) {
        setStatus('Missing document folder configuration.', 'error');
        return;
    }

    try {
        setStatus('Loading documents...', 'info');
        const docs = await fetchDocuments(folder);
        // Ensure newest-to-oldest in case server ordering changes
        docs.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
        renderDocuments(docs);
    } catch (error) {
        console.error(error);
        setStatus('Failed to load documents. Please try again later.', 'error');
    }
}

document.addEventListener('DOMContentLoaded', init);
