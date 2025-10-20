# Visual Design Quick Reference Card

## 🎨 Color System

### Primary Palette
```css
--primary-blue:        #1e40af  /* Buttons, headers */
--primary-blue-light:  #3b82f6  /* Gradients, hover */
--accent-orange:       #f97316  /* Construction, alerts */
--accent-orange-light: #fb923c  /* Gradient highlights */
```

### Status Colors
```css
--success-green:  #10b981  /* Level 1: Clear roads */
--warning-yellow: #fbbf24  /* Level 2: Wet roads */
--danger-red:     #ef4444  /* Level 4-5: Closures */
```

---

## 📐 Spacing Scale

```css
/* Consistent spacing system */
4px   = 0.25rem  /* Tight spacing */
8px   = 0.5rem   /* Small gaps */
12px  = 0.75rem  /* Default gaps */
16px  = 1rem     /* Card padding */
20px  = 1.25rem  /* Panel padding */
24px  = 1.5rem   /* Section spacing */
32px  = 2rem     /* Large sections */
```

---

## 🎭 Shadow System

```css
/* 5-level shadow hierarchy */
--shadow-sm:  0 1px 2px rgba(0,0,0,0.05)      /* Subtle */
--shadow-md:  0 4px 6px rgba(0,0,0,0.1)       /* Default */
--shadow-lg:  0 10px 15px rgba(0,0,0,0.1)     /* Cards */
--shadow-xl:  0 20px 25px rgba(0,0,0,0.1)     /* Panels */
--shadow-2xl: 0 25px 50px rgba(0,0,0,0.25)    /* Hover */
```

---

## 🔤 Typography Scale

```css
/* Font: Inter (modern, legible) */

0.85rem (13.6px)  /* Small text */
0.95rem (15.2px)  /* Body text */
1.1rem  (17.6px)  /* Panel headers */
1.2rem  (19.2px)  /* Card headers */
1.5rem  (24px)    /* FCAB title */
1.6rem  (25.6px)  /* Section headers */
2rem    (32px)    /* Countdown timer */

/* Weights: 400, 500, 600, 700, 800 */
```

---

## 🎬 Animation Timing

```css
/* Consistent transitions */
--transition-fast: 150ms  /* Hover effects */
--transition-base: 300ms  /* Default */
--transition-slow: 500ms  /* Entrances */

/* Easing: cubic-bezier(0.4, 0, 0.2, 1) */
```

---

## 🪟 Border Radius

```css
/* Rounded corners system */
4px   /* Small elements */
10px  /* Inputs, badges */
12px  /* Cards, buttons */
16px  /* Panels, sections */
20px  /* Large containers */
30px  /* Pill buttons */
50px  /* Full pills (toolbar) */
```

---

## ✨ Glassmorphism Recipe

```css
/* Modern blur effect */
background: rgba(255, 255, 255, 0.9);
backdrop-filter: blur(20px);
-webkit-backdrop-filter: blur(20px);
border: 1px solid rgba(255, 255, 255, 0.18);
box-shadow: 0 8px 32px rgba(31, 38, 135, 0.15);
```

**Used on:** Panels, toolbar, countdown badge

---

## 🎨 Gradient Formulas

```css
/* All use 135° diagonal */

/* Blue (headers, buttons) */
linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)

/* Orange (construction, route planner) */
linear-gradient(135deg, #f97316 0%, #fb923c 100%)

/* Sky Blue (weather panel) */
linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)

/* Yellow (alerts) */
linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)
```

---

## 🎯 Component Classes

### Panels
```css
.info-panel          /* Base glassmorphism panel */
.layer-controls      /* Map layer toggles */
#weather-panel       /* Weather information */
#route-planner-panel /* Route planning */
```

### Buttons
```css
.toolbar-btn         /* Floating toolbar buttons */
#calculate-route-btn /* Route action button */
#close-weather-panel /* Panel close button */
```

### Cards
```css
.detail-card         /* Construction info cards */
.contact-card        /* Contact information */
.azure-event-popup   /* Map popup content */
```

---

## 🎨 Hover Effects Quick Copy

### Layer Control Items
```css
transform: translateX(4px);
border-color: #3b82f6;
background: #f9fafb;
```

### Toolbar Buttons
```css
transform: translateY(-2px);
box-shadow: 0 10px 15px rgba(0,0,0,0.1);
```

### Detail Cards
```css
transform: translateY(-8px);
box-shadow: 0 20px 25px rgba(0,0,0,0.1);
```

### Contact Cards
```css
transform: translateY(-6px) scale(1.02);
border-color: #1e40af;
```

---

## 📱 Responsive Breakpoints

```css
/* Desktop first approach */

@media (max-width: 1024px) {
  /* Tablet adjustments */
  /* Reduce panel widths */
}

@media (max-width: 768px) {
  /* Mobile layout */
  /* Stack panels, full width */
}

@media (max-width: 480px) {
  /* Small mobile */
  /* Larger touch targets */
}
```

---

## ♿ Accessibility Standards

### Focus States
```css
:focus-visible {
  outline: 3px solid #1e40af;
  outline-offset: 2px;
}
```

### Color Contrast
- **AAA (7:1):** All body text
- **AA (4.5:1):** All UI elements
- **Tested:** Against all backgrounds

### Touch Targets
- **Minimum:** 44px × 44px
- **Optimal:** 48px × 48px

---

## 🚀 Performance Tips

### Hardware Acceleration
```css
will-change: transform, box-shadow;
```
Apply to frequently animated elements

### Efficient Transforms
```css
/* Good ✅ */
transform: translateY(-4px);

/* Avoid ❌ */
top: -4px;
```

### Optimize Blur
```css
/* Use sparingly, GPU intensive */
backdrop-filter: blur(20px);
```

---

## 🎯 Quick Implementation

### Add Glassmorphism to New Element
```css
.my-new-panel {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 16px;
  box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1);
}
```

### Add Gradient Button
```css
.my-button {
  background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
  color: white;
  padding: 12px 24px;
  border-radius: 12px;
  transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);
}

.my-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
}
```

### Add Fade-In Animation
```css
.my-element {
  animation: fadeInUp 600ms ease-out;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

---

## 🎨 Road Condition Color Codes

```css
/* Data-driven styling values */
Level 1: #00A000 (Green)    /* Clear/Dry */
Level 2: #FFFF00 (Yellow)   /* Wet/Minor */
Level 3: #FFA500 (Orange)   /* Snow/Ice */
Level 4: #FF0000 (Red)      /* Hazardous */
Level 5: #000000 (Black)    /* Closed */
```

---

## 🔧 Quick Fixes

### Center Element
```css
position: absolute;
left: 50%;
transform: translateX(-50%);
```

### Responsive Width
```css
width: calc(100% - 40px);  /* Full width - padding */
max-width: 400px;          /* Don't exceed */
```

### Smooth Scrollbar
```css
overflow-y: auto;
scrollbar-width: thin;
scrollbar-color: #3b82f6 #f3f4f6;
```

---

## 📊 File Sizes

```
provo-canyon.css:        ~25KB (original)
provo-canyon-modern.css: ~35KB (new styles)
Total CSS:              ~60KB
Gzipped:                ~12KB
```

---

## ✅ Quality Checklist

**Before shipping:**
- [ ] All hover states work
- [ ] Mobile responsive
- [ ] Focus states visible
- [ ] Color contrast passes
- [ ] Animations smooth (60fps)
- [ ] No console errors
- [ ] Cross-browser tested
- [ ] Load time acceptable

---

## 🎯 Common Patterns

### Elevated Card
```css
.card {
  background: white;
  border-radius: 16px;
  box-shadow: 0 10px 15px rgba(0,0,0,0.1);
  transition: all 300ms;
}

.card:hover {
  transform: translateY(-4px);
  box-shadow: 0 20px 25px rgba(0,0,0,0.1);
}
```

### Gradient Header
```css
.header {
  background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
  color: white;
  padding: 20px;
  border-radius: 16px 16px 0 0;
}
```

### Close Button
```css
.close {
  background: rgba(255,255,255,0.2);
  border: none;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  cursor: pointer;
  transition: all 150ms;
}

.close:hover {
  background: rgba(255,255,255,0.3);
  transform: rotate(90deg);
}
```

---

**Quick Ref Version:** 1.0
**Last Updated:** 2025-10-15
**Use:** Copy & paste for consistent styling
