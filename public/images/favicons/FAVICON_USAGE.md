# Favicon Usage Guide

## Available Favicon Files

All files are located in `/public/images/favicons/`

### Static Favicons (.ico format)
Each .ico file contains multiple sizes (16x16, 32x32, 48x48, 64x64):
- `gemini_b.ico` - Pink/red "B" on dark blue background
- `gemini-wx.ico` - Yellow "WX" on orange background
- `gemini-b2.ico` - Dark blue "B" on teal/cyan background
- `gemini-wx2.ico` - Pink/purple "WX" on yellow background
- `gemini-combined.ico` - All characters "BWX" combined on teal background

### Animated Favicon
- `animated-favicon.gif` - Animated sequence looping through all designs
  - Frame timing: b(500ms) → wx(500ms) → b2(500ms) → wx2(500ms) → combined(1500ms)
  - Size: 64x64 pixels
  - Loops infinitely

## HTML Implementation Examples

### Using a Static .ico Favicon
```html
<link rel="icon" type="image/x-icon" href="/public/images/favicons/gemini-combined.ico">
```

### Using the Animated GIF Favicon
```html
<link rel="icon" type="image/gif" href="/public/images/favicons/animated-favicon.gif">
```

### Multiple Size Support (Recommended)
```html
<!-- Standard favicon -->
<link rel="icon" type="image/x-icon" href="/public/images/favicons/gemini-combined.ico">

<!-- Apple Touch Icon -->
<link rel="apple-touch-icon" sizes="180x180" href="/public/images/favicons/gemini-combined.png">

<!-- For different sizes -->
<link rel="icon" type="image/png" sizes="32x32" href="/public/images/favicons/gemini-combined.png">
<link rel="icon" type="image/png" sizes="16x16" href="/public/images/favicons/gemini-combined.png">
```

### Animated Favicon with Fallback
```html
<!-- Animated GIF (supported by most browsers) -->
<link rel="icon" type="image/gif" href="/public/images/favicons/animated-favicon.gif">

<!-- Fallback for browsers that don't support animated favicons -->
<link rel="icon" type="image/x-icon" href="/public/images/favicons/gemini-combined.ico">
```

## Quick Replace Examples

### Replace current favicon in index.html:
Change line 9 from:
```html
<link rel="icon" type="image/png" href="/public/images/BRS_01_UStateLeft_White.png">
```

To one of:
```html
<!-- Static combined icon -->
<link rel="icon" type="image/x-icon" href="/public/images/favicons/gemini-combined.ico">

<!-- OR animated icon -->
<link rel="icon" type="image/gif" href="/public/images/favicons/animated-favicon.gif">
```

### Replace current favicon in webcam-viewer.html:
Change line 9 from:
```html
<link rel="icon" type="image/x-icon" href="/public/images/favicon.ico">
```

To:
```html
<link rel="icon" type="image/gif" href="/public/images/favicons/animated-favicon.gif">
```

## Browser Compatibility

- **.ico files**: Supported by all browsers
- **.gif animated favicons**: Supported by Chrome, Firefox, Opera, Edge. Safari shows first frame only.
- **Recommended**: Use animated GIF for modern browsers, provide .ico fallback

## Notes
- All images are square (aspect ratio 1:1)
- The animated GIF dwells longer on the "combined" frame (1500ms vs 500ms)
- .ico files contain multiple resolutions for optimal display at different sizes
- Original PNG files are preserved in the same directory
