import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';

const state = {
    pdfDoc: null,
    pageIndex: 1,
    scale: 1.2,
    rendering: false,
    textCache: new Map(),
    wordsCache: new Map(),
    isReading: false,
    isPaused: false,
    currentWords: [],
    currentWordIndex: -1,
    voiceList: [],
    theme: 'light',
    focusMode: false,
    showTracking: true,
    rate: 1.0,
    pitch: 1.0,
    selectedVoiceName: '',
    history: [],
    docName: '',
    blockSummaryLoaded: -1
};

let UI = {};

const $ = (id) => document.getElementById(id);
const toast = (msg) => {
    if (!UI.toast) return;
    UI.toast.textContent = msg;
    UI.toast.classList.remove('hidden');
    UI.toast.classList.add('on');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
        UI.toast.classList.remove('on');
        setTimeout(() => UI.toast.classList.add('hidden'), 300);
    }, 3000);
};

const openSidebar = () => { UI.sidebar.classList.add('open'); UI.overlay.classList.add('on'); UI.overlay.classList.remove('hidden'); };
const closeSidebar = () => { UI.sidebar.classList.remove('open'); UI.overlay.classList.add('hidden'); UI.overlay.classList.remove('on'); };

function showPanel(panelId) {
    ['panelHome', 'panelLibrary', 'panelSettings'].forEach(id => {
        const el = $(id);
        if (el) el.classList.toggle('hidden', id !== panelId);
    });
    document.querySelectorAll('.sidebar-nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.panel === panelId.replace('panel', '').toLowerCase());
    });
    if (window.innerWidth < 1024) closeSidebar();
}

function loadPreferences() {
    try {
        const prefs = JSON.parse(localStorage.getItem('voxpdf-prefs') || '{}');
        state.theme = prefs.theme || 'light';
        state.showTracking = prefs.showTracking !== false;
        state.rate = prefs.rate || 1.0;
        state.pitch = prefs.pitch || 1.0;
        state.selectedVoiceName = prefs.selectedVoiceName || '';
        state.customWorkerUrl = prefs.customWorkerUrl || '';
        state.history = JSON.parse(localStorage.getItem('voxpdf-history') || '[]');
    } catch (e) { console.warn('Error loading preferences'); }

    document.documentElement.setAttribute('data-theme', state.theme);
    if (UI.trackingSwitch) UI.trackingSwitch.checked = state.showTracking;
    if (UI.rateRange) UI.rateRange.value = String(state.rate);
    if (UI.rateVal) UI.rateVal.textContent = state.rate.toFixed(1) + '×';
    if (UI.pitchRange) UI.pitchRange.value = String(state.pitch);
    if (UI.pitchVal) UI.pitchVal.textContent = state.pitch.toFixed(1);
    if (UI.customWorkerInput) UI.customWorkerInput.value = state.customWorkerUrl;
    updateThemeIcon();
}

function savePreferences() {
    localStorage.setItem('voxpdf-prefs', JSON.stringify({
        theme: state.theme, showTracking: state.showTracking,
        rate: state.rate, pitch: state.pitch, selectedVoiceName: state.selectedVoiceName,
        customWorkerUrl: state.customWorkerUrl
    }));
    localStorage.setItem('voxpdf-history', JSON.stringify(state.history));
}

function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    updateThemeIcon();
    savePreferences();
    toast(`Tema visual: ${state.theme === 'dark' ? 'Oscuro' : 'Claro'}`);
}

function updateThemeIcon() {
    if (!UI.sidebarThemeIcon) return;
    UI.sidebarThemeIcon.innerHTML = state.theme === 'dark'
        ? '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>'
        : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
}

async function queryWordIntervals(pageIndex) {
    if (state.textCache.has(pageIndex)) return state.textCache.get(pageIndex);
    try {
        const page = await state.pdfDoc.getPage(pageIndex);
        const textContent = await page.getTextContent();
        let completeText = '';
        const wordsList = [];
        let cursor = 0;
        textContent.items.forEach(item => {
            const content = item.str || '';
            if (!content.trim()) return;
            const words = content.split(/[\s\r\n\t]+/).filter(Boolean);
            words.forEach(w => {
                if (completeText.length > 0) { completeText += ' '; cursor++; }
                const start = cursor;
                completeText += w;
                cursor += w.length;
                wordsList.push({ text: w, start, end: cursor });
            });
        });
        const parsed = completeText.trim().replace(/\s+/g, ' ');
        state.textCache.set(pageIndex, parsed);
        state.wordsCache.set(pageIndex, wordsList);
        return parsed;
    } catch (e) { return ''; }
}

async function renderPage(pageNum) {
    if (!state.pdfDoc || state.rendering) return;
    state.rendering = true;
    state.pageIndex = pageNum;
    try {
        const page = await state.pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: state.scale });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { alpha: false });
        const dpr = window.devicePixelRatio || 1;
        canvas.width = viewport.width * dpr;
        canvas.height = viewport.height * dpr;
        canvas.style.width = viewport.width + 'px';
        canvas.style.height = viewport.height + 'px';
        canvas.style.display = 'block';
        canvas.style.margin = 'auto';
        canvas.style.maxWidth = 'none';
        ctx.scale(dpr, dpr);
        await page.render({ canvasContext: ctx, viewport }).promise;
        UI.pdfStage.innerHTML = '';
        UI.pdfStage.appendChild(canvas);
        UI.emptyState.classList.add('hidden');
        UI.pdfZoomControls.classList.remove('hidden');
        const pageText = await queryWordIntervals(pageNum);
        refreshTrackingCard(pageNum, pageText);
        syncPageControls();
        updateMinimap();
        saveDocumentPosition(state.docName, pageNum);
        triggerAIBlockSummary(pageNum);
    } catch (e) { console.error('Render error:', e); }
    finally { state.rendering = false; }
}

function refreshTrackingCard(pageNum, text) {
    if (!UI.trackingPanel || !UI.trackingContent) return;
    const words = state.wordsCache.get(pageNum) || [];
    if (!text || words.length === 0) { UI.trackingPanel.classList.add('hidden'); return; }
    if (state.showTracking) {
        UI.trackingPanel.classList.remove('hidden');
        UI.restoreTrackingBtn.classList.add('hidden');
        UI.trackingContent.innerHTML = words.map((w, idx) => `<span class="tracking-word" id="wordNode-${idx}" data-idx="${idx}">${w.text}</span>`).join('');
        UI.trackingContent.querySelectorAll('.tracking-word').forEach(el => {
            el.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.getAttribute('data-idx') || '0');
                if (state.isReading) { stopReadingVoice(); state.currentWordIndex = idx; startSpeechSynthesis(text, idx); }
                else { highlightActiveWordNode(idx); state.currentWordIndex = idx; }
            });
        });
    } else {
        UI.trackingPanel.classList.add('hidden');
        UI.restoreTrackingBtn.classList.add('hidden');
    }
}

// 🔁 Cambio aquí: eliminado el scroll automático. Solo se resalta la palabra.
function highlightActiveWordNode(index) {
    if (!UI.trackingContent) return;
    UI.trackingContent.querySelectorAll('.tracking-word').forEach(n => n.classList.remove('active-word'));
    const active = document.getElementById(`wordNode-${index}`);
    if (active) {
        active.classList.add('active-word');
        // Se ha eliminado el scroll automático para no interferir con el desplazamiento manual del usuario.
    }
}

async function mountDocumentSource(arrayBuffer, name) {
    try {
        stopReadingVoice();
        state.textCache.clear();
        state.wordsCache.clear();
        state.pageIndex = 1;
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
        state.pdfDoc = await loadingTask.promise;
        state.docName = name;
        UI.docTitleDisplay.textContent = `📄 ${name}`;
        UI.docMetaDisplay.textContent = `Documento de ${state.pdfDoc.numPages} páginas`;
        UI.pageCountDisplay.textContent = String(state.pdfDoc.numPages);
        UI.pageNumberInput.value = '1';
        UI.pageNumberInput.disabled = false;
        UI.pageNumberInput.max = String(state.pdfDoc.numPages);
        await renderPage(1);
        addDocumentToHistory(name, 1, state.pdfDoc.numPages);
        toast('VoxPDF listo para lectura.');
    } catch (e) { console.error('PDF mount failed:', e); toast('Fallo al montar el archivo PDF.'); }
}

function syncPageControls() {
    const hasDoc = !!state.pdfDoc;
    if (UI.prevPageBtn) UI.prevPageBtn.disabled = !hasDoc || state.pageIndex <= 1;
    if (UI.nextPageBtn) UI.nextPageBtn.disabled = !hasDoc || state.pageIndex >= (state.pdfDoc?.numPages || 1);
    if (UI.zoomInBtn) UI.zoomInBtn.disabled = !hasDoc || state.scale >= 3.0;
    if (UI.zoomOutBtn) UI.zoomOutBtn.disabled = !hasDoc || state.scale <= 0.5;
    if (UI.pageNumberInput) UI.pageNumberInput.disabled = !hasDoc;
    if (UI.goPageBtn) UI.goPageBtn.disabled = !hasDoc;
    if (UI.readBtn) UI.readBtn.disabled = !hasDoc;
    if (UI.searchBtn) UI.searchBtn.disabled = !hasDoc;
    if (UI.askInput) UI.askInput.disabled = !hasDoc;
    if (UI.askSendBtn) UI.askSendBtn.disabled = !hasDoc;
}

async function navigateToPageIndex(pageNum) {
    if (!state.pdfDoc) return;
    const verified = Math.max(1, Math.min(pageNum, state.pdfDoc.numPages));
    stopReadingVoice();
    await renderPage(verified);
}

function updateMinimap() {
    if (!state.pdfDoc || !UI.miniMap) return;
    UI.miniMap.classList.remove('hidden');
    const pct = (state.pageIndex / state.pdfDoc.numPages) * 100;
    if (UI.miniMapProgress) UI.miniMapProgress.style.width = `${pct}%`;
    if (UI.miniMapMarker) UI.miniMapMarker.style.left = `${pct}%`;
}

function startSpeechSynthesis(fullText, resumeWordIndex = 0) {
    if (!fullText || !('speechSynthesis' in window)) { toast('Sintetizador no disponible.'); return; }
    window.speechSynthesis.cancel();
    state.currentWords = state.wordsCache.get(state.pageIndex) || [];
    state.currentWordIndex = resumeWordIndex;
    let readingString = fullText;
    let startOffset = 0;
    if (resumeWordIndex > 0 && state.currentWords[resumeWordIndex]) {
        startOffset = state.currentWords[resumeWordIndex].start;
        readingString = fullText.slice(startOffset);
    }
    const utterance = new SpeechSynthesisUtterance(readingString);
    utterance.rate = state.rate;
    utterance.pitch = state.pitch;
    utterance.lang = 'es-ES';
    if (state.selectedVoiceName) {
        const voice = state.voiceList.find(v => v.name === state.selectedVoiceName);
        if (voice) utterance.voice = voice;
    }
    utterance.onboundary = (e) => {
        if (e.name === 'word') {
            const charIdx = e.charIndex + startOffset;
            const matchIdx = state.currentWords.findIndex(w => w.start <= charIdx && charIdx <= w.end);
            if (matchIdx !== -1) { state.currentWordIndex = matchIdx; highlightActiveWordNode(matchIdx); updateProgress(matchIdx, state.currentWords.length); }
        }
    };
    utterance.onend = () => finishReadingVoice();
    utterance.onerror = (e) => { if (e.error !== 'interrupted') finishReadingVoice(); };
    state.isReading = true;
    state.isPaused = false;
    window.speechSynthesis.speak(utterance);
    UI.progressWrapper.classList.remove('hidden');
    UI.voiceStatus.textContent = `🔊 Leyendo página ${state.pageIndex}`;
    updatePlayButtonState();
}

function updateProgress(idx, total) {
    if (!UI.progressFill) return;
    UI.progressFill.style.width = total > 0 ? `${(idx / (total - 1)) * 100}%` : '0%';
}

function pauseReadingVoice() {
    if (!state.isReading) return;
    if (!state.isPaused) { window.speechSynthesis.pause(); state.isPaused = true; UI.voiceStatus.textContent = '⏸ Lectura en pausa'; }
    else { window.speechSynthesis.resume(); state.isPaused = false; UI.voiceStatus.textContent = `🔊 Leyendo página ${state.pageIndex}`; }
    updatePlayButtonState();
}

function stopReadingVoice() {
    window.speechSynthesis.cancel();
    state.isReading = false;
    state.isPaused = false;
    UI.progressWrapper.classList.add('hidden');
    UI.voiceStatus.textContent = 'Lectura detenida.';
    highlightActiveWordNode(-1);
    updatePlayButtonState();
}

function finishReadingVoice() {
    state.isReading = false;
    state.isPaused = false;
    UI.progressWrapper.classList.add('hidden');
    UI.voiceStatus.textContent = '✅ Lectura terminada.';
    highlightActiveWordNode(-1);
    updatePlayButtonState();
}

function updatePlayButtonState() {
    if (!UI.readBtn) return;
    const btn = UI.readBtn;
    if (state.isReading && !state.isPaused) {
        btn.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`;
        btn.classList.add('playing');
    } else {
        btn.innerHTML = `<svg class="play-icon" width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
        btn.classList.remove('playing');
    }
    if (UI.stopBtn) UI.stopBtn.disabled = !state.isReading;
}

async function runPDFSearch() {
    const query = UI.searchInput?.value?.trim().toLowerCase();
    if (!query || !state.pdfDoc) return;
    const occurrences = [];
    for (let i = 1; i <= state.pdfDoc.numPages; i++) {
        const text = await queryWordIntervals(i);
        if (text.toLowerCase().includes(query)) occurrences.push(i);
    }
    if (UI.searchResults) {
        if (occurrences.length > 0) {
            UI.searchResults.innerHTML = `Coincidencias: ` + occurrences.map(n => `<span class="page-goto-badge" data-page="${n}" style="cursor:pointer;background:var(--color-accent-soft);color:var(--color-accent);padding:2px 6px;border-radius:6px;font-weight:700;font-size:11px;margin:0 2px;">${n}</span>`).join(' ');
            UI.searchResults.querySelectorAll('.page-goto-badge').forEach(b => b.addEventListener('click', (e) => navigateToPageIndex(parseInt(e.currentTarget.dataset.page))));
            navigateToPageIndex(occurrences[0]);
        } else { UI.searchResults.textContent = '❌ Sin coincidencias.'; }
    }
}

function toggleFocusMode() {
    state.focusMode = !state.focusMode;
    document.body.classList.toggle('focus-mode', state.focusMode);
    toast(state.focusMode ? 'Modo Concentración activado.' : 'Modo Lector Normal restaurado.');
}

function addDocumentToHistory(name, page, total) {
    const entry = { name, lastPage: page, totalPages: total, date: Date.now() };
    const idx = state.history.findIndex(h => h.name === name);
    if (idx !== -1) state.history[idx] = entry;
    else state.history.unshift(entry);
    if (state.history.length > 12) state.history.pop();
    savePreferences();
    buildLibraryUI();
}

function saveDocumentPosition(name, page) {
    const log = state.history.find(h => h.name === name);
    if (log) { log.lastPage = page; log.date = Date.now(); savePreferences(); buildLibraryUI(); }
}

function buildLibraryUI() {
    if (!UI.libraryList) return;
    UI.libraryList.innerHTML = '';
    if (state.history.length === 0) {
        UI.libraryList.innerHTML = '<p class="library-empty">Aún no has cargado ningún archivo en tu biblioteca.</p>';
        return;
    }
    state.history.forEach(h => {
        const card = document.createElement('div');
        card.className = 'library-card';
        card.innerHTML = `<h4>${h.name}</h4><p>Última lectura: pág. ${h.lastPage} de ${h.totalPages}</p><span style="font-size:10px;color:var(--text-muted);">${new Date(h.date).toLocaleDateString()}</span>`;
        card.addEventListener('click', () => {
            if (state.docName === h.name) { showPanel('panelHome'); navigateToPageIndex(h.lastPage); }
            else { showPanel('panelHome'); toast(`Para reanudar "${h.name}", por favor vuelve a cargar su archivo PDF.`); }
        });
        UI.libraryList.appendChild(card);
    });
}

function populateSystemVoices() {
    if (!UI.voiceSelect || !('speechSynthesis' in window)) return;
    state.voiceList = window.speechSynthesis.getVoices();
    UI.voiceSelect.innerHTML = '';
    const spanish = state.voiceList.filter(v => v.lang.startsWith('es'));
    if (spanish.length === 0) {
        UI.voiceSelect.innerHTML = '<option value="default">Motor predeterminado del navegador</option>';
        return;
    }
    spanish.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.name;
        opt.textContent = `${v.name} (${v.lang})`;
        if (v.name === state.selectedVoiceName) opt.selected = true;
        UI.voiceSelect.appendChild(opt);
    });
}

async function triggerAIBlockSummary(pageNum, force = false) {
    if (!state.pdfDoc) return;
    const block = Math.ceil(pageNum / 10);
    if (!force && state.blockSummaryLoaded === block) return;
    state.blockSummaryLoaded = block;
    const s = (block - 1) * 10 + 1, e = Math.min(block * 10, state.pdfDoc.numPages);
    if (UI.summaryTitle) UI.summaryTitle.innerHTML = `<span class="ia-title-icon">✨</span> <span>Resumen: Páginas ${s} - ${e}</span>`;
    if (UI.summaryBody) UI.summaryBody.innerHTML = '<div class="ia-spinner" style="display:flex;align-items:center;gap:10px;font-size:0.8rem;color:var(--text-muted);"><span style="width:14px;height:14px;border:2px solid var(--color-accent);border-top-color:transparent;border-radius:50%;animation:spin 0.6s linear infinite;"></span>Generando resumen inteligente...</div>';
    let blockText = '';
    for (let p = s; p <= e; p++) blockText += (await queryWordIntervals(p)) + '\n';
    try {
        let res;
        try {
            if (state.customWorkerUrl) {
                const targetUrl = state.customWorkerUrl.trim().replace(/\/$/, '') + '/summary';
                res = await fetch(targetUrl, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: blockText, startPage: s, endPage: e })
                });
                if (!res.ok) throw new Error();
            } else {
                res = await fetch('/api/summary', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: blockText, startPage: s, endPage: e })
                });
                if (!res.ok) throw new Error();
            }
        } catch {
            res = await fetch('https://lector.al22760232.workers.dev/summary', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: blockText, startPage: s, endPage: e })
            });
        }
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        renderSummary(data.result);
    } catch (err) {
        if (UI.summaryBody) {
            UI.summaryBody.innerHTML = `
                <div style="padding:14px;background:rgba(239,68,68,0.08);color:var(--color-danger);border-radius:8px;font-size:0.75rem;font-weight:600;border:1px solid rgba(239,68,68,0.15);display:flex;flex-direction:column;gap:8px;">
                    <div style="display:flex;align-items:center;gap:6px;font-weight:700;">⚠ <span>Error de Servicio de IA</span></div>
                    <p>${err.message || 'Asegúrate de que el servicio de IA esté configurado.'}</p>
                    <button id="retrySummaryBtn" style="align-self:flex-start;padding:4px 10px;background:rgba(239,68,68,0.15);color:var(--color-danger);border:none;border-radius:6px;font-size:10px;font-weight:700;text-transform:uppercase;cursor:pointer;">Reintentar</button>
                </div>`;
            document.getElementById('retrySummaryBtn')?.addEventListener('click', () => triggerAIBlockSummary(pageNum, true));
        }
    }
}

function renderSummary(mdText) {
    if (!UI.summaryBody) return;
    let formatted = mdText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    UI.summaryBody.innerHTML = formatted;
    if (UI.summaryMeta) UI.summaryMeta.textContent = 'Procesado por Gemini';
    if (UI.readSummaryBtn) UI.readSummaryBtn.disabled = false;
    if (UI.pauseSummaryBtn) {
        UI.pauseSummaryBtn.disabled = false;
        UI.pauseSummaryBtn.innerHTML = '⏸ Pausar Resumen';
    }
    if (UI.regenSummaryBtn) UI.regenSummaryBtn.disabled = false;
    if (UI.askToggleBtn) UI.askToggleBtn.disabled = false;
}

function readAISummaryTextVoice() {
    const text = UI.summaryBody?.textContent?.trim();
    if (!text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = state.rate; u.pitch = state.pitch; u.lang = 'es-ES';
    u.onend = () => {
        if (UI.pauseSummaryBtn) {
            UI.pauseSummaryBtn.innerHTML = '⏸ Pausar Resumen';
        }
    };
    u.onerror = () => {
        if (UI.pauseSummaryBtn) {
            UI.pauseSummaryBtn.innerHTML = '⏸ Pausar Resumen';
        }
    };
    window.speechSynthesis.speak(u);
    if (UI.pauseSummaryBtn) {
        UI.pauseSummaryBtn.disabled = false;
        UI.pauseSummaryBtn.innerHTML = '⏸ Pausar Resumen';
    }
    toast('Sintetizando resumen inteligente...');
}

function pauseSummaryVoice() {
    if (window.speechSynthesis.speaking) {
        if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
            toast('Lectura de resumen reanudada');
            if (UI.pauseSummaryBtn) UI.pauseSummaryBtn.innerHTML = '⏸ Pausar Resumen';
        } else {
            window.speechSynthesis.pause();
            toast('Lectura de resumen pausada');
            if (UI.pauseSummaryBtn) UI.pauseSummaryBtn.innerHTML = '▶️ Reanudar Resumen';
        }
    } else {
        toast('No se está reproduciendo el resumen actualmente.');
    }
}

async function submitAIQuestion() {
    const q = UI.askInput?.value?.trim();
    if (!q) return;
    UI.askInput.value = '';
    appendChatBubble(q, 'user');
    const loader = appendChatBubble('Analizando...', 'ai');
    const ctx = await queryWordIntervals(state.pageIndex);
    try {
        let res;
        try {
            if (state.customWorkerUrl) {
                const targetUrl = state.customWorkerUrl.trim().replace(/\/$/, '') + '/ask';
                res = await fetch(targetUrl, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ question: q, context: ctx })
                });
                if (!res.ok) throw new Error();
            } else {
                res = await fetch('/api/ask', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ question: q, context: ctx })
                });
                if (!res.ok) throw new Error();
            }
        } catch {
            res = await fetch('https://lector.al22760232.workers.dev/ask', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: q, context: ctx })
            });
        }
        const data = await res.json();
        if (loader) loader.textContent = data.result || 'Sin respuesta.';
    } catch (e) { if (loader) loader.textContent = 'Error al conectar con la IA.'; }
}

function appendChatBubble(text, role) {
    if (!UI.askHistory) return null;
    const div = document.createElement('div');
    div.className = `ask-bubble ${role}`;
    div.textContent = text;
    UI.askHistory.appendChild(div);
    UI.askHistory.scrollTop = UI.askHistory.scrollHeight;
    return div;
}

function bindEvents() {
    UI.menuToggle?.addEventListener('click', openSidebar);
    UI.overlay?.addEventListener('click', closeSidebar);
    document.querySelectorAll('.sidebar-nav-btn').forEach(btn => btn.addEventListener('click', () => showPanel('panel' + btn.dataset.panel.charAt(0).toUpperCase() + btn.dataset.panel.slice(1))));
    UI.sidebarThemeBtn?.addEventListener('click', toggleTheme);
    UI.shortcutsHelpBtn?.addEventListener('click', () => UI.shortcutsModal.classList.remove('hidden'));
    UI.closeShortcutsBtn?.addEventListener('click', () => UI.shortcutsModal.classList.add('hidden'));
    UI.shortcutsModal?.addEventListener('click', (e) => { if (e.target === UI.shortcutsModal) UI.shortcutsModal.classList.add('hidden'); });
    UI.pdfFileInput?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) { await mountDocumentSource(await file.arrayBuffer(), file.name); e.target.value = ''; }
    });
    UI.demoBtn?.addEventListener('click', async () => {
        UI.demoBtn.disabled = true;
        try { const r = await fetch('https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf'); await mountDocumentSource(await r.arrayBuffer(), 'Sample_Tracemonkey.pdf'); }
        catch { toast('No se pudo acceder al PDF de muestra.'); }
        finally { UI.demoBtn.disabled = false; }
    });
    UI.zoomInBtn?.addEventListener('click', () => { state.scale = Math.min(3.0, state.scale + 0.2); UI.zoomBadge.textContent = Math.round(state.scale * 100) + '%'; renderPage(state.pageIndex); });
    UI.zoomOutBtn?.addEventListener('click', () => { state.scale = Math.max(0.5, state.scale - 0.2); UI.zoomBadge.textContent = Math.round(state.scale * 100) + '%'; renderPage(state.pageIndex); });
    UI.focusModeBtn?.addEventListener('click', toggleFocusMode);
    UI.prevPageBtn?.addEventListener('click', () => { if (state.pageIndex > 1) navigateToPageIndex(state.pageIndex - 1); });
    UI.nextPageBtn?.addEventListener('click', () => { if (state.pdfDoc && state.pageIndex < state.pdfDoc.numPages) navigateToPageIndex(state.pageIndex + 1); });
    UI.goPageBtn?.addEventListener('click', () => navigateToPageIndex(parseInt(UI.pageNumberInput?.value || '1')));
    UI.pageNumberInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') navigateToPageIndex(parseInt(UI.pageNumberInput?.value || '1')); });
    UI.closeTrackingBtn?.addEventListener('click', () => { UI.trackingPanel.classList.add('hidden'); UI.restoreTrackingBtn.classList.remove('hidden'); });
    UI.restoreTrackingBtn?.addEventListener('click', () => { UI.trackingPanel.classList.remove('hidden'); UI.restoreTrackingBtn.classList.add('hidden'); });
    UI.searchBtn?.addEventListener('click', runPDFSearch);
    UI.searchInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') runPDFSearch(); });
    UI.readBtn?.addEventListener('click', async () => {
        if (state.isReading) { pauseReadingVoice(); return; }
        const text = await queryWordIntervals(state.pageIndex);
        if (text) startSpeechSynthesis(text, state.currentWordIndex >= 0 ? state.currentWordIndex : 0);
        else toast('No hay texto identificable en esta página.');
    });
    UI.stopBtn?.addEventListener('click', stopReadingVoice);
    UI.rateRange?.addEventListener('input', (e) => { state.rate = parseFloat(e.target.value); UI.rateVal.textContent = state.rate.toFixed(1) + '×'; savePreferences(); });
    UI.pitchRange?.addEventListener('input', (e) => { state.pitch = parseFloat(e.target.value); UI.pitchVal.textContent = state.pitch.toFixed(1); savePreferences(); });
    UI.voiceSelect?.addEventListener('change', (e) => { state.selectedVoiceName = e.target.value; savePreferences(); });
    UI.customWorkerInput?.addEventListener('input', (e) => { state.customWorkerUrl = e.target.value.trim(); savePreferences(); });
    UI.trackingSwitch?.addEventListener('change', (e) => { state.showTracking = e.target.checked; savePreferences(); refreshTrackingCard(state.pageIndex, state.textCache.get(state.pageIndex) || ''); });
    UI.resetPrefsBtn?.addEventListener('click', () => {
        localStorage.removeItem('voxpdf-prefs'); localStorage.removeItem('voxpdf-history');
        state.theme = 'light'; state.showTracking = true; state.rate = 1.0; state.pitch = 1.0; state.selectedVoiceName = ''; state.customWorkerUrl = ''; state.history = [];
        loadPreferences(); buildLibraryUI(); toast('Preferencias restablecidas.');
    });
    UI.askToggleBtn?.addEventListener('click', () => { UI.askCard.classList.toggle('hidden'); if (!UI.askCard.classList.contains('hidden')) UI.askInput?.focus(); });
    UI.askCloseBtn?.addEventListener('click', () => UI.askCard.classList.add('hidden'));
    UI.askSendBtn?.addEventListener('click', submitAIQuestion);
    UI.askInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAIQuestion(); });
    UI.readSummaryBtn?.addEventListener('click', readAISummaryTextVoice);
    UI.pauseSummaryBtn?.addEventListener('click', pauseSummaryVoice);
    UI.regenSummaryBtn?.addEventListener('click', () => triggerAIBlockSummary(state.pageIndex, true));

    window.addEventListener('keydown', (e) => {
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
        if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); if (state.isReading) pauseReadingVoice(); else UI.readBtn?.click(); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); if (state.pageIndex > 1) navigateToPageIndex(state.pageIndex - 1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); if (state.pdfDoc && state.pageIndex < state.pdfDoc.numPages) navigateToPageIndex(state.pageIndex + 1); }
        if (e.ctrlKey && e.key === 'f') { e.preventDefault(); UI.searchInput?.focus(); }
        if (e.shiftKey && e.key === 'F') { e.preventDefault(); toggleFocusMode(); }
        if (e.ctrlKey && e.key === '+') { e.preventDefault(); UI.zoomInBtn?.click(); }
        if (e.ctrlKey && e.key === '-') { e.preventDefault(); UI.zoomOutBtn?.click(); }
        if (e.key === 'Escape') { closeSidebar(); UI.shortcutsModal.classList.add('hidden'); UI.askCard.classList.add('hidden'); if (state.focusMode) toggleFocusMode(); }
    });
}

function init() {
    UI = {
        overlay: $('overlay'), toast: $('toast'), restoreTrackingBtn: $('restoreTrackingBtn'),
        sidebar: $('sidebar'), menuToggle: $('menuToggle'),
        docTitleDisplay: $('docTitleDisplay'), docMetaDisplay: $('docMetaDisplay'),
        zoomBadge: $('zoomBadge'), zoomOutBtn: $('zoomOutBtn'), zoomInBtn: $('zoomInBtn'),
        focusModeBtn: $('focusModeBtn'), shortcutsHelpBtn: $('shortcutsHelpBtn'),
        shortcutsModal: $('shortcutsModal'), closeShortcutsBtn: $('closeShortcutsBtn'),
        pdfFileInput: $('pdfFileInput'), demoBtn: $('demoBtn'), loadStatus: $('loadStatus'),
        readBtn: $('readBtn'), stopBtn: $('stopBtn'),
        voiceStatus: $('voiceStatus'), progressWrapper: $('progressWrapper'), progressFill: $('progressFill'),
        searchInput: $('searchInput'), searchBtn: $('searchBtn'), searchResults: $('searchResults'),
        pdfStage: $('pdfStage'), emptyState: $('emptyState'), pdfZoomControls: $('pdfZoomControls'),
        prevPageBtn: $('prevPageBtn'), pageNumberInput: $('pageNumberInput'), pageCountDisplay: $('pageCountDisplay'),
        goPageBtn: $('goPageBtn'), nextPageBtn: $('nextPageBtn'),
        trackingPanel: $('trackingPanel'), trackingContent: $('trackingContent'), closeTrackingBtn: $('closeTrackingBtn'),
        summaryTitle: $('summaryTitle'), summaryBody: $('summaryBody'), summaryKeywords: $('summaryKeywords'),
        summaryMeta: $('summaryMeta'), readSummaryBtn: $('readSummaryBtn'), pauseSummaryBtn: $('pauseSummaryBtn'), regenSummaryBtn: $('regenSummaryBtn'),
        askToggleBtn: $('askToggleBtn'), askCard: $('askCard'), askInput: $('askInput'), askSendBtn: $('askSendBtn'), askHistory: $('askHistory'), askCloseBtn: $('askCloseBtn'),
        miniMap: $('miniMap'), miniMapProgress: $('miniMapProgress'), miniMapMarker: $('miniMapMarker'),
        libraryList: $('libraryList'),
        voiceSelect: $('voiceSelect'), rateRange: $('rateRange'), rateVal: $('rateVal'),
        pitchRange: $('pitchRange'), pitchVal: $('pitchVal'), trackingSwitch: $('trackingSwitch'),
        sidebarThemeBtn: $('sidebarThemeBtn'), sidebarThemeIcon: $('sidebarThemeIcon'),
        resetPrefsBtn: $('resetPrefsBtn'), customWorkerInput: $('customWorkerInput')
    };
    loadPreferences();
    if ('speechSynthesis' in window) { window.speechSynthesis.onvoiceschanged = populateSystemVoices; populateSystemVoices(); }
    buildLibraryUI();
    bindEvents();
    syncPageControls();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();