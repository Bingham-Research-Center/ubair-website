document.addEventListener('DOMContentLoaded', function() {
    const mapElement = document.getElementById('road-map');
    if (!mapElement) {
        console.error('Road map element not found');
        return;
    }

    const roadMap = L.map('road-map', {
        zoomControl: true
    }).setView([40.3033, -109.7], 10);

    // Use a road-focused tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 15,
        attribution: '© OpenStreetMap contributors'
    }).addTo(roadMap);

    // Add major road overlays
    const majorRoads = [
        // US-40 corridor
        { name: 'US-40', coords: [[40.2999, -109.9890], [40.4555, -109.5287]], color: '#ff6b6b', weight: 4 },
        // US-191 north-south
        { name: 'US-191', coords: [[40.1632, -110.4026], [40.4555, -109.5287]], color: '#4ecdc4', weight: 4 },
        // SR-87
        { name: 'SR-87', coords: [[40.1632, -110.4026], [40.2999, -109.9890]], color: '#45b7d1', weight: 3 }
    ];

    majorRoads.forEach(road => {
        L.polyline(road.coords, {
            color: road.color,
            weight: road.weight,
            opacity: 0.8
        }).bindPopup(`<strong>${road.name}</strong><br>Road conditions loading...`).addTo(roadMap);
    });

    // Add road condition markers
    const roadPoints = [
        { name: 'US-40 @ Vernal', coords: [40.4555, -109.5287], condition: 'Good' },
        { name: 'US-40 @ Roosevelt', coords: [40.2999, -109.9890], condition: 'Fair' },
        { name: 'US-191 @ Duchesne', coords: [40.1632, -110.4026], condition: 'Good' }
    ];

    roadPoints.forEach(point => {
        const color = point.condition === 'Good' ? 'green' : point.condition === 'Fair' ? 'orange' : 'red';
        L.circleMarker(point.coords, {
            radius: 8,
            fillColor: color,
            color: 'white',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        }).bindPopup(`<strong>${point.name}</strong><br>Condition: ${point.condition}<br>Surface temp: --°F`)
            .addTo(roadMap);
    });

    // Initialize Emma Park Road Easter Egg
    initEmmaEasterEgg();
});

function initEmmaEasterEgg() {
    const toggle = document.getElementById('easter-egg-toggle');
    const content = document.getElementById('easter-egg-content');
    const icon = document.getElementById('toggle-icon');
    
    if (toggle && content && icon) {
        toggle.addEventListener('click', () => {
            const isActive = toggle.classList.contains('active');
            
            if (isActive) {
                // Close
                toggle.classList.remove('active');
                content.classList.remove('active');
            } else {
                // Open
                toggle.classList.add('active');
                content.classList.add('active');
            }
        });
        
        // Easter egg starts closed - user must click to open
    }
}