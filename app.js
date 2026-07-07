document.addEventListener('DOMContentLoaded', () => {
    // -----------------------------------------------------------------
    // 1. DOM 요소 취득
    // -----------------------------------------------------------------
    const basicFormula = document.getElementById('basic-formula');
    const basicInput = document.getElementById('basic-input');
    const basicHistoryList = document.getElementById('basic-history-list');
    const btnClearHistory = document.getElementById('btn-clear-history');
    
    const btnToggleHistory = document.getElementById('btn-toggle-history');
    const btnCloseHistory = document.getElementById('btn-close-history');
    const historySidebar = document.getElementById('history-sidebar');
    
    const themeToggleBtn = document.getElementById('theme-toggle');
    const themeIcon = themeToggleBtn.querySelector('i');

    // -----------------------------------------------------------------
    // 2. 테마 전환 (다크 / 라이트 모드)
    // -----------------------------------------------------------------
    const toggleTheme = () => {
        if (document.body.classList.contains('dark-theme')) {
            document.body.classList.remove('dark-theme');
            document.body.classList.add('light-theme');
            themeIcon.className = 'fa-solid fa-moon';
            localStorage.setItem('theme', 'light');
        } else {
            document.body.classList.remove('light-theme');
            document.body.classList.add('dark-theme');
            themeIcon.className = 'fa-solid fa-sun';
            localStorage.setItem('theme', 'dark');
        }
    };

    // 저장된 테마 로드
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
        themeIcon.className = 'fa-solid fa-moon';
    }

    themeToggleBtn.addEventListener('click', toggleTheme);

    // -----------------------------------------------------------------
    // 3. 히스토리 사이드바 토글
    // -----------------------------------------------------------------
    const openHistory = () => historySidebar.classList.add('open');
    const closeHistory = () => historySidebar.classList.remove('open');

    btnToggleHistory.addEventListener('click', openHistory);
    btnCloseHistory.addEventListener('click', closeHistory);

    // 토스트 알림
    const showToast = (message) => {
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.style.position = 'fixed';
        toast.style.bottom = '30px';
        toast.style.left = '50%';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
        toast.style.background = 'rgba(15, 23, 42, 0.95)';
        toast.style.color = '#fff';
        toast.style.padding = '10px 20px';
        toast.style.borderRadius = '30px';
        toast.style.fontSize = '0.85rem';
        toast.style.fontWeight = '600';
        toast.style.boxShadow = '0 8px 24px rgba(0,0,0,0.2)';
        toast.style.zIndex = '1000';
        toast.style.opacity = '0';
        toast.style.transition = 'all 0.3s ease';
        toast.innerText = message;

        document.body.appendChild(toast);

        toast.offsetHeight; // Reflow

        toast.style.transform = 'translateX(-50%) translateY(0)';
        toast.style.opacity = '1';

        setTimeout(() => {
            toast.style.transform = 'translateX(-50%) translateY(20px)';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    };

    // -----------------------------------------------------------------
    // 4. 계산 연산 상태 및 로직
    // -----------------------------------------------------------------
    let calcVal = '0';
    let calcExpression = '';
    let isEvaluated = false;
    let history = JSON.parse(localStorage.getItem('calc_history')) || [];

    const updateCalcScreen = () => {
        // 천 단위 반점 추가하여 화면에 표시 (숫자 형태인 경우만)
        if (!isNaN(calcVal) && calcVal !== '' && calcVal !== '오류') {
            const parts = calcVal.split('.');
            parts[0] = parseFloat(parts[0]).toLocaleString('ko-KR');
            basicInput.textContent = parts.join('.');
        } else {
            basicInput.textContent = calcVal;
        }
        basicFormula.textContent = calcExpression;
    };

    const renderHistory = () => {
        if (history.length === 0) {
            basicHistoryList.innerHTML = '<div class="empty-history">계산 기록이 없습니다.</div>';
            return;
        }

        basicHistoryList.innerHTML = '';
        history.slice().reverse().forEach((item) => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            historyItem.innerHTML = `
                <div class="history-item-formula">${item.expr}</div>
                <div class="history-item-result">${item.res}</div>
            `;
            // 기록 클릭 시 현재 화면에 로드
            historyItem.addEventListener('click', () => {
                calcVal = item.res.replace(/,/g, '');
                calcExpression = item.expr;
                isEvaluated = true;
                updateCalcScreen();
                closeHistory();
                showToast('계산 수식이 로드되었습니다.');
            });
            basicHistoryList.appendChild(historyItem);
        });
    };

    const addToHistory = (expr, res) => {
        history.push({ expr, res });
        if (history.length > 20) history.shift();
        localStorage.setItem('calc_history', JSON.stringify(history));
        renderHistory();
    };

    const clearHistory = () => {
        history = [];
        localStorage.removeItem('calc_history');
        renderHistory();
        showToast('계산 기록이 삭제되었습니다.');
    };

    btnClearHistory.addEventListener('click', clearHistory);
    renderHistory();

    const handleCalcInput = (input) => {
        // 숫자 또는 소수점 입력
        if (!isNaN(input) || input === '.') {
            if (isEvaluated) {
                calcVal = '';
                isEvaluated = false;
            }
            if (calcVal === '0' && input !== '.') {
                calcVal = input;
            } else {
                if (input === '.' && calcVal.includes('.')) return;
                calcVal += input;
            }
        }
        // 연산자 처리 (+, -, *, /)
        else if (['+', '-', '*', '/'].includes(input)) {
            isEvaluated = false;
            let displayOperator = '';
            if (input === '+') displayOperator = ' + ';
            if (input === '-') displayOperator = ' - ';
            if (input === '*') displayOperator = ' × ';
            if (input === '/') displayOperator = ' ÷ ';

            // 직전 입력이 연산자이고, 새로 입력된 연산자로 변경하고자 할 때
            if (calcExpression && (calcVal === '0' || calcVal === '')) {
                calcExpression = calcExpression.trim().replace(/[\+\-\×\÷]$/, displayOperator.trim());
            } else {
                calcExpression += calcVal + displayOperator;
                calcVal = '0';
            }
        } 
        // 부호 반전 (+/-)
        else if (input === 'toggle-sign') {
            if (calcVal !== '0' && calcVal !== '오류' && calcVal !== '') {
                if (calcVal.startsWith('-')) {
                    calcVal = calcVal.slice(1);
                } else {
                    calcVal = '-' + calcVal;
                }
            }
        }
        // 백분율 (%)
        else if (input === 'percent') {
            if (calcVal !== '0' && calcVal !== '오류' && calcVal !== '') {
                calcVal = (parseFloat(calcVal) / 100).toString();
            }
        }
        // 한 글자 지우기 (Backspace)
        else if (input === 'backspace') {
            if (isEvaluated) {
                calcExpression = '';
                isEvaluated = false;
            }
            if (calcVal.length > 1) {
                calcVal = calcVal.slice(0, -1);
                if (calcVal === '-') calcVal = '0';
            } else {
                calcVal = '0';
            }
        }
        // 전체 지우기 (AC)
        else if (input === 'clear') {
            calcVal = '0';
            calcExpression = '';
            isEvaluated = false;
        }
        // 결과 계산 (=)
        else if (input === 'equals') {
            let finalExpr = calcExpression + calcVal;
            if (!finalExpr || finalExpr === '0') return;

            // 디스플레이 연산자 기호를 표준 수학 연산자로 교체
            let evalExpr = finalExpr.replace(/×/g, '*').replace(/÷/g, '/');
            
            try {
                // 안전한 화이트리스트 기반 평가 식 (숫자, 연산자, 공백만 허용)
                if (/^[0-9.+\-*/\s()]*$/.test(evalExpr)) {
                    let result = new Function(`return (${evalExpr})`)();
                    
                    if (result === Infinity || result === -Infinity || isNaN(result)) {
                        calcVal = '오류';
                    } else {
                        // 자바스크립트 부동소수점 오차 정정 (소수점 10자리 제한 후 불필요한 0 제거)
                        calcVal = Number(result.toFixed(10)).toString();
                        addToHistory(finalExpr + ' =', Number(calcVal).toLocaleString('ko-KR'));
                    }
                    calcExpression = '';
                    isEvaluated = true;
                } else {
                    calcVal = '오류';
                }
            } catch (err) {
                calcVal = '오류';
            }
        }
        updateCalcScreen();
    };

    // 버튼 클릭 이벤트 바인딩
    document.querySelectorAll('.calc-buttons .btn-calc').forEach(btn => {
        btn.addEventListener('click', () => {
            const val = btn.getAttribute('data-val');
            const action = btn.getAttribute('data-action');

            if (val) {
                handleCalcInput(val);
            } else if (action) {
                handleCalcInput(action);
            } else if (btn.id === 'btn-basic-equals') {
                handleCalcInput('equals');
            }
        });
    });

    // 키보드 키 매핑
    document.addEventListener('keydown', (e) => {
        const key = e.key;
        if (!isNaN(key)) {
            handleCalcInput(key);
        } else if (key === '.') {
            handleCalcInput('.');
        } else if (key === '+') {
            handleCalcInput('+');
        } else if (key === '-') {
            handleCalcInput('-');
        } else if (key === '*') {
            handleCalcInput('*');
        } else if (key === '/') {
            e.preventDefault(); // 웹 브라우저의 기본 빠른 찾기 단축키 방지
            handleCalcInput('/');
        } else if (key === '%') {
            handleCalcInput('percent');
        } else if (key === 'Enter' || key === '=') {
            e.preventDefault();
            handleCalcInput('equals');
        } else if (key === 'Backspace') {
            handleCalcInput('backspace');
        } else if (key === 'Escape') {
            handleCalcInput('clear');
        }
    });

    updateCalcScreen();
});
