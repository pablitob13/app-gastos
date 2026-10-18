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

    const STORAGE_KEY = 'monthly_expenses_app';
    const DISMISSED_REMINDER_PREFIX = 'dismissed_reminder_';

    // Estado en memoria
    let expenses = [];
    let currentFilter = 'all';

    // Referencias DOM
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

    // Palabras clave para categorización automática general
    const FIXED_KEYWORDS = [
        'alquiler', 'hipoteca', 'comunidad', 'piso', 'casa', 'luz', 'agua', 'gas',
        'internet', 'fibra', 'telefono', 'móvil', 'movil', 'cochera', 'garaje',
        'parking', 'plaza', 'seguro', 'coche', 'moto', 'gimnasio', 'cuota',
        'impuesto', 'ibi', 'prestamo', 'préstamo', 'matricula', 'colegio',
        'guarderia', 'tarjeta'
    ];

    // Subcategorías de Gastos Fijos
    const FIXED_PISO_KEYWORDS = [
        'alquiler', 'piso', 'hipoteca', 'comunidad', 'casa', 'luz', 'agua', 'gas',
        'internet', 'fibra'
    ];

    const FIXED_COCHERA_KEYWORDS = [
        'cochera', 'garaje', 'parking', 'plaza'
    ];

    // Subcategorías de Gastos Personales
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

    // Helper: Obtener fecha actual en formato YYYY-MM-DD
    function getTodayDateString() {
        const today = new Date();
        const y = today.getFullYear();
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const d = String(today.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    // Inicializar campo fecha con el día actual
    function resetDateField() {
        dateInput.value = getTodayDateString();
    }

    // Inicializar mes por defecto
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = String(today.getMonth() + 1).padStart(2, '0');
    const currentMonthKey = `${currentYear}-${currentMonth}`;
    monthFilterInput.value = currentMonthKey;
    resetDateField();

    // Comprobar y mostrar recordatorio de inicio de mes (días 1 al 5)
    function checkMonthlyReminder() {
        const dayOfMonth = today.getDate();
        const isStartOfMonth = dayOfMonth >= 1 && dayOfMonth <= 5;
        const dismissalKey = `${DISMISSED_REMINDER_PREFIX}${currentMonthKey}`;
        const isDismissed = localStorage.getItem(dismissalKey) === 'true';

        if (isStartOfMonth && !isDismissed) {
            reminderBanner.classList.remove('hidden');
        } else {
            reminderBanner.classList.add('hidden');
        }
    }

    // Descartar aviso para el resto del mes actual
    btnDismissReminder.addEventListener('click', () => {
        const dismissalKey = `${DISMISSED_REMINDER_PREFIX}${currentMonthKey}`;
        localStorage.setItem(dismissalKey, 'true');
        reminderBanner.classList.add('hidden');
    });

    // Toggle para el botón principal "Añadir Nuevo Gasto"
    btnToggleForm.addEventListener('click', () => {
        const isCollapsed = formContentWrapper.classList.toggle('collapsed');
        btnToggleForm.classList.toggle('collapsed', isCollapsed);
        btnToggleForm.setAttribute('aria-expanded', !isCollapsed);
        if (!isCollapsed) {
            quickEntryInput.focus();
        }
    });

    // Detectar tipo de gasto a partir del texto de concepto
    function detectExpenseType(text) {
        const normalized = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const isFixed = FIXED_KEYWORDS.some(kw => normalized.includes(kw));
        return isFixed ? 'fijo' : 'personal';
    }

    // Clasificación interna para el gráfico (Fijo: Piso, Cochera, Otros; Personal: Ocio, Bares, Caprichos)
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

        // Gastos personales
        if (LEISURE_KEYWORDS.some(kw => text.includes(kw))) {
            return 'ocio';
        }
        if (BARS_KEYWORDS.some(kw => text.includes(kw))) {
            return 'bares';
        }
        return 'caprichos';
    }

    // Parseador de Entrada Rápida (Soporta: "12.50 cena", "cena 12.50", "alquiler 600€", "15,80 cafe")
    function parseQuickEntry(input) {
        const trimmed = input.trim();
        if (!trimmed) return null;

        // Limpiar símbolos de moneda opcionales
        const sanitized = trimmed.replace(/€/g, '').replace(/\$/g, '');

        // Buscar coincidencia de importe en cualquier parte del texto
        const amountRegex = /(\d+(?:[.,]\d{1,2})?)/;
        const match = sanitized.match(amountRegex);

        if (!match) return null;

        const rawAmount = match[0];
        const numericAmount = parseFloat(rawAmount.replace(',', '.'));

        if (isNaN(numericAmount) || numericAmount <= 0) return null;

        // El concepto es todo el texto restante eliminando la parte numérica encontrada
        let conceptText = sanitized.replace(rawAmount, '').replace(/\s+/g, ' ').trim();
        conceptText = conceptText.replace(/^[-: ]+|[-: ]+$/g, '');

        if (!conceptText) {
            conceptText = 'Gasto variado';
        }

        // Capitalizar primera letra del concepto
        conceptText = conceptText.charAt(0).toUpperCase() + conceptText.slice(1);

        const autoType = detectExpenseType(conceptText);

        return {
            amount: numericAmount,
            concept: conceptText,
            type: autoType
        };
    }

    // Cargar datos procesados en el formulario
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

        // Si el formulario estaba colapsado, desplegarlo
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

    // Soporte de Reconocimiento de Voz (Web Speech API)
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

    // Cargar datos de LocalStorage
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

    // Guardar en LocalStorage
    function saveExpenses() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
    }

    // Formatear moneda en Euros
    function formatCurrency(amount) {
        return new Intl.NumberFormat('es-ES', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    }

    // Formatear fecha para el listado (dd/mm/yyyy)
    function formatDateDisplay(isoDateString) {
        if (!isoDateString || !isoDateString.includes('-')) return isoDateString;
        const [year, month, day] = isoDateString.split('-');
        return `${day}/${month}/${year}`;
    }

    // Filtrar por el mes seleccionado en la cabecera (YYYY-MM)
    function getExpensesForSelectedMonth() {
        const selectedMonth = monthFilterInput.value;
        if (!selectedMonth) return expenses;

        return expenses.filter(item => item.date && item.date.startsWith(selectedMonth));
    }

    // Actualizar el gráfico de tarta SVG con 6 categorías
    function updatePieChart(totals, grandTotal) {
        const radius = 60;
        const circumference = 2 * Math.PI * radius; // ~376.99
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

        // Porcentajes
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

        // Segmentos en orden visual armónico
        const segments = [
            { key: 'fijo_piso', amount: totals.fijo_piso, color: '#6366f1' },       // Índigo
            { key: 'fijo_cochera', amount: totals.fijo_cochera, color: '#8b5cf6' }, // Violeta
            { key: 'fijo_otros', amount: totals.fijo_otros, color: '#94a3b8' },     // Pizarra suave
            { key: 'ocio', amount: totals.ocio, color: '#38bdf8' },                 // Celeste
            { key: 'bares', amount: totals.bares, color: '#f59e0b' },               // Ámbar
            { key: 'caprichos', amount: totals.caprichos, color: '#34d399' }        // Verde esmeralda
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

    // Actualizar tarjetas de totales y gráfico
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

    // Renderizar la lista de gastos
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

                // Se mantiene la lista limpia mostrando solo Fijo o Personal
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

    // Escapar texto para prevenir XSS
    function escapeHtml(string) {
        const div = document.createElement('div');
        div.textContent = string;
        return div.innerHTML;
    }

    // Navegar mes anterior / mes siguiente
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

    // Exportar a Excel (CSV con UTF-8 BOM)
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

    // COPIA DE SEGURIDAD EN JSON: Exportar
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

    // COPIA DE SEGURIDAD EN JSON: Trigger selector de archivo
    btnImportJsonTrigger.addEventListener('click', () => {
        jsonFileInput.value = '';
        jsonFileInput.click();
    });

    // COPIA DE SEGURIDAD EN JSON: Importar y fusionar datos
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

                const existingIds = new Set(expenses.map(e => e.id));
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

    // Manejar envío de formulario
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

        // Sincronizar el mes seleccionado si el nuevo gasto pertenece a otro mes
        const expenseMonth = date.substring(0, 7);
        if (monthFilterInput.value !== expenseMonth) {
            monthFilterInput.value = expenseMonth;
        }

        // Restablecer formulario y volver a asignar la fecha de hoy automáticamente
        conceptInput.value = '';
        amountInput.value = '';
        quickEntryInput.value = '';
        resetDateField();
        conceptInput.focus();

        renderList();
    });

    // Manejar eliminación de gastos
    expenseListEl.addEventListener('click', (e) => {
        const deleteButton = e.target.closest('.btn-delete');
        if (!deleteButton) return;

        const idToDelete = Number(deleteButton.dataset.id);
        expenses = expenses.filter(expense => expense.id !== idToDelete);
        saveExpenses();
        renderList();
    });

    // Filtros de categoría
    filterPills.forEach(pill => {
        pill.addEventListener('click', () => {
            filterPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            currentFilter = pill.dataset.filter;
            renderList();
        });
    });

    // Cambio directo en el selector de mes
    monthFilterInput.addEventListener('change', () => {
        renderList();
    });

    // Auto-clasificación en el formulario mientras se escribe en el concepto
    conceptInput.addEventListener('input', () => {
        const detected = detectExpenseType(conceptInput.value);
        typeSelect.value = detected;
    });

    // Inicio
    checkMonthlyReminder();
    loadExpenses();
    renderList();
});
