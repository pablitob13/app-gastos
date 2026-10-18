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

    // Estado en memoria
    let expenses = [];
    let currentFilter = 'all';

    // Referencias DOM
    const btnToggleForm = document.getElementById('btn-toggle-form');
    const form = document.getElementById('expense-form');
    const conceptInput = document.getElementById('expense-concept');
    const amountInput = document.getElementById('expense-amount');
    const dateInput = document.getElementById('expense-date');
    const typeSelect = document.getElementById('expense-type');
    const monthFilterInput = document.getElementById('month-filter');
    const btnPrevMonth = document.getElementById('btn-prev-month');
    const btnNextMonth = document.getElementById('btn-next-month');
    const btnExportExcel = document.getElementById('btn-export-excel');

    const totalAmountEl = document.getElementById('total-amount');
    const totalFixedEl = document.getElementById('total-fixed');
    const totalPersonalEl = document.getElementById('total-personal');

    const pieChartSvg = document.getElementById('pie-chart-svg');
    const fixedPercentEl = document.getElementById('fixed-percent');
    const personalPercentEl = document.getElementById('personal-percent');
    const chartCenterText = document.querySelector('.chart-center-text');
    const chartEmptyMessage = document.getElementById('chart-empty-message');

    const expenseListEl = document.getElementById('expense-list');
    const emptyStateEl = document.getElementById('empty-state');
    const filterPills = document.querySelectorAll('.filter-pills .pill');

    // Inicializar fechas por defecto (hoy y mes actual)
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = String(today.getMonth() + 1).padStart(2, '0');
    const currentDay = String(today.getDate()).padStart(2, '0');

    dateInput.value = `${currentYear}-${currentMonth}-${currentDay}`;
    monthFilterInput.value = `${currentYear}-${currentMonth}`;

    // Toggle para el botón principal "Añadir Nuevo Gasto"
    btnToggleForm.addEventListener('click', () => {
        const isCollapsed = form.classList.toggle('collapsed');
        btnToggleForm.classList.toggle('collapsed', isCollapsed);
        btnToggleForm.setAttribute('aria-expanded', !isCollapsed);
        if (!isCollapsed) {
            conceptInput.focus();
        }
    });

    // Cargar datos de LocalStorage
    function loadExpenses() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            expenses = stored ? JSON.parse(stored) : [];
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
        const [year, month, day] = isoDateString.split('-');
        return `${day}/${month}/${year}`;
    }

    // Filtrar por el mes seleccionado en la cabecera (YYYY-MM)
    function getExpensesForSelectedMonth() {
        const selectedMonth = monthFilterInput.value;
        if (!selectedMonth) return expenses;

        return expenses.filter(item => item.date.startsWith(selectedMonth));
    }

    // Actualizar el gráfico de tarta SVG con porcentajes
    function updatePieChart(totalFixed, totalPersonal, total) {
        const radius = 60;
        const circumference = 2 * Math.PI * radius; // ~376.99
        const cx = 80;
        const cy = 80;
        const strokeWidth = 24;

        pieChartSvg.innerHTML = '';

        if (total === 0) {
            // Círculo neutro de fondo si no hay gastos
            const baseCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            baseCircle.setAttribute('cx', cx);
            baseCircle.setAttribute('cy', cy);
            baseCircle.setAttribute('r', radius);
            baseCircle.setAttribute('fill', 'none');
            baseCircle.setAttribute('stroke', '#273552');
            baseCircle.setAttribute('stroke-width', strokeWidth);
            pieChartSvg.appendChild(baseCircle);

            fixedPercentEl.textContent = '0%';
            personalPercentEl.textContent = '0%';
            chartCenterText.textContent = '0%';
            chartEmptyMessage.classList.remove('hidden');
            return;
        }

        chartEmptyMessage.classList.add('hidden');

        const fixedRatio = totalFixed / total;
        const personalRatio = totalPersonal / total;

        const fixedPercent = Math.round(fixedRatio * 100);
        const personalPercent = Math.round(personalRatio * 100);

        fixedPercentEl.textContent = `${fixedPercent}%`;
        personalPercentEl.textContent = `${personalPercent}%`;
        chartCenterText.textContent = `${fixedPercent}% F`;

        const fixedDash = fixedRatio * circumference;
        const personalDash = personalRatio * circumference;

        // Porción de Gastos Fijos (Púrpura/Indigo)
        if (totalFixed > 0) {
            const fixedCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            fixedCircle.setAttribute('cx', cx);
            fixedCircle.setAttribute('cy', cy);
            fixedCircle.setAttribute('r', radius);
            fixedCircle.setAttribute('fill', 'none');
            fixedCircle.setAttribute('stroke', '#818cf8');
            fixedCircle.setAttribute('stroke-width', strokeWidth);
            fixedCircle.setAttribute('stroke-dasharray', `${fixedDash} ${circumference}`);
            fixedCircle.setAttribute('stroke-dashoffset', '0');
            pieChartSvg.appendChild(fixedCircle);
        }

        // Porción de Gastos Personales (Verde esmeralda)
        if (totalPersonal > 0) {
            const personalCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            personalCircle.setAttribute('cx', cx);
            personalCircle.setAttribute('cy', cy);
            personalCircle.setAttribute('r', radius);
            personalCircle.setAttribute('fill', 'none');
            personalCircle.setAttribute('stroke', '#34d399');
            personalCircle.setAttribute('stroke-width', strokeWidth);
            personalCircle.setAttribute('stroke-dasharray', `${personalDash} ${circumference}`);
            personalCircle.setAttribute('stroke-dashoffset', `-${fixedDash}`);
            pieChartSvg.appendChild(personalCircle);
        }
    }

    // Actualizar tarjetas de totales y gráfico
    function updateSummary(monthExpenses) {
        let total = 0;
        let totalFixed = 0;
        let totalPersonal = 0;

        monthExpenses.forEach(item => {
            const amount = parseFloat(item.amount) || 0;
            total += amount;
            if (item.type === 'fijo') {
                totalFixed += amount;
            } else if (item.type === 'personal') {
                totalPersonal += amount;
            }
        });

        totalAmountEl.textContent = formatCurrency(total);
        totalFixedEl.textContent = formatCurrency(totalFixed);
        totalPersonalEl.textContent = formatCurrency(totalPersonal);

        updatePieChart(totalFixed, totalPersonal, total);
    }

    // Renderizar la lista de gastos
    function renderList() {
        const monthExpenses = getExpensesForSelectedMonth();
        updateSummary(monthExpenses);

        // Filtrado por categoría
        let displayList = monthExpenses;
        if (currentFilter !== 'all') {
            displayList = displayList.filter(item => item.type === currentFilter);
        }

        // Ordenar: más recientes primero
        displayList.sort((a, b) => {
            if (b.date !== a.date) {
                return b.date.localeCompare(a.date);
            }
            return b.id - a.id;
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
        let month = parseInt(monthStr, 10) - 1; // 0-index

        const newDate = new Date(year, month + offset, 1);
        const nextYear = newDate.getFullYear();
        const nextMonth = String(newDate.getMonth() + 1).padStart(2, '0');

        monthFilterInput.value = `${nextYear}-${nextMonth}`;
        renderList();
    }

    btnPrevMonth.addEventListener('click', () => changeMonth(-1));
    btnNextMonth.addEventListener('click', () => changeMonth(1));

    // Exportar a Excel (CSV con formato y codificación UTF-8 BOM para Excel)
    function exportToExcel() {
        const monthExpenses = getExpensesForSelectedMonth();
        const dataToExport = monthExpenses.length > 0 ? monthExpenses : expenses;

        if (dataToExport.length === 0) {
            alert('No hay gastos registrados para exportar.');
            return;
        }

        // Encabezados en español
        const headers = ['ID', 'Fecha', 'Concepto', 'Tipo de Gasto', 'Importe (EUR)'];
        const rows = dataToExport.map(item => [
            item.id,
            item.date,
            `"${item.concept.replace(/"/g, '""')}"`,
            item.type === 'fijo' ? 'Fijo' : 'Personal',
            item.amount.toString().replace('.', ',') // Formato de coma decimal para Excel en español
        ]);

        // Separador ';' para compatibilidad nativa con Excel en español
        const csvContent = [headers.join(';'), ...rows.map(row => row.join(';'))].join('\r\n');

        // \uFEFF añade el Byte Order Mark (BOM) para que Excel reconozca tildes y caracteres especiales
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

        conceptInput.value = '';
        amountInput.value = '';
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

    // Cambio directo en el input de mes
    monthFilterInput.addEventListener('change', () => {
        renderList();
    });

    // Inicio
    loadExpenses();
    renderList();
});
