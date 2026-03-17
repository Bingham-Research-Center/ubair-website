/**
 * Shared outlook risk/confidence highlighting.
 * Loaded by index.html and forecast_outlooks.html before their own scripts.
 */
window.highlightRiskWords = function(html) {
    return html
        // Risk level pills (order matters: specific phrases before standalone words)
        .replace(/\bNO RISK\b/gi, '<span class="risk-indicator risk-no">NO RISK</span>')
        .replace(/\bLOW RISK\b/gi, '<span class="risk-indicator risk-low">LOW RISK</span>')
        .replace(/\bSOME RISK\b/gi, '<span class="risk-indicator risk-some">SOME RISK</span>')
        .replace(/\b(MODERATE|MEDIUM) RISK\b/gi, '<span class="risk-indicator risk-moderate">MODERATE RISK</span>')
        .replace(/\bHIGH RISK\b/gi, '<span class="risk-indicator risk-high">HIGH RISK</span>')

        // Standalone risk levels after colon (e.g., "ELEVATED OZONE: **NO**")
        .replace(/(?<=[:]\s*)<strong>(NO|NONE)<\/strong>/gi, '<span class="risk-indicator risk-no">$1</span>')
        .replace(/(?<=[:]\s*)<strong>LOW<\/strong>/gi, '<span class="risk-indicator risk-low">LOW</span>')
        .replace(/(?<=[:]\s*)<strong>(MODERATE|MEDIUM)<\/strong>/gi, '<span class="risk-indicator risk-moderate">$1</span>')
        .replace(/(?<=[:]\s*)<strong>HIGH<\/strong>/gi, '<span class="risk-indicator risk-high">HIGH</span>')

        // Standalone bold risk words without colon prefix
        .replace(/<strong>(NO|NONE)<\/strong>(?!\s*RISK)/gi, '<span class="risk-indicator risk-no">$1</span>')
        .replace(/<strong>LOW<\/strong>(?!\s*RISK)/gi, '<span class="risk-indicator risk-low">LOW</span>')
        .replace(/<strong>(MODERATE|MEDIUM)<\/strong>(?!\s*RISK)/gi, '<span class="risk-indicator risk-moderate">$1</span>')
        .replace(/<strong>HIGH<\/strong>(?!\s*RISK)/gi, '<span class="risk-indicator risk-high">HIGH</span>')

        // Confidence indicators (semantic: HIGH=good/green, LOW=bad/red)
        .replace(/\b(HIGH|MODERATE|MEDIUM|LOW) CONFIDENCE\b/gi, (match, level) => {
            const colors = {
                'HIGH': '#22c55e',
                'MODERATE': '#f59e0b',
                'MEDIUM': '#f59e0b',
                'LOW': '#dc2626'
            };
            return `<span style="color: ${colors[level.toUpperCase()]}; font-weight: 700;">${match.toUpperCase()}</span>`;
        });
};
