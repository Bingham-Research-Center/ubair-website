document.addEventListener('DOMContentLoaded', function() {
    // Initialize map
    initializeWeatherMap();

    // Initialize controls
    initializeControls();

    // Initialize tooltips
    initializeTooltips();

    // Initialize kiosk mode
    initializeKioskMode();
});

let weatherMap;
let kioskInterval;
let isKioskMode = false;

function initializeWeatherMap() {
    weatherMap = L.map('weather-map').setView([40.3033, -110.0153], 9);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    }).addTo(weatherMap);

    // Add Basin boundary or other base layers here
}

function initializeControls() {
    const variableSelect = document.getElementById('weather-variable');
    const timeSelect = document.getElementById('forecast-time');
    const toggles = document.querySelectorAll('input[type="checkbox"]');

    variableSelect.addEventListener('change', updateWeatherDisplay);
    timeSelect.addEventListener('change', updateWeatherDisplay);

    toggles.forEach(toggle => {
        toggle.addEventListener('change', updateMapLayers);
    });
}

function updateWeatherDisplay() {
    const variable = document.getElementById('weather-variable').value;
    const time = document.getElementById('forecast-time').value;

    document.getElementById('current-variable').textContent =
        variable.charAt(0).toUpperCase() + variable.slice(1);
    document.getElementById('current-time').textContent =
        time === 'current' ? 'Current Conditions' : `Forecast: +${time}`;

    // Update map layers based on selection
    updateMapLayers();
}

function updateMapLayers() {
    // Placeholder for updating map layers based on toggles
    console.log('Updating map layers');
}

function initializeKioskMode() {
    const kioskButton = document.getElementById('kiosk-toggle');
    const kioskStatus = document.getElementById('kiosk-status');
    const kioskTimer = document.getElementById('kiosk-timer');
    const timerCountdown = document.getElementById('timer-countdown');

    kioskButton.addEventListener('click', function() {
        if (isKioskMode) {
            stopKioskMode();
        } else {
            startKioskMode();
        }
    });

    function startKioskMode() {
        isKioskMode = true;
        kioskButton.innerHTML = '<i class="fas fa-stop"></i> Stop Kiosk Mode';
        kioskButton.classList.add('active');
        document.querySelector('.status-text').textContent = 'Kiosk Mode';
        kioskTimer.style.display = 'flex';
        document.body.classList.add('kiosk-mode');

        let countdown = 30;
        timerCountdown.textContent = countdown;

        kioskInterval = setInterval(() => {
            countdown--;
            timerCountdown.textContent = countdown;

            if (countdown <= 0) {
                cycleToNextView();
                countdown = 30;
            }
        }, 1000);
    }

    function stopKioskMode() {
        isKioskMode = false;
        kioskButton.innerHTML = '<i class="fas fa-play"></i> Start Kiosk Mode';
        kioskButton.classList.remove('active');
        document.querySelector('.status-text').textContent = 'Manual Mode';
        kioskTimer.style.display = 'none';
        document.body.classList.remove('kiosk-mode');

        if (kioskInterval) {
            clearInterval(kioskInterval);
        }
    }

    function cycleToNextView() {
        // Cycle through different weather variables and times
        const variables = ['temperature', 'precipitation', 'wind', 'pressure', 'humidity', 'snow'];
        const times = ['current', '6h', '12h', '24h', '48h', '72h'];

        const variableSelect = document.getElementById('weather-variable');
        const timeSelect = document.getElementById('forecast-time');

        const currentVarIndex = variables.indexOf(variableSelect.value);
        const currentTimeIndex = times.indexOf(timeSelect.value);

        let nextVarIndex = (currentVarIndex + 1) % variables.length;
        let nextTimeIndex = currentTimeIndex;

        if (nextVarIndex === 0) {
            nextTimeIndex = (currentTimeIndex + 1) % times.length;
        }

        variableSelect.value = variables[nextVarIndex];
        timeSelect.value = times[nextTimeIndex];

        updateWeatherDisplay();
    }
}

function initializeTooltips() {
    // Same tooltip functionality as in air quality page
    const tooltipTriggers = document.querySelectorAll('[data-tooltip]');
    const tooltip = document.getElementById('tooltip');

    tooltipTriggers.forEach(trigger => {
        trigger.addEventListener('mouseenter', (e) => {
            const text = e.target.getAttribute('data-tooltip');
            tooltip.textContent = text;
            tooltip.classList.add('show');

            const rect = e.target.getBoundingClientRect();
            tooltip.style.left = rect.left + 'px';
            tooltip.style.top = (rect.top - tooltip.offsetHeight - 10) + 'px';
        });

        trigger.addEventListener('mouseleave', () => {
            tooltip.classList.remove('show');
        });
    });
}