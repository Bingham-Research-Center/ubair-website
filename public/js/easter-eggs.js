/**
 * Easter Eggs Manager
 *
 * Handles all easter eggs for the Uintah Basin Air Quality website.
 * Easter eggs are activated via Konami code: ↑↑↓↓←→←→BA
 *
 * These easter eggs were originally created for testing functionality with
 * lighthearted content. They're now available as hidden features for fun
 * and can be updated with educational or community engagement content.
 */

class EasterEggManager {
    constructor() {
        this.active = false;
        this.konamiSequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
        this.userSequence = [];
        this.easterEggs = [];

        this.initKonamiListener();
    }

    /**
     * Initialize Konami code listener
     */
    initKonamiListener() {
        document.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase() === 'b' || e.key.toLowerCase() === 'a' ? e.key.toLowerCase() : e.key;
            this.userSequence.push(key);

            // Keep only last 10 keypresses
            if (this.userSequence.length > 10) {
                this.userSequence.shift();
            }

            // Check if sequence matches
            if (this.checkSequence()) {
                this.toggleEasterEggs();
            }
        });
    }

    /**
     * Check if user sequence matches Konami code
     */
    checkSequence() {
        return this.konamiSequence.every((key, index) => key === this.userSequence[index]);
    }

    /**
     * Toggle easter eggs on/off
     */
    toggleEasterEggs() {
        this.active = !this.active;

        if (this.active) {
            this.activateEasterEggs();
            this.showActivationMessage();
        } else {
            this.deactivateEasterEggs();
        }

        // Reset sequence
        this.userSequence = [];
    }

    /**
     * Show activation message
     */
    showActivationMessage() {
        const message = document.createElement('div');
        message.className = 'easter-egg-activation-message';
        message.textContent = '🎉 Easter Eggs Activated! 🎉';
        document.body.appendChild(message);

        setTimeout(() => {
            message.classList.add('fade-out');
            setTimeout(() => message.remove(), 500);
        }, 2000);
    }

    /**
     * Activate all easter eggs for current page
     */
    activateEasterEggs() {
        const path = window.location.pathname;

        if (path === '/' || path === '/index.html') {
            this.activateDutchJohnEasterEgg();
        } else if (path.includes('roads')) {
            this.activateEmmaParkEasterEgg();
        } else if (path.includes('forecast_air_quality')) {
            this.activateWelshModeEasterEgg();
        } else if (path.includes('forecast_weather')) {
            this.activateChemtrailsEasterEgg();
        }
    }

    /**
     * Deactivate all easter eggs
     */
    deactivateEasterEggs() {
        // Remove all easter egg elements
        document.querySelectorAll('.easter-egg-box, .easter-egg-btn').forEach(el => el.remove());

        // Restore Welsh mode if active
        if (this.welshModeActive) {
            this.switchToEnglish();
        }
    }

    /**
     * Dutch John Rick Roll Easter Egg (Homepage)
     */
    activateDutchJohnEasterEgg() {
        const easterEggHTML = `
            <div class="easter-egg-box dutch-john-egg" id="dutchJohnEgg">
                <button class="easter-egg-toggle" id="dutchJohnToggle">
                    <span class="toggle-icon">▼</span>
                    <span class="toggle-text">Easter Egg</span>
                </button>
                <div class="easter-egg-content" id="dutchJohnContent">
                    <div class="easter-egg-text">
                        Experimental: hide all mention of Dutch John
                    </div>
                    <button class="easter-egg-action-btn dutch-john-filter-btn" id="dutchJohnFilterBtn">
                        Enable Filter
                    </button>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', easterEggHTML);

        // Add event listeners
        const toggle = document.getElementById('dutchJohnToggle');
        const content = document.getElementById('dutchJohnContent');
        const filterBtn = document.getElementById('dutchJohnFilterBtn');

        toggle.addEventListener('click', () => {
            content.classList.toggle('hidden');
            const icon = toggle.querySelector('.toggle-icon');
            icon.textContent = content.classList.contains('hidden') ? '▶' : '▼';
        });

        filterBtn.addEventListener('click', () => {
            window.open('https://www.youtube.com/watch?v=dQw4w9WgXcQ', '_blank', 'noopener,noreferrer');
        });
    }

    /**
     * Emma Park Road Easter Egg (Roads Page)
     */
    activateEmmaParkEasterEgg() {
        const easterEggHTML = `
            <div class="easter-egg-box emma-park-egg" id="emmaParkEgg">
                <button class="easter-egg-toggle" id="emmaParkToggle">
                    <span class="toggle-icon">▼</span>
                    <span class="toggle-text">What about Emma Park Road?</span>
                </button>
                <div class="easter-egg-content" id="emmaParkContent">
                    <div class="easter-egg-text">
                        Answers to the Basin's most burning question at:
                        <a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ" target="_blank" rel="noopener noreferrer" class="emma-link">
                            www.IsEmmaParkRoadClosed.utah
                        </a>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', easterEggHTML);

        // Add event listener
        const toggle = document.getElementById('emmaParkToggle');
        const content = document.getElementById('emmaParkContent');

        toggle.addEventListener('click', () => {
            content.classList.toggle('hidden');
            const icon = toggle.querySelector('.toggle-icon');
            icon.textContent = content.classList.contains('hidden') ? '▶' : '▼';
        });
    }

    /**
     * Welsh Mode Easter Egg (Forecast Air Quality Page)
     */
    activateWelshModeEasterEgg() {
        this.welshModeActive = false;
        this.welshTranslations = {
            // Navigation
            'Live Air Quality Map': 'Map Ansawdd Aer Byw',
            'Ozone Alert': 'Rhybudd Osôn',
            'CLYFAR': 'CLYFAR',
            'Weather Forecasts': 'Rhagolygon Tywydd',
            'Agriculture': 'Amaethyddiaeth',
            'Road Weather': 'Tywydd Ffyrdd',
            'Aviation': 'Awyrennau',
            'On The Water': 'Ar y Dŵr',
            'Fire Weather': 'Tywydd Tân',
            'About & FAQ': 'Ynghylch a CCA',
            'About Clyfar': 'Ynghylch Clyfar',
            'FAQ': 'CCA',
            'Webcams': 'Camerâu Gwe',
            'Our Website Team': 'Ein Tîm Gwefan',
            'Contact BRC': 'Cysylltu BRC',

            // Homepage
            'basinwx.com': 'basinwx.com',
            'Live air quality and weather for the Uintah Basin': 'Ansawdd aer byw a thywydd ar gyfer Basin Uintah',
            'Air Quality and Weather Overview': 'Trosolwg Ansawdd Aer a Tywydd',
            'Live Monitoring Stations': 'Gorsafoedd Monitro Byw',
            'Latest Forecasts': 'Rhagolygon Diweddaraf',

            // General
            'Air Quality': 'Ansawdd Aer',
            'Weather': 'Tywydd',
            'Good': 'Da',
            'Warning': 'Rhybudd',
            'Danger': 'Perygl',
            'Weather Only': 'Tywydd Yn Unig',
            'No Data': 'Dim Data',
            'No Snow': 'Dim Eira',
            'Snow Likely': 'Eira yn Debygol',

            // Forecast Air Quality Page
            'Experimental LLM Summaries': 'Crynodebau LLM Arbrofol',
            'Plain': 'Plaen',
            'Extended': 'Estynedig',
            'Detailed': 'Manwl',
            'Clyfar AI Forecasting': 'Rhagweld AI Clyfar',
            "Today's Forecast": 'Rhagolwg Heddiw',
            'Tomorrow': 'Yfory',
            '7-Day Trend': 'Tuedd 7 Diwrnod',
            'Moderate': 'Cymedrol',
            'Elevated': 'Uwch',
            'Increasing': 'Cynyddol',
            'High Confidence': 'Hyder Uchel',
            'Medium Confidence': 'Hyder Canolig',
            'Variable Confidence': 'Hyder Amrywiol',
            '15-Day Ozone Probability Forecast': 'Rhagolwg Tebygolrwydd Osôn 15 Diwrnod',
            'Interactive heatmap will be displayed here': 'Bydd map gwres rhyngweithiol yn cael ei arddangos yma',
            'Ozone Levels': 'Lefelau Osôn',
            'Background (&lt;50 ppb)': 'Cefndir (&lt;50 ppb)',
            'Moderate (50-70 ppb)': 'Cymedrol (50-70 ppb)',
            'Elevated (70-100 ppb)': 'Uwch (70-100 ppb)',
            'Extreme (&gt;100 ppb)': 'Eithafol (&gt;100 ppb)',
            'Forecast Scenarios': 'Senarios Rhagolwg',
            'Best Case': 'Achos Gorau',
            'Average': 'Cyfartaledd',
            'Worst Case': 'Achos Gwaethaf',
            'Interactive time series chart will be displayed here': 'Bydd siart cyfres amser rhyngweithiol yn cael ei arddangos yma',
            'Model Performance': 'Perfformiad Model',
            'Accuracy': 'Cywirdeb',
            '87%': '87%',
            'Last 30 days': '30 diwrnod diwethaf',
            'Lead Time': 'Amser Arwain',
            '5 days': '5 diwrnod',
            'Reliable forecast': 'Rhagolwg dibynadwy',
            'Skill Score': 'Sgôr Sgil',
            '0.73': '0.73',
            'vs. climatology': 'yn erbyn hinsoddeg',
            'Loading plain summary...': 'Yn llwytho crynodeb plaen...',
            'Loading extended summary...': 'Yn llwytho crynodeb estynedig...',
            'Loading detailed summary...': 'Yn llwytho crynodeb manwl...'
        };
        this.originalTexts = new Map();

        const easterEggHTML = `
            <button class="easter-egg-btn welsh-mode-btn" id="welshModeBtn" title="Toggle Welsh Mode">
                🐉 <span>Welsh Mode</span>
            </button>
        `;

        document.body.insertAdjacentHTML('beforeend', easterEggHTML);

        const btn = document.getElementById('welshModeBtn');
        btn.addEventListener('click', () => {
            this.welshModeActive = !this.welshModeActive;

            // Flash effect
            document.body.style.filter = 'brightness(0.3)';
            setTimeout(() => {
                document.body.style.filter = 'brightness(1.2)';
                setTimeout(() => {
                    document.body.style.filter = 'brightness(1.0)';
                }, 100);
            }, 100);

            if (this.welshModeActive) {
                this.switchToWelsh();
                btn.querySelector('span').textContent = 'English Mode';
            } else {
                this.switchToEnglish();
                btn.querySelector('span').textContent = 'Welsh Mode';
            }
        });
    }

    /**
     * Switch page to Welsh
     */
    switchToWelsh() {
        this.originalTexts.clear();

        // Find and translate all text elements
        const textElements = document.querySelectorAll('*');

        textElements.forEach(element => {
            // Skip script, style, and easter egg elements
            if (element.tagName === 'SCRIPT' ||
                element.tagName === 'STYLE' ||
                element.closest('.easter-egg-btn')) {
                return;
            }

            // Check direct text content (element with single text node child)
            if (element.childNodes.length === 1 && element.childNodes[0].nodeType === Node.TEXT_NODE) {
                const originalText = element.textContent.trim();
                const welshText = this.welshTranslations[originalText];

                if (welshText) {
                    this.originalTexts.set(element, originalText);
                    element.textContent = welshText;
                }
            }

            // Check for specific navigation and UI elements
            if (element.tagName === 'A' || element.tagName === 'SPAN' ||
                element.tagName === 'H1' || element.tagName === 'H2' || element.tagName === 'H3') {
                const text = element.textContent.trim();
                const welshText = this.welshTranslations[text];

                if (welshText && !this.originalTexts.has(element)) {
                    this.originalTexts.set(element, text);
                    element.textContent = welshText;
                }
            }
        });
    }

    /**
     * Switch page back to English
     */
    switchToEnglish() {
        // Restore all original texts
        this.originalTexts.forEach((originalText, element) => {
            element.textContent = originalText;
        });
        this.originalTexts.clear();
    }

    /**
     * Chemtrails Easter Egg (Weather Forecast Page)
     */
    activateChemtrailsEasterEgg() {
        const easterEggHTML = `
            <button class="easter-egg-btn chemtrails-btn" id="chemtrailsBtn">
                <span class="warning-icon">⚠️</span>
                <span>Chemtrails ON</span>
            </button>
        `;

        document.body.insertAdjacentHTML('beforeend', easterEggHTML);

        const btn = document.getElementById('chemtrailsBtn');
        btn.addEventListener('click', () => {
            window.open('https://www.youtube.com/watch?v=dQw4w9WgXcQ', '_blank', 'noopener,noreferrer');
        });
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    window.easterEggManager = new EasterEggManager();
});
