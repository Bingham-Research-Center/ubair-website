// outlook_overview.js
document.addEventListener("DOMContentLoaded", async function() {
    const outlookSummary = document.getElementById("outlook-summary");

    try {
        // Step 1: Fetch the list of files in the outlooks directory
        // TODO - json file list via cron job
        const response = await fetch('/public/data/outlooks/file_list.json');
        const files = await response.json();

        // Step 2: Sort files by date in descending order to get the most recent file
        files.sort((a, b) => b.localeCompare(a));

        // Step 3: Fetch the content of the latest file
        const latestFile = files.find(file => file.endsWith(".md"));
        if (latestFile) {
            const fileResponse = await fetch(`/public/data/outlooks/${latestFile}`);
            const data = await fileResponse.text();

            // Display only the first few lines of the latest outlook
            outlookSummary.innerHTML = data.split('\n').slice(0, 4).join('<br>');
        } else {
            outlookSummary.textContent = "No recent outlook available.";
        }
    } catch (error) {
        console.error("Error fetching the latest outlook:", error);
        outlookSummary.textContent = "Failed to load outlook.";
    }
});
