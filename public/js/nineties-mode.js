// 90s Mode Toggle Functionality

document.addEventListener('DOMContentLoaded', function() {
    // Wait for sidebar to load, then initialize
    const initNinetiesMode = () => {
        const toggleBtn = document.getElementById('nineties-toggle');
        const toggleIndicator = toggleBtn?.querySelector('.toggle-indicator');
        
        if (!toggleBtn) {
            // Try again after a short delay if button not found
            setTimeout(initNinetiesMode, 100);
            return;
        }
    
    // Check for saved preference
    const savedMode = localStorage.getItem('nineties-mode');
    if (savedMode === 'true') {
        enableNinetiesMode();
    }
    
    // Toggle functionality
    toggleBtn.addEventListener('click', function() {
        const isActive = document.body.classList.contains('nineties-mode');
        
        if (isActive) {
            disableNinetiesMode();
        } else {
            enableNinetiesMode();
        }
    });
    
    function enableNinetiesMode() {
        document.body.classList.add('nineties-mode');
        toggleBtn.classList.add('active');
        toggleIndicator.textContent = 'ON';
        localStorage.setItem('nineties-mode', 'true');
        
        // Optional: Add sparkle effect
        createSparkleEffect();
    }
    
    function disableNinetiesMode() {
        document.body.classList.remove('nineties-mode');
        toggleBtn.classList.remove('active');
        toggleIndicator.textContent = 'OFF';
        localStorage.setItem('nineties-mode', 'false');
        
        // Remove sparkles
        removeSparkleEffect();
    }
    
    // Optional sparkle animation effect
    function createSparkleEffect() {
        const sparkleContainer = document.createElement('div');
        sparkleContainer.id = 'sparkle-container';
        sparkleContainer.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 1;
            overflow: hidden;
        `;
        document.body.appendChild(sparkleContainer);
        
        // Create multiple sparkles
        for (let i = 0; i < 12; i++) {
            setTimeout(() => createSparkle(sparkleContainer), i * 200);
        }
        
        // Continue creating sparkles periodically (slower)
        const sparkleInterval = setInterval(() => {
            if (document.body.classList.contains('nineties-mode')) {
                createSparkle(sparkleContainer);
            } else {
                clearInterval(sparkleInterval);
            }
        }, 9000);
    }
    
    function createSparkle(container) {
        const sparkle = document.createElement('div');
        sparkle.innerHTML = '✨';
        sparkle.style.cssText = `
            position: absolute;
            font-size: ${Math.random() * 20 + 10}px;
            left: ${Math.random() * 100}%;
            top: ${Math.random() * 100}%;
            animation: sparkle-float 12s ease-out forwards;
            pointer-events: none;
        `;
        
        // Add sparkle animation
        const style = document.createElement('style');
        if (!document.querySelector('#sparkle-animation')) {
            style.id = 'sparkle-animation';
            style.textContent = `
                @keyframes sparkle-float {
                    0% {
                        opacity: 0;
                        transform: translateY(0px) rotate(0deg) scale(0.5);
                    }
                    20% {
                        opacity: 1;
                        transform: translateY(-20px) rotate(90deg) scale(1);
                    }
                    80% {
                        opacity: 0.8;
                        transform: translateY(-40px) rotate(270deg) scale(0.8);
                    }
                    100% {
                        opacity: 0;
                        transform: translateY(-60px) rotate(360deg) scale(0);
                    }
                }
            `;
            document.head.appendChild(style);
        }
        
        container.appendChild(sparkle);
        
        // Remove sparkle after animation (3x longer)
        setTimeout(() => {
            if (sparkle.parentNode) {
                sparkle.parentNode.removeChild(sparkle);
            }
        }, 12000);
    }
    
        function removeSparkleEffect() {
            const sparkleContainer = document.getElementById('sparkle-container');
            if (sparkleContainer) {
                sparkleContainer.remove();
            }
        }
    };
    
    // Start trying to initialize
    initNinetiesMode();
});