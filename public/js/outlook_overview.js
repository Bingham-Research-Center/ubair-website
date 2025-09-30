// public/js/outlook_overview.js
document.addEventListener("DOMContentLoaded", async function() {
    const outlookSummary = document.getElementById("outlook-summary");
    const seeMoreLink = document.getElementById("see-more");

    try {
        // Step 1: Fetch the list of outlooks from the JSON file
        const response = await fetch('/api/static/outlooks/outlooks_list.json');
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        const outlooks = await response.json();

        // Step 2: Get the most recent outlook (should be the first in the list)
        if (outlooks.length === 0) {
            outlookSummary.textContent = "No recent outlook available.";
            return;
        }

        const latestOutlook = outlooks[0]; // The list should be sorted newest first
        const latestFilename = latestOutlook.filename;

        // Step 3: Fetch the content of the latest outlook
        const outlookResponse = await fetch(`/api/static/outlooks/${latestFilename}`);
        if (!outlookResponse.ok) {
            throw new Error(`Failed to load outlook: ${outlookResponse.status}`);
        }

        const markdownContent = await outlookResponse.text();

        // Step 4: Extract the first few sections for preview (up to the first horizontal rule)
        let previewContent = markdownContent.split('\n___')[0]; // Get content before first horizontal rule

        // Limit to a reasonable amount of text (first 4-7 lines or a character limit)
        let previewLines = previewContent.split('\n').filter(line => line.trim() !== '');
        if (previewLines.length > 7) {
            previewLines = previewLines.slice(0, 7);
            previewContent = previewLines.join('<br>') + '...';
        } else {
            previewContent = previewLines.join('<br>');
        }

        // Step 5: Update the summary with the preview content
        outlookSummary.innerHTML = previewContent;

        // Step 6: Update the "See more" link to point to the full outlook
        seeMoreLink.href = `/forecast_outlooks?file=${latestFilename}`;
        seeMoreLink.style.display = 'block';

    } catch (error) {
        console.error("Error fetching the latest outlook:", error);
        outlookSummary.textContent = "Unable to load the latest outlook. Please check the Forecast Outlooks page.";
        seeMoreLink.href = "/forecast_outlooks";
    }
});