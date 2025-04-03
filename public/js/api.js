export async function fetchLiveObservations() {
        // Mock data for testing
        const mockData = {
            'Ozone': { 'Roosevelt': 45, 'Vernal': 55 },
            'PM2.5': { 'Roosevelt': 30, 'Vernal': 40 },
            'NOx': { 'Roosevelt': 80, 'Vernal': 90 },
            'NO': { 'Roosevelt': 70, 'Vernal': 85 },
            'Temperature': { 'Roosevelt': 25, 'Vernal': 28 }
        };

        // Simulate a delay to mimic a real API call
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Return the mock data
        return mockData;
    }