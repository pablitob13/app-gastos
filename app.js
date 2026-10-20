document.addEventListener('DOMContentLoaded', () => {
    // Registro de Service Worker para soporte PWA y modo Offline
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(registration => {
                    console.log('Service Worker registrado con éxito:', registration.scope);
                })
                .catch(error => {
                    console.error('Error al registrar Service Worker:', error);
                });
        });
    }

    // ==========================================
    // 0. CONFIGURACIÓN SUPABASE (GASTOS PISO)
    // ==========================================
    const SUPABASE_URL = 'https://ryqyhkjcbyzzyndsztzi.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5cXloa2pjYnl6enluZHN6dHppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0Mzk3ODEsImV4cCI6MjEwODAxNTc4MX0.AJARzYFrmz-8x3sTkxKojJ2KsPPvPpHt_uyDRr2hpw8';

    let supabaseClient = null;
    if (window.supabase && typeof window.supabase.createClient === 'function') {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } else {
        console.warn('Librería de Supabase no cargada todavía.');
    }

    // ==========================================
    // NAVEGACIÓN ENTRE PESTAÑAS
    // ==========================================
    const tabBtnPersonal = document.getElementById('tab-btn-personal');
    const tabBtnPiso = document.getElementById('tab-btn-piso');
    const tabContentPersonal = document.getElementById('tab-content-personal');
    const tabContentPiso = document.getElementById('tab-content-piso');

    function switchTab(activeTab) {
        if (activeTab === 'personal') {
            tabBtnPersonal.classList.add('active');
            tabBtnPersonal.setAttribute('aria-selected', 'true');
            tabBtnPiso.classList.remove('active');
            tabBtnPiso.setAttribute('aria-selected', 'false');

            tabContentPersonal.classList.remove('hidden');
            tabContentPiso.classList.add('hidden');
        } else {
            tabBtnPiso.classList.add('active');
            tabBtnPiso.setAttribute('aria-selected', 'true');
            tabBtnPersonal.classList.remove('active');
            tabBtnPersonal.setAttribute('aria-selected', 'false');

            tabContentPiso.classList.remove('hidden');
            tabContentPersonal.classList.add('hidden');

            // Cargar datos del piso al cambiar a la pestaña
            fetchPisoRecords();
        }
    }

    tabBtnPersonal.addEventListener('click', () => switchTab('personal'));
    tabBtnPiso.addEventListener('click', () => switchTab('piso'));

    // Helper: Formatear moneda en Euros
    function formatCurrency(amount) {
        return new Intl.NumberFormat('es-ES', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    }

    // Helper: Obtener fecha actual en formato YYYY-MM-DD
    function getTodayDateString() {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    // Helper: Formatear fecha para el listado (dd/mm/yyyy)
    function formatDateDisplay(isoDateString) {
        if (!isoDateString || !isoDateString.includes('-')) return isoDateString;
        const [year, month, day] = isoDateString.split('T')[0].split('-');
        return `${day}/${month}/${year}`;
    }

    // Escapar texto para prevenir XSS
    function escapeHtml(string) {
        if (!string) return '';
        const div = document.createElement('div');
        div.textContent = string;
        return div.innerHTML;
    }

    const todayDate = new Date();
    const currentYear = todayDate.getFullYear();
    const currentMonth = String(todayDate.getMonth() + 1).padStart(2, '0');
    const currentMonthKey = `${currentYear}-${currentMonth}`;

    // ==========================================
    // 1. PESTAÑA: MIS GASTOS (LOCALSTORAGE)
    // ==========================================
    const STORAGE_KEY = 'monthly_expenses_app';
    const DISMISSED_REMINDER_PREFIX = 'dismissed_reminder_';

    let expenses = [];
    let currentFilter = 'all';

    const reminderBanner = document.getElementById('monthly-reminder-banner');
    const btnDismissReminder = document.getElementById('btn-dismiss-reminder');

    const btnToggleForm = document.getElementById('btn-toggle-form');
    const formContentWrapper = document.getElementById('form-content-wrapper');
    const form = document.getElementById('expense-form');
    const conceptInput = document.getElementById('expense-concept');
    const amountInput = document.getElementById('expense-amount');
    const dateInput = document.getElementById('expense-date');
    const typeSelect = document.getElementById('expense-type');
    const quickEntryInput = document.getElementById('quick-entry-input');
    const btnQuickLoad = document.getElementById('btn-quick-load');
    const btnSpeech = document.getElementById('btn-speech');

    const monthFilterInput = document.getElementById('month-filter');
    const btnPrevMonth = document.getElementById('btn-prev-month');
    const btnNextMonth = document.getElementById('btn-next-month');
    const btnExportExcel = document.getElementById('btn-export-excel');

    const totalAmountEl = document.getElementById('total-amount');
    const totalFixedEl = document.getElementById('total-fixed');
    const totalPersonalEl = document.getElementById('total-personal');

    const pieChartSvg = document.getElementById('pie-chart-svg');
    const fixedPisoPercentEl = document.getElementById('fixed-piso-percent');
    const fixedCocheraPercentEl = document.getElementById('fixed-cochera-percent');
    const fixedOtrosPercentEl = document.getElementById('fixed-otros-percent');
    const leisurePercentEl = document.getElementById('leisure-percent');
    const barsPercentEl = document.getElementById('bars-percent');
    const treatsPercentEl = document.getElementById('treats-percent');
    const chartCenterText = document.querySelector('.chart-center-text');
    const chartEmptyMessage = document.getElementById('chart-empty-message');

    const expenseListEl = document.getElementById('expense-list');
    const emptyStateEl = document.getElementById('empty-state');
    const filterPills = document.querySelectorAll('.filter-pills .pill');

    const btnExportJson = document.getElementById('btn-export-json');
    const btnImportJsonTrigger = document.getElementById('btn-import-json-trigger');
    const jsonFileInput = document.getElementById('json-file-input');

    const FIXED_KEYWORDS = [
        'alquiler', 'hipoteca', 'comunidad', 'piso', 'casa', 'luz', 'agua', 'gas',
        'internet', 'fibra', 'telefono', 'móvil', 'movil', 'cochera', 'garaje',
        'parking', 'plaza', 'seguro', 'coche', 'moto', 'gimnasio', 'cuota',
        'impuesto', 'ibi', 'prestamo', 'préstamo', 'matricula', 'colegio',
        'guarderia', 'tarjeta'
    ];

    const FIXED_PISO_KEYWORDS = [
        'alquiler', 'piso', 'hipoteca', 'comunidad', 'casa', 'luz', 'agua', 'gas',
        'internet', 'fibra'
    ];

    const FIXED_COCHERA_KEYWORDS = [
        'cochera', 'garaje', 'parking', 'plaza'
    ];

    const LEISURE_KEYWORDS = [
        'cine', 'teatro', 'concierto', 'partido', 'streaming', 'netflix', 'spotify',
        'entradas', 'viaje', 'hotel', 'escapada', 'vuelo', 'tren', 'billete',
        'museo', 'show', 'disney', 'hbo', 'prime', 'evento'
    ];

    const BARS_KEYWORDS = [
        'cerveza', 'cervezas', 'cañas', 'caña', 'restaurante', 'cena', 'comida',
        'bar', 'tapas', 'copas', 'copa', 'cafe', 'café', 'desayuno', 'merienda',
        'almuerzo', 'pizzeria', 'burger', 'hamburguesa', 'chiringuito', 'vermut'
    ];

    function resetDateField() {
        dateInput.value = getTodayDateString();
    }

    monthFilterInput.value = currentMonthKey;
    resetDateField();

    function checkMonthlyReminder() {
        const dayOfMonth = todayDate.getDate();
        const isStartOfMonth = dayOfMonth >= 1 && dayOfMonth <= 5;
        const dismissalKey = `${DISMISSED_REMINDER_PREFIX}${currentMonthKey}`;
        const isDismissed = localStorage.getItem(dismissalKey) === 'true';

        if (isStartOfMonth && !isDismissed) {
            reminderBanner.classList.remove('hidden');
        } else {
            reminderBanner.classList.add('hidden');
        }
    }

    btnDismissReminder.addEventListener('click', () => {
        const dismissalKey = `${DISMISSED_REMINDER_PREFIX}${currentMonthKey}`;
        localStorage.setItem(dismissalKey, 'true');
        reminderBanner.classList.add('hidden');
    });

    btnToggleForm.addEventListener('click', () => {
        const isCollapsed = formContentWrapper.classList.toggle('collapsed');
        btnToggleForm.classList.toggle('collapsed', isCollapsed);
        btnToggleForm.setAttribute('aria-expanded', !isCollapsed);
        if (!isCollapsed) {
            quickEntryInput.focus();
        }
    });

    function detectExpenseType(text) {
        const normalized = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const isFixed = FIXED_KEYWORDS.some(kw => normalized.includes(kw));
        return isFixed ? 'fijo' : 'personal';
    }

    function classifySubcategory(expense) {
        const text = (expense.concept || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        if (expense.type === 'fijo') {
            if (FIXED_PISO_KEYWORDS.some(kw => text.includes(kw))) {
                return 'fijo_piso';
            }
            if (FIXED_COCHERA_KEYWORDS.some(kw => text.includes(kw))) {
                return 'fijo_cochera';
            }
            return 'fijo_otros';
        }

        if (LEISURE_KEYWORDS.some(kw => text.includes(kw))) {
            return 'ocio';
        }
        if (BARS_KEYWORDS.some(kw => text.includes(kw))) {
            return 'bares';
        }
        return 'caprichos';
    }

    function parseQuickEntry(input) {
        const trimmed = input.trim();
        if (!trimmed) return null;

        const sanitized = trimmed.replace(/€/g, '').replace(/\$/g, '');
        const amountRegex = /(\d+(?:[.,]\d{1,2})?)/;
        const match = sanitized.match(amountRegex);

        if (!match) return null;

        const rawAmount = match[0];
        const numericAmount = parseFloat(rawAmount.replace(',', '.'));

        if (isNaN(numericAmount) || numericAmount <= 0) return null;

        let conceptText = sanitized.replace(rawAmount, '').replace(/\s+/g, ' ').trim();
        conceptText = conceptText.replace(/^[-: ]+|[-: ]+$/g, '');

        if (!conceptText) {
            conceptText = 'Gasto variado';
        }

        conceptText = conceptText.charAt(0).toUpperCase() + conceptText.slice(1);
        const autoType = detectExpenseType(conceptText);

        return {
            amount: numericAmount,
            concept: conceptText,
            type: autoType
        };
    }

    function applyQuickEntry() {
        const val = quickEntryInput.value;
        const parsed = parseQuickEntry(val);
        if (!parsed) {
            alert('Introduce al menos un importe y concepto. Ej: "12.50 cena" o "alquiler 600"');
            return;
        }

        conceptInput.value = parsed.concept;
        amountInput.value = parsed.amount.toFixed(2);
        typeSelect.value = parsed.type;
        resetDateField();

        if (formContentWrapper.classList.contains('collapsed')) {
            formContentWrapper.classList.remove('collapsed');
            btnToggleForm.classList.remove('collapsed');
            btnToggleForm.setAttribute('aria-expanded', 'true');
        }

        amountInput.focus();
        quickEntryInput.value = '';
    }

    btnQuickLoad.addEventListener('click', applyQuickEntry);
    quickEntryInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            applyQuickEntry();
        }
    });

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.lang = 'es-ES';
        recognition.continuous = false;
        recognition.interimResults = false;

        let isListening = false;

        recognition.onstart = () => {
            isListening = true;
            btnSpeech.classList.add('recording');
            quickEntryInput.placeholder = 'Escuchando... Di ej. "12 euros comida"';
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            quickEntryInput.value = transcript;
            applyQuickEntry();
        };

        recognition.onerror = (event) => {
            console.warn('Error en reconocimiento de voz:', event.error);
            isListening = false;
            btnSpeech.classList.remove('recording');
            quickEntryInput.placeholder = 'Escribe o pulsa el micro...';
        };

        recognition.onend = () => {
            isListening = false;
            btnSpeech.classList.remove('recording');
            quickEntryInput.placeholder = 'Escribe o pulsa el micro...';
        };

        btnSpeech.addEventListener('click', () => {
            if (isListening) {
                recognition.stop();
            } else {
                try {
                    recognition.start();
                } catch (e) {
                    console.error('Error al iniciar speech recognition:', e);
                }
            }
        });
    } else {
        btnSpeech.style.display = 'none';
    }

    function loadExpenses() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            expenses = stored ? JSON.parse(stored) : [];
            if (!Array.isArray(expenses)) expenses = [];
        } catch (e) {
            console.error('Error al parsear LocalStorage:', e);
            expenses = [];
        }
    }

    function saveExpenses() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
    }

    function getExpensesForSelectedMonth() {
        const selectedMonth = monthFilterInput.value;
        if (!selectedMonth) return expenses;

        return expenses.filter(item => item.date && item.date.startsWith(selectedMonth));
    }

    function updatePieChart(totals, grandTotal) {
        const radius = 60;
        const circumference = 2 * Math.PI * radius;
        const cx = 80;
        const cy = 80;
        const strokeWidth = 24;

        pieChartSvg.innerHTML = '';

        if (grandTotal === 0) {
            const baseCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            baseCircle.setAttribute('cx', cx);
            baseCircle.setAttribute('cy', cy);
            baseCircle.setAttribute('r', radius);
            baseCircle.setAttribute('fill', 'none');
            baseCircle.setAttribute('stroke', '#273552');
            baseCircle.setAttribute('stroke-width', strokeWidth);
            pieChartSvg.appendChild(baseCircle);

            fixedPisoPercentEl.textContent = '0%';
            fixedCocheraPercentEl.textContent = '0%';
            fixedOtrosPercentEl.textContent = '0%';
            leisurePercentEl.textContent = '0%';
            barsPercentEl.textContent = '0%';
            treatsPercentEl.textContent = '0%';
            chartCenterText.textContent = '0%';
            chartEmptyMessage.classList.remove('hidden');
            return;
        }

        chartEmptyMessage.classList.add('hidden');

        const pisoPct = Math.round((totals.fijo_piso / grandTotal) * 100);
        const cocheraPct = Math.round((totals.fijo_cochera / grandTotal) * 100);
        const otrosPct = Math.round((totals.fijo_otros / grandTotal) * 100);
        const leisurePct = Math.round((totals.ocio / grandTotal) * 100);
        const barsPct = Math.round((totals.bares / grandTotal) * 100);
        const treatsPct = Math.round((totals.caprichos / grandTotal) * 100);

        fixedPisoPercentEl.textContent = `${pisoPct}%`;
        fixedCocheraPercentEl.textContent = `${cocheraPct}%`;
        fixedOtrosPercentEl.textContent = `${otrosPct}%`;
        leisurePercentEl.textContent = `${leisurePct}%`;
        barsPercentEl.textContent = `${barsPct}%`;
        treatsPercentEl.textContent = `${treatsPct}%`;

        const totalFixedSum = totals.fijo_piso + totals.fijo_cochera + totals.fijo_otros;
        const totalFixedPct = Math.round((totalFixedSum / grandTotal) * 100);
        chartCenterText.textContent = `${totalFixedPct}% F`;

        const segments = [
            { key: 'fijo_piso', amount: totals.fijo_piso, color: '#6366f1' },
            { key: 'fijo_cochera', amount: totals.fijo_cochera, color: '#8b5cf6' },
            { key: 'fijo_otros', amount: totals.fijo_otros, color: '#94a3b8' },
            { key: 'ocio', amount: totals.ocio, color: '#38bdf8' },
            { key: 'bares', amount: totals.bares, color: '#f59e0b' },
            { key: 'caprichos', amount: totals.caprichos, color: '#34d399' }
        ];

        let accumulatedOffset = 0;

        segments.forEach(segment => {
            if (segment.amount > 0) {
                const ratio = segment.amount / grandTotal;
                const dashLength = ratio * circumference;

                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', cx);
                circle.setAttribute('cy', cy);
                circle.setAttribute('r', radius);
                circle.setAttribute('fill', 'none');
                circle.setAttribute('stroke', segment.color);
                circle.setAttribute('stroke-width', strokeWidth);
                circle.setAttribute('stroke-dasharray', `${dashLength} ${circumference}`);
                circle.setAttribute('stroke-dashoffset', `${-accumulatedOffset}`);
                pieChartSvg.appendChild(circle);

                accumulatedOffset += dashLength;
            }
        });
    }

    function updateSummary(monthExpenses) {
        let total = 0;
        let totalFixed = 0;
        let totalPersonal = 0;

        const breakdown = {
            fijo_piso: 0,
            fijo_cochera: 0,
            fijo_otros: 0,
            ocio: 0,
            bares: 0,
            caprichos: 0
        };

        monthExpenses.forEach(item => {
            const amount = parseFloat(item.amount) || 0;
            total += amount;

            if (item.type === 'fijo') {
                totalFixed += amount;
            } else {
                totalPersonal += amount;
            }

            const subcategory = classifySubcategory(item);
            if (breakdown[subcategory] !== undefined) {
                breakdown[subcategory] += amount;
            }
        });

        totalAmountEl.textContent = formatCurrency(total);
        totalFixedEl.textContent = formatCurrency(totalFixed);
        totalPersonalEl.textContent = formatCurrency(totalPersonal);

        updatePieChart(breakdown, total);
    }

    function renderList() {
        const monthExpenses = getExpensesForSelectedMonth();
        updateSummary(monthExpenses);

        let displayList = monthExpenses;
        if (currentFilter !== 'all') {
            displayList = displayList.filter(item => item.type === currentFilter);
        }

        displayList.sort((a, b) => {
            if (b.date !== a.date) {
                return b.date.localeCompare(a.date);
            }
            return (b.id || 0) - (a.id || 0);
        });

        expenseListEl.innerHTML = '';

        if (displayList.length === 0) {
            emptyStateEl.classList.remove('hidden');
        } else {
            emptyStateEl.classList.add('hidden');
            displayList.forEach(expense => {
                const li = document.createElement('li');
                li.className = 'expense-item';

                const typeLabel = expense.type === 'fijo' ? 'Fijo' : 'Personal';
                const badgeClass = expense.type === 'fijo' ? 'badge-fijo' : 'badge-personal';

                li.innerHTML = `
                    <div class="expense-info">
                        <span class="expense-concept">${escapeHtml(expense.concept)}</span>
                        <div class="expense-meta">
                            <span>${formatDateDisplay(expense.date)}</span>
                            <span class="badge ${badgeClass}">${typeLabel}</span>
                        </div>
                    </div>
                    <div class="expense-right">
                        <span class="expense-amount">${formatCurrency(expense.amount)}</span>
                        <button type="button" class="btn-delete" data-id="${expense.id}" aria-label="Eliminar gasto" title="Eliminar gasto">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                `;

                expenseListEl.appendChild(li);
            });
        }
    }

    function changeMonth(offset) {
        const [yearStr, monthStr] = monthFilterInput.value.split('-');
        let year = parseInt(yearStr, 10);
        let month = parseInt(monthStr, 10) - 1;

        const newDate = new Date(year, month + offset, 1);
        const nextYear = newDate.getFullYear();
        const nextMonth = String(newDate.getMonth() + 1).padStart(2, '0');

        monthFilterInput.value = `${nextYear}-${nextMonth}`;
        renderList();
    }

    btnPrevMonth.addEventListener('click', () => changeMonth(-1));
    btnNextMonth.addEventListener('click', () => changeMonth(1));

    function exportToExcel() {
        const monthExpenses = getExpensesForSelectedMonth();
        const dataToExport = monthExpenses.length > 0 ? monthExpenses : expenses;

        if (dataToExport.length === 0) {
            alert('No hay gastos registrados para exportar.');
            return;
        }

        const headers = ['ID', 'Fecha', 'Concepto', 'Tipo de Gasto', 'Importe (EUR)'];
        const rows = dataToExport.map(item => [
            item.id,
            item.date,
            `"${(item.concept || '').replace(/"/g, '""')}"`,
            item.type === 'fijo' ? 'Fijo' : 'Personal',
            item.amount.toString().replace('.', ',')
        ]);

        const csvContent = [headers.join(';'), ...rows.map(row => row.join(';'))].join('\r\n');
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        const currentSelectedMonth = monthFilterInput.value || 'gastos';
        link.setAttribute('href', url);
        link.setAttribute('download', `gastos_${currentSelectedMonth}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    btnExportExcel.addEventListener('click', exportToExcel);

    btnExportJson.addEventListener('click', () => {
        if (expenses.length === 0) {
            alert('No hay registros guardados para exportar en el backup.');
            return;
        }

        const backupData = {
            version: 1,
            exportedAt: new Date().toISOString(),
            expenses: expenses
        };

        const jsonString = JSON.stringify(backupData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const todayStr = getTodayDateString();

        link.setAttribute('href', url);
        link.setAttribute('download', `backup_gastos_${todayStr}.json`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    });

    btnImportJsonTrigger.addEventListener('click', () => {
        jsonFileInput.value = '';
        jsonFileInput.click();
    });

    jsonFileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const parsed = JSON.parse(event.target.result);
                let importedList = [];

                if (Array.isArray(parsed)) {
                    importedList = parsed;
                } else if (parsed && Array.isArray(parsed.expenses)) {
                    importedList = parsed.expenses;
                } else {
                    throw new Error('Formato JSON no válido.');
                }

                if (importedList.length === 0) {
                    alert('El archivo no contiene registros de gastos.');
                    return;
                }

                const existingIds = new Set(expenses.map(item => item.id));
                let addedCount = 0;

                importedList.forEach(item => {
                    if (item && item.concept && !isNaN(item.amount) && item.date) {
                        let id = item.id;
                        if (!id || existingIds.has(id)) {
                            id = Date.now() + Math.floor(Math.random() * 10000);
                        }
                        existingIds.add(id);

                        expenses.push({
                            id: id,
                            concept: String(item.concept).trim(),
                            amount: Math.abs(parseFloat(item.amount)),
                            date: item.date,
                            type: item.type === 'fijo' ? 'fijo' : 'personal'
                        });
                        addedCount++;
                    }
                });

                saveExpenses();
                renderList();
                alert(`Backup importado con éxito: se han procesado ${addedCount} gastos.`);
            } catch (err) {
                console.error('Error al importar JSON:', err);
                alert('No se pudo procesar el archivo JSON. Verifica que sea un respaldo válido.');
            }
        };

        reader.readAsText(file);
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const concept = conceptInput.value.trim();
        const amount = parseFloat(amountInput.value);
        const date = dateInput.value;
        const type = typeSelect.value;

        if (!concept || isNaN(amount) || amount <= 0 || !date) {
            return;
        }

        const newExpense = {
            id: Date.now(),
            concept,
            amount,
            date,
            type
        };

        expenses.push(newExpense);
        saveExpenses();

        const expenseMonth = date.substring(0, 7);
        if (monthFilterInput.value !== expenseMonth) {
            monthFilterInput.value = expenseMonth;
        }

        conceptInput.value = '';
        amountInput.value = '';
        quickEntryInput.value = '';
        resetDateField();
        conceptInput.focus();

        renderList();
    });

    expenseListEl.addEventListener('click', (e) => {
        const deleteButton = e.target.closest('.btn-delete');
        if (!deleteButton) return;

        const idToDelete = Number(deleteButton.dataset.id);
        expenses = expenses.filter(expense => expense.id !== idToDelete);
        saveExpenses();
        renderList();
    });

    filterPills.forEach(pill => {
        pill.addEventListener('click', () => {
            filterPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            currentFilter = pill.dataset.filter;
            renderList();
        });
    });

    monthFilterInput.addEventListener('change', () => {
        renderList();
    });

    conceptInput.addEventListener('input', () => {
        const detected = detectExpenseType(conceptInput.value);
        typeSelect.value = detected;
    });

    // ==========================================
    // 2. PESTAÑA: GASTOS PISO (CAJA COMÚN SUPABASE)
    // ==========================================
    let pisoRecords = [];
    let currentPisoFilter = 'all';

    const pisoMonthFilterInput = document.getElementById('piso-month-filter');
    const pisoBtnPrevMonth = document.getElementById('piso-btn-prev-month');
    const pisoBtnNextMonth = document.getElementById('piso-btn-next-month');

    const pisoBalanceCard = document.getElementById('piso-balance-card');
    const pisoDifferenceEl = document.getElementById('piso-difference');
    const pisoBalanceStatusEl = document.getElementById('piso-balance-status');
    const pisoTotalIncomeEl = document.getElementById('piso-total-income');
    const pisoTotalExpenseEl = document.getElementById('piso-total-expense');

    const pisoBtnToggleForm = document.getElementById('piso-btn-toggle-form');
    const pisoFormContentWrapper = document.getElementById('piso-form-content-wrapper');
    const pisoForm = document.getElementById('piso-form');
    const pisoTypeSelect = document.getElementById('piso-type');
    const pisoConceptInput = document.getElementById('piso-concept');
    const pisoAmountInput = document.getElementById('piso-amount');
    const pisoDateInput = document.getElementById('piso-date');

    const pisoExpenseListEl = document.getElementById('piso-expense-list');
    const pisoEmptyStateEl = document.getElementById('piso-empty-state');
    const pisoFilterPills = document.querySelectorAll('[data-piso-filter]');
    const pisoSyncStatusEl = document.getElementById('piso-sync-status');

    pisoMonthFilterInput.value = currentMonthKey;
    pisoDateInput.value = getTodayDateString();

    pisoBtnToggleForm.addEventListener('click', () => {
        const isCollapsed = pisoFormContentWrapper.classList.toggle('collapsed');
        pisoBtnToggleForm.classList.toggle('collapsed', isCollapsed);
        pisoBtnToggleForm.setAttribute('aria-expanded', !isCollapsed);
        if (!isCollapsed) {
            pisoConceptInput.focus();
        }
    });

    function changePisoMonth(offset) {
        const [yearStr, monthStr] = pisoMonthFilterInput.value.split('-');
        let year = parseInt(yearStr, 10);
        let month = parseInt(monthStr, 10) - 1;

        const newDate = new Date(year, month + offset, 1);
        const nextYear = newDate.getFullYear();
        const nextMonth = String(newDate.getMonth() + 1).padStart(2, '0');

        pisoMonthFilterInput.value = `${nextYear}-${nextMonth}`;
        renderPisoList();
    }

    pisoBtnPrevMonth.addEventListener('click', () => changePisoMonth(-1));
    pisoBtnNextMonth.addEventListener('click', () => changePisoMonth(1));
    pisoMonthFilterInput.addEventListener('change', () => renderPisoList());

    function getPisoRecordsForSelectedMonth() {
        const selectedMonth = pisoMonthFilterInput.value;
        if (!selectedMonth) return pisoRecords;
        return pisoRecords.filter(item => item.fecha && item.fecha.startsWith(selectedMonth));
    }

    function updatePisoSummary(records) {
        let totalIncome = 0;
        let totalExpense = 0;

        records.forEach(item => {
            const amount = parseFloat(item.importe) || 0;
            const type = (item.tipo || 'gasto').toLowerCase();

            if (type === 'ingreso') {
                totalIncome += amount;
            } else {
                totalExpense += amount;
            }
        });

        const remainingBalance = totalIncome - totalExpense;

        pisoTotalIncomeEl.textContent = formatCurrency(totalIncome);
        pisoTotalExpenseEl.textContent = formatCurrency(totalExpense);
        pisoDifferenceEl.textContent = formatCurrency(remainingBalance);

        pisoBalanceCard.classList.remove('positive', 'negative');
        if (remainingBalance > 0) {
            pisoBalanceCard.classList.add('positive');
            pisoBalanceStatusEl.textContent = 'Saldo a favor / En cuenta';
        } else if (remainingBalance < 0) {
            pisoBalanceCard.classList.add('negative');
            pisoBalanceStatusEl.textContent = 'Déficit / Falta aportar fondos';
        } else {
            pisoBalanceStatusEl.textContent = 'Cuenta en 0 €';
        }
    }

    function renderPisoList() {
        const monthRecords = getPisoRecordsForSelectedMonth();
        updatePisoSummary(monthRecords);

        let displayList = monthRecords;
        if (currentPisoFilter !== 'all') {
            displayList = displayList.filter(item => {
                const tipo = (item.tipo || 'gasto').toLowerCase();
                return tipo === currentPisoFilter;
            });
        }

        displayList.sort((a, b) => {
            const dateA = a.fecha || '';
            const dateB = b.fecha || '';
            if (dateB !== dateA) {
                return dateB.localeCompare(dateA);
            }
            return (b.id || 0) - (a.id || 0);
        });

        pisoExpenseListEl.innerHTML = '';

        if (displayList.length === 0) {
            pisoEmptyStateEl.classList.remove('hidden');
        } else {
            pisoEmptyStateEl.classList.add('hidden');
            displayList.forEach(item => {
                const li = document.createElement('li');
                li.className = 'expense-item';

                const isIngreso = (item.tipo || 'gasto').toLowerCase() === 'ingreso';
                const typeLabel = isIngreso ? 'Ingreso' : 'Gasto';
                const typeBadgeClass = isIngreso ? 'badge-ingreso' : 'badge-gasto';
                const formattedAmount = `${isIngreso ? '+' : '-'}${formatCurrency(item.importe)}`;

                li.innerHTML = `
                    <div class="expense-info">
                        <span class="expense-concept">${escapeHtml(item.concepto)}</span>
                        <div class="expense-meta">
                            <span>${formatDateDisplay(item.fecha)}</span>
                            <span class="badge ${typeBadgeClass}">${typeLabel}</span>
                        </div>
                    </div>
                    <div class="expense-right">
                        <span class="expense-amount ${isIngreso ? 'income' : ''}">${formattedAmount}</span>
                        <button type="button" class="btn-delete piso-btn-delete" data-id="${item.id}" aria-label="Eliminar registro" title="Eliminar registro">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                `;

                pisoExpenseListEl.appendChild(li);
            });
        }
    }

    // Cargar datos de la tabla 'gastos_piso' desde Supabase
    async function fetchPisoRecords() {
        if (!supabaseClient) {
            pisoSyncStatusEl.textContent = 'Sin conexión';
            pisoSyncStatusEl.style.color = '#f87171';
            return;
        }

        try {
            pisoSyncStatusEl.textContent = 'Sincronizando...';
            const { data, error } = await supabaseClient
                .from('gastos_piso')
                .select('*')
                .order('fecha', { ascending: false });

            if (error) {
                console.error('Error al leer de gastos_piso:', error);
                pisoSyncStatusEl.textContent = 'Error de conexión';
                pisoSyncStatusEl.style.color = '#f87171';
                return;
            }

            pisoRecords = (data || []).map(row => ({
                id: row.id,
                concepto: row.concepto || row.concept || 'Sin concepto',
                importe: parseFloat(row.importe || row.amount || 0),
                fecha: row.fecha || row.date || getTodayDateString(),
                tipo: row.tipo || row.type || 'gasto',
                pagado_por: row.pagado_por || row.persona || 'Común'
            }));

            pisoSyncStatusEl.textContent = 'Conectado en directo';
            pisoSyncStatusEl.style.color = '#34d399';
            renderPisoList();
        } catch (err) {
            console.error('Fallo en fetchPisoRecords:', err);
            pisoSyncStatusEl.textContent = 'Modo Offline';
        }
    }

    // Configurar suscripción Realtime en Supabase para gastos_piso
    function setupRealtimeSubscription() {
        if (!supabaseClient) return;

        try {
            supabaseClient
                .channel('public:gastos_piso')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'gastos_piso' }, payload => {
                    if (payload.eventType === 'INSERT') {
                        const newRow = payload.new;
                        const formatted = {
                            id: newRow.id,
                            concepto: newRow.concepto || newRow.concept || 'Sin concepto',
                            importe: parseFloat(newRow.importe || newRow.amount || 0),
                            fecha: newRow.fecha || newRow.date || getTodayDateString(),
                            tipo: newRow.tipo || newRow.type || 'gasto',
                            pagado_por: newRow.pagado_por || 'Común'
                        };
                        pisoRecords = pisoRecords.filter(item => item.id !== formatted.id);
                        pisoRecords.unshift(formatted);
                    } else if (payload.eventType === 'DELETE') {
                        pisoRecords = pisoRecords.filter(item => item.id !== payload.old.id);
                    } else if (payload.eventType === 'UPDATE') {
                        const updatedRow = payload.new;
                        pisoRecords = pisoRecords.map(item => item.id === updatedRow.id ? {
                            id: updatedRow.id,
                            concepto: updatedRow.concepto || updatedRow.concept || item.concepto,
                            importe: parseFloat(updatedRow.importe || updatedRow.amount || item.importe),
                            fecha: updatedRow.fecha || updatedRow.date || item.fecha,
                            tipo: updatedRow.tipo || updatedRow.type || item.tipo,
                            pagado_por: updatedRow.pagado_por || item.pagado_por || 'Común'
                        } : item);
                    }
                    renderPisoList();
                })
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        pisoSyncStatusEl.textContent = 'Conectado en directo';
                    }
                });
        } catch (err) {
            console.warn('Realtime no disponible:', err);
        }
    }

    // Enviar nuevo movimiento a Supabase
    pisoForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const concepto = pisoConceptInput.value.trim();
        const importe = parseFloat(pisoAmountInput.value);
        const fecha = pisoDateInput.value;
        const tipo = pisoTypeSelect.value;

        if (!concepto || isNaN(importe) || importe <= 0 || !fecha) {
            return;
        }

        const newRecord = {
            concepto,
            importe,
            fecha,
            tipo,
            pagado_por: 'Común'
        };

        if (!supabaseClient) {
            alert('No hay conexión con Supabase. Revisa tu red.');
            return;
        }

        const submitBtn = document.getElementById('piso-btn-submit');
        submitBtn.disabled = true;

        try {
            const { data, error } = await supabaseClient
                .from('gastos_piso')
                .insert([newRecord])
                .select();

            if (error) {
                console.error('Error insertando en Supabase:', error);
                alert('No se pudo guardar en Supabase: ' + error.message);
                return;
            }

            // Sincronizar mes visible
            const recordMonth = fecha.substring(0, 7);
            if (pisoMonthFilterInput.value !== recordMonth) {
                pisoMonthFilterInput.value = recordMonth;
            }

            // Si vino el registro insertado y realtime aún no lo puso
            if (data && data[0]) {
                const inserted = {
                    id: data[0].id,
                    concepto: data[0].concepto || concepto,
                    importe: parseFloat(data[0].importe || importe),
                    fecha: data[0].fecha || fecha,
                    tipo: data[0].tipo || tipo,
                    pagado_por: data[0].pagado_por || 'Común'
                };
                if (!pisoRecords.some(r => r.id === inserted.id)) {
                    pisoRecords.unshift(inserted);
                }
            }

            pisoConceptInput.value = '';
            pisoAmountInput.value = '';
            pisoDateInput.value = getTodayDateString();
            pisoConceptInput.focus();

            renderPisoList();
        } catch (err) {
            console.error('Error inesperado al guardar gasto del piso:', err);
            alert('Ocurrió un error inesperado al conectar con Supabase.');
        } finally {
            submitBtn.disabled = false;
        }
    });

    // Eliminar registro de gastos_piso en Supabase
    pisoExpenseListEl.addEventListener('click', async (e) => {
        const deleteButton = e.target.closest('.piso-btn-delete');
        if (!deleteButton) return;

        const idToDelete = deleteButton.dataset.id;
        if (!idToDelete) return;

        if (!confirm('¿Eliminar este movimiento del piso?')) {
            return;
        }

        if (!supabaseClient) {
            alert('No hay conexión con Supabase.');
            return;
        }

        try {
            const { error } = await supabaseClient
                .from('gastos_piso')
                .delete()
                .eq('id', idToDelete);

            if (error) {
                console.error('Error al eliminar registro de Supabase:', error);
                alert('Error al borrar: ' + error.message);
                return;
            }

            pisoRecords = pisoRecords.filter(item => String(item.id) !== String(idToDelete));
            renderPisoList();
        } catch (err) {
            console.error('Fallo al borrar:', err);
        }
    });

    // Filtros de la pestaña Gastos Piso
    pisoFilterPills.forEach(pill => {
        pill.addEventListener('click', () => {
            pisoFilterPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            currentPisoFilter = pill.dataset.pisoFilter;
            renderPisoList();
        });
    });

    // ==========================================
    // 3. INICIALIZACIÓN GENERAL
    // ==========================================
    checkMonthlyReminder();
    loadExpenses();
    renderList();

    // Iniciar Supabase y Realtime en segundo plano
    if (supabaseClient) {
        setupRealtimeSubscription();
        fetchPisoRecords();
    }
});
