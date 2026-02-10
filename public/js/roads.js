/**
 * Road Weather Page - Main Entry Point
 *
 * This file has been refactored into modular components for better maintainability.
 * All functionality has been extracted into the following modules:
 *
 * Core Modules:
 * - UnitsSystem.js       - Imperial/Metric unit conversion system
 * - DataCache.js         - Route data caching with 5-minute TTL
 * - utils.js             - Utility functions for distance, conditions, status
 *
 * Component Modules:
 * - RoadWeatherMap.js    - Main map class with weather stations, cameras, events
 * - TrafficEventsManager.js - Traffic events and UDOT alerts management
 * - RouteConditions.js   - US-40, US-191, and Basin Roads displays
 * - ConditionCards.js    - Weather condition cards overlay
 *
 * Initialization:
 * - initialization.js    - Page initialization and units toggle coordination
 *
 * All modules are loaded in roads.html and kiosk.html in dependency order.
 *
 * Legacy backup available at: roads.legacy.js
 */
