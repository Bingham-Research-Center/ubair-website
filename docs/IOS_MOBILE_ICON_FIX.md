# iOS & Mobile Icon Fix

## Problem
When users added BasinWx to their iOS home screen, they saw an ugly default "T" icon instead of the proper BasinWx branding.

## Solution
Added comprehensive favicon and mobile icon support for all platforms:

### Icons Created
- `apple-touch-icon.png` (180x180) - iOS home screen icon
- `android-chrome-192x192.png` - Android/Chrome PWA icon
- `android-chrome-512x512.png` - Android/Chrome high-res PWA icon
- `favicon-32x32.png` - Standard browser favicon
- `favicon-16x16.png` - Small browser favicon

All icons are based on the existing `gemini-combined.png` design.

### Files Added
- `/public/site.webmanifest` - Web app manifest for PWA support
- `/public/browserconfig.xml` - Microsoft tile configuration
- Icon files in `/public/images/favicons/`

### HTML Updates
All 15 HTML files in `/views/` now include:

1. **Favicons** - Multiple sizes for browser tabs
2. **Apple Touch Icons** - iOS home screen icons
3. **Web App Manifest** - PWA configuration
4. **iOS Meta Tags**:
   - `apple-mobile-web-app-capable` - Enables fullscreen mode
   - `apple-mobile-web-app-status-bar-style` - Black translucent status bar
   - `apple-mobile-web-app-title` - "BasinWx" app name
5. **Android/Chrome Meta Tags**:
   - `theme-color` - Dark theme (#1a1a2e)
   - `mobile-web-app-capable` - PWA support

## Testing
To test on iOS:
1. Open Safari on iPhone
2. Navigate to basinwx.com
3. Tap Share button
4. Select "Add to Home Screen"
5. Verify the BasinWx icon appears correctly

To test on Android:
1. Open Chrome
2. Navigate to basinwx.com
3. Tap menu (3 dots)
4. Select "Add to Home screen"
5. Verify the BasinWx icon appears correctly

## Browser Support
- **iOS Safari**: Full support (touch icons, web app mode)
- **Android Chrome**: Full support (PWA, touch icons)
- **Desktop browsers**: Standard favicon support
- **Microsoft Edge**: Windows tile support

## Technical Details
- Source icon: 1024x1024 `gemini-combined.png`
- Resized using ImageMagick
- All icons use PNG format (except .ico files)
- Web manifest enables "Add to Home Screen" prompt
- App runs in standalone mode when launched from home screen
