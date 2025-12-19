<!-- NOTE: This documentation is scheduled for migration to brc-sop Wiki/Filebase. See: https://github.com/Bingham-Research-Center/brc-sop/issues/1 -->

# Portrait Kiosk Webpage - Viability & Implementation Plan

**Target**: Create portrait-oriented webpage for BEERC ViewSonic EP5540T kiosk (55" 4K touch display)

## What We Can Be SURE About

### ✅ Confirmed Working (from Joseph's email)
1. **vSignage is installed and tested** - Joseph has it running
2. **Website widget works** - He successfully loaded www.basinwx.com in vSignage
3. **Integration is possible** - Websites CAN be embedded in vSignage presentations
4. **You already have a kiosk page** - `/kiosk` exists at `basinwx.com/kiosk` (views/kiosk.html)

### ✅ Safe Technical Approach

Create a NEW route `/portrait-kiosk` (or `/kiosk-portrait`) that:
- Uses 9:16 portrait aspect ratio (CSS: `width: 56.25vh; height: 100vh`)
- Targets 2160×3840 resolution (but scales gracefully)
- Simplifies the existing 4-slide landscape dashboard to portrait layout
- Uses same data sources/APIs as current `/kiosk` page
- Minimal JS, high contrast, thick fonts (per your design notes in BEERC-KIOSK.md)

### ✅ Deployment Path

1. You build the portrait page in `ubair-website`
2. Test it locally in portrait orientation (rotate browser or use DevTools device emulation)
3. Deploy to basinwx.com
4. Give Joseph the URL: `https://www.basinwx.com/portrait-kiosk`
5. He adds it as a website widget in vSignage
6. He schedules it in Campaign Manager (can alternate with Molly's PowerPoint slides)

### ⚠️ What's UNKNOWN (won't block initial testing)

- Whether touch interactions work through vSignage widget (likely not needed for display-only)
- Current kiosk state: Is it already running vSignage, or still using mini-PC with PowerPoint? (doesn't matter - Joseph can test either way)
- Auto-refresh behavior within vSignage (may need 10-min page reload script)

## 🎯 Recommendation

Start with a **simplified single-screen portrait view** showing live AQI map + current conditions. This maximizes readability at distance and avoids carousel complexity. Can expand to multi-slide later if needed.

## Technical Specs from BEERC-KIOSK.md

### Display Identity
- Model: ViewSonic EP5540T
- Screen: 55" 4K UHD, 10-point touch
- Aspect: 9:16 portrait

### Design Targets
- **Authoring sizes**: 2160×3840 (primary), ensure clean downscale to 1080×1920
- **No scroll**: one-screen message
- **Typography**: big type, 1–3 short supporting lines, strong CTA
- **Safe margins**: ≥5% inset all sides (crop/overscan/bezel + glare)
- **Contrast**: high; thicker fonts; avoid low-contrast greys and fine lines
- **Lightweight**: single HTML/CSS; minimal JS; sensible offline/last-known fallback if data-driven
- **Dual-use**: exportable static PNG/SVG at same 9:16 for PowerPoint reuse

## Existing Assets to Leverage

### Current /kiosk Page (landscape, 4 slides)
1. Live Air Quality Map (Leaflet map with AQI data)
2. Road Weather Conditions
3. Basin-Wide Environmental KPIs
4. Historical Data Analysis

### Available Resources
- `views/kiosk.html` - full-featured landscape kiosk dashboard
- `public/css/kiosk.css` - responsive styling for landscape
- `public/js/kiosk.js` - carousel, data fetching, auto-refresh
- Server route: `app.get('/kiosk', ...)` in server/server.js

## Next Steps

1. Create `views/kiosk-portrait.html` - simplified single-screen layout
2. Create `public/css/kiosk-portrait.css` - 9:16 portrait optimized styles
3. Add server route: `app.get('/portrait-kiosk', ...)`
4. Test locally with DevTools device emulation (2160×3840 or 1080×1920)
5. Deploy and provide URL to Joseph for vSignage testing

## Content Recommendation for V1

**Single portrait screen showing:**
- Header: "Uintah Basin Air Quality" (large, high-contrast)
- Live AQI Map (centered, ~70% of screen height)
- Current conditions bar (bottom ~20%):
  - Peak Basin AQI with color-coded status
  - Basin avg temperature
  - Active stations count
  - Last updated timestamp
- Footer: USU Bingham Research Center branding

**Auto-refresh**: Every 10 minutes (matching current kiosk behavior)
