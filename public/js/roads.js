document.addEventListener('DOMContentLoaded', function() {
    const mapElement = document.getElementById('road-map');
    if (!mapElement) {
        console.error('Road map element not found');
        return;
    }

    const roadMap = L.map('road-map', {
        zoomControl: true
    }).setView([40.3033, -110.0153], 10);

    // Road-focused tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 15,
        attribution: '© OpenStreetMap contributors'
    }).addTo(roadMap);

    // Add road markers for major routes
    const roadPoints = [
        { name: 'US-40 @ Vernal', coords: [40.4555, -109.5287] },
        { name: 'US-40 @ Roosevelt', coords: [40.2999, -109.9890] },
        { name: 'US-191 @ Duchesne', coords: [40.1632, -110.4026] }
    ];

    roadPoints.forEach(point => {
        L.marker(point.coords)
            .bindPopup(`<strong>${point.name}</strong><br>Road conditions loading...`)
            .addTo(roadMap);
    });
});