// public/js/index_outlook.js
document.addEventListener("DOMContentLoaded", async function() {
    const outlookSummary = document.getElementById("outlook-summary");
    const seeMoreLink = document.getElementById("see-more");
    const outlookDate = document.getElementById("outlook-date");

    if (!outlookSummary || !seeMoreLink) return;

    try {
        // Fetch the list of outlooks
        const response = await fetch('/api/static/outlooks/outlooks_list.json');
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

        const outlooks = await response.json();

        if (outlooks.length === 0) {
            outlookSummary.textContent = "No recent outlook available.";
            return;
        }

        // Get the latest outlook
        const latestOutlook = outlooks[0];

        // Update the date display
        if (outlookDate && latestOutlook.formattedDate) {
            outlookDate.textContent = `Issued: ${latestOutlook.formattedDate}`;
        }

        // Fetch its content
        const outlookResponse = await fetch(`/api/static/outlooks/${latestOutlook.filename}`);
        if (!outlookResponse.ok) throw new Error(`Failed to load outlook: ${outlookResponse.status}`);

        const markdownContent = await outlookResponse.text();

        // Format the preview content nicely
        const contentHtml = formatOutlookPreview(markdownContent);
        outlookSummary.innerHTML = contentHtml;

        // Update the "See more" link
        seeMoreLink.href = `/forecast_outlooks?file=${latestOutlook.filename}`;

    } catch (error) {
        console.error("Error loading outlook preview:", error);
        outlookSummary.innerHTML = "<p>Unable to load the latest outlook.</p>";
        seeMoreLink.href = "/forecast_outlooks";
    }

    /**
     * Format the markdown content into a nice preview
     * @param {string} markdown - The markdown content
     * @returns {string} HTML formatted preview
     */
    function formatOutlookPreview(markdown) {
        // Get first few relevant lines (skip empty lines)
        const lines = markdown.split('\n').filter(line => line.trim() !== '');

        // Extract and format the main sections for preview
        let html = '';
        let riskLevel = null;

        // Look for title and risk indicators in the first 10 lines
        for (let i = 0; i < Math.min(10, lines.length); i++) {
            const line = lines[i];

            // Format main title (if not already included)
            if (line.startsWith('# ') && !html.includes('<h3>')) {
                html += `<h3>${line.substring(2)}</h3>`;
                continue;
            }

            // Look for risk indicators
            if (line.includes('LOW RISK') || line.includes('MODERATE RISK') || line.includes('HIGH RISK')) {
                if (line.includes('LOW RISK')) {
                    riskLevel = 'low';
                } else if (line.includes('MODERATE RISK')) {
                    riskLevel = 'moderate';
                } else if (line.includes('HIGH RISK')) {
                    riskLevel = 'high';
                }

                // Add the risk indicator
                if (riskLevel) {
                    html += `<p><span class="risk-indicator risk-${riskLevel}">${riskLevel.toUpperCase()} RISK</span> ${line.split('RISK')[1]}</p>`;
                    continue;
                }
            }

            // Add other relevant content (skip special markdown elements)
            if (!line.startsWith('#') && !line.startsWith('---') && !line.startsWith('_')) {
                html += `<p>${line}</p>`;
            }

            // Limit preview length
            if (html.split('<p>').length > 4) {
                break;
            }
        }

        return html;
    }
});