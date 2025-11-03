// Headlines Dashboard Tab Switching and Town Selection
document.addEventListener('DOMContentLoaded', function() {
    // Town data with coordinates and context
    const TOWN_DATA = {
        roosevelt: {
            name: 'Roosevelt',
            lat: 40.28,
            lng: -110.05,
            region: 'Central Basin',
            description: 'Center of the Uintah Basin with key air quality monitoring',
            nearbyStations: ['UBRVT', 'K74V']
        },
        vernal: {
            name: 'Vernal',
            lat: 40.44,
            lng: -109.51,
            region: 'Northern Basin',
            description: 'Largest city in the basin, airport weather station',
            nearbyStations: ['UCC33', 'KVEL', 'CEN']
        },
        duchesne: {
            name: 'Duchesne',
            lat: 40.17,
            lng: -110.40,
            region: 'Western Basin',
            description: 'Western edge of the basin, agricultural focus',
            nearbyStations: ['COOPDSNU1']
        },
        ouray: {
            name: 'Ouray',
            lat: 40.05485,
            lng: -109.68737,
            region: 'Southern Basin',
            description: 'Southern basin monitoring, tribal lands',
            nearbyStations: ['UBORY', 'CHPU1']
        },
        dinosaur: {
            name: 'Dinosaur',
            lat: 40.44,
            lng: -109.31,
            region: 'Northern Basin',
            description: 'Near Dinosaur National Monument, northern perimeter',
            nearbyStations: ['COOPDINU1']
        },
        bonanza: {
            name: 'Bonanza',
            lat: 40.01,
            lng: -109.17,
            region: 'Eastern Basin',
            description: 'Eastern basin area, remote monitoring location',
            nearbyStations: []
        }
    };

    let currentTown = 'roosevelt';

    // Tab switching functionality
    const tabButtons = document.querySelectorAll('.dashboard-tabs .tab-button');
    const tabPanels = document.querySelectorAll('.tab-panel');

    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const targetTab = this.getAttribute('data-tab');

            // Remove active class from all buttons and panels
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanels.forEach(panel => panel.classList.remove('active'));

            // Add active class to clicked button
            this.classList.add('active');

            // Show corresponding panel
            const targetPanel = document.getElementById(`${targetTab}-content`);
            if (targetPanel) {
                targetPanel.classList.add('active');
            }
        });
    });

    // Town selection functionality
    const townSelector = document.getElementById('town-select');
    if (townSelector) {
        townSelector.addEventListener('change', function() {
            currentTown = this.value;
            updateDashboardForTown(currentTown);
        });
    }

    // Function to update dashboard data based on selected town
    function updateDashboardForTown(townKey) {
        const town = TOWN_DATA[townKey];
        console.log(`Switched to ${town.name}:`, town);

        // Update AI summary with town-specific context
        const aiSummary = document.querySelector('.ai-summary-text');
        if (aiSummary) {
            aiSummary.innerHTML = `
                <i class="fas fa-robot"></i>
                Viewing conditions for <strong>${town.name}</strong> (${town.region}).
                ${town.description}. Weather data aggregated from nearby monitoring stations.
                Real-time updates coming soon.
            `;
        }

        // TODO: In the future, this will:
        // 1. Fetch live observation data from stations near this town
        // 2. Request LLM summaries specific to this location
        // 3. Update all headline items with town-specific data
        // 4. Query forecasts for this geographic area

        // Store selection in localStorage for persistence
        localStorage.setItem('selectedTown', townKey);
    }

    // Load saved town selection on page load
    const savedTown = localStorage.getItem('selectedTown');
    if (savedTown && TOWN_DATA[savedTown]) {
        currentTown = savedTown;
        townSelector.value = savedTown;
        updateDashboardForTown(savedTown);
    }

    // Export town data for use by other scripts
    window.HeadlinesDashboard = {
        getCurrentTown: () => currentTown,
        getTownData: (townKey) => TOWN_DATA[townKey],
        getAllTowns: () => TOWN_DATA
    };
});
