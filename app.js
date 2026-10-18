document.addEventListener('DOMContentLoaded', () => {
    const STORAGE_KEY = 'monthly_expenses_app';

    // Estado en memoria
    let expenses = [];
    let currentFilter = 'all';

    // Referencias DOM
    const form = document.getElementById('expense-form');
    const conceptInput = document.getElementById('expense-concept');
    const amountInput = document.getElementById('expense-amount');
    const dateInput = document.getElementById('expense-date');
    const typeSelect = document.getElementById('expense-type');
    const monthFilterInput = document.getElementById('month-filter');

    const totalAmountEl = document.getElementById('total-amount');
    const totalFixedEl = document.getElementById('total-fixed');
    const totalPersonalEl = document.getElementById('total-personal');

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

    // Filtrar por el mes seleccionado en la cabecera
    function getExpensesForSelectedMonth() {
        const selectedMonth = monthFilterInput.value; // YYYY-MM
        if (!selectedMonth) return expenses;

        return expenses.filter(item => item.date.startsWith(selectedMonth));
    }

    // Actualizar tarjetas de totales
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

        // Ordenar: más recientes primero (por fecha y luego por id/creación)
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
                        <button type="button" class="btn-delete" data-id="${expense.id}" aria-label="Eliminar gasto">
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

        // Si la fecha añadida pertenece a otro mes, sincronizar el selector de mes
        const expenseMonth = date.substring(0, 7);
        if (monthFilterInput.value !== expenseMonth) {
            monthFilterInput.value = expenseMonth;
        }

        // Limpiar formulario y mantener la fecha
        conceptInput.value = '';
        amountInput.value = '';
        conceptInput.focus();

        renderList();
    });

    // Manejar eliminación de gastos (delegación de eventos)
    expenseListEl.addEventListener('click', (e) => {
        const deleteButton = e.target.closest('.btn-delete');
        if (!deleteButton) return;

        const idToDelete = Number(deleteButton.dataset.id);
        expenses = expenses.filter(expense => expense.id !== idToDelete);
        saveExpenses();
        renderList();
    });

    // Manejar cambios en filtro (Todos / Fijos / Personales)
    filterPills.forEach(pill => {
        pill.addEventListener('click', () => {
            filterPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            currentFilter = pill.dataset.filter;
            renderList();
        });
    });

    // Cambiar mes seleccionado
    monthFilterInput.addEventListener('change', () => {
        renderList();
    });

    // Inicialización
    loadExpenses();
    renderList();
});
