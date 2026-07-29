---
name: Vox Mesh Narrative
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f4'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1a1c1c'
  on-surface-variant: '#444748'
  inverse-surface: '#2f3131'
  inverse-on-surface: '#f0f1f1'
  outline: '#747878'
  outline-variant: '#c4c7c7'
  surface-tint: '#5f5e5e'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1c1b1b'
  on-primary-container: '#858383'
  inverse-primary: '#c8c6c5'
  secondary: '#5e5e5f'
  on-secondary: '#ffffff'
  secondary-container: '#e0dfdf'
  on-secondary-container: '#626363'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#410007'
  on-tertiary-container: '#f63949'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e5e2e1'
  primary-fixed-dim: '#c8c6c5'
  on-primary-fixed: '#1c1b1b'
  on-primary-fixed-variant: '#474746'
  secondary-fixed: '#e3e2e2'
  secondary-fixed-dim: '#c7c6c6'
  on-secondary-fixed: '#1a1c1c'
  on-secondary-fixed-variant: '#464747'
  tertiary-fixed: '#ffdad8'
  tertiary-fixed-dim: '#ffb3b1'
  on-tertiary-fixed: '#410007'
  on-tertiary-fixed-variant: '#92001c'
  background: '#f9f9f9'
  on-background: '#1a1c1c'
  surface-variant: '#e2e2e2'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  button:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base-unit: 4px
  margin-mobile: 16px
  margin-desktop: 24px
  gutter: 16px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style

The design system is engineered for VOX, a mesh network communication tool where reliability and clarity are paramount. The brand personality is professional, resilient, and empowering, designed to function in critical environments where connectivity is scarce.

The visual style follows a **Modern Minimalist** approach with a high-utility focus. It prioritizes functional density over decorative elements, utilizing a stark, high-contrast palette to ensure legibility under varying light conditions. The UI avoids unnecessary embellishments, favoring structural integrity and clear hierarchy to evoke a sense of calm authority and absolute trust.

## Colors

The color palette is strictly functional, utilizing a high-contrast monochromatic base with a singular high-visibility accent for critical actions.

- **Primary (#1A1A1A):** Used for core branding, primary actions, and high-level headings. It provides the grounding force for the interface.
- **Secondary (#B0B0B0):** Used for borders, disabled states, and de-emphasized metadata. It provides structural definition without visual clutter.
- **Emergency (#C8102E):** Reserved exclusively for safety alerts, emergency broadcasts, and high-stakes destructive actions. 
- **Base (#FFFFFF):** The canvas. Pure white is used to maximize the perceived "cleanliness" and brightness of the screen.

## Typography

This design system utilizes **Inter** exclusively to ensure maximum legibility across all digital scales. The type system is systematic and utilitarian.

- **Headlines:** Use Bold (700) weights with tight letter spacing for a grounded, authoritative feel.
- **Body Text:** Use Regular (400) weights for long-form communication (chats/feeds) to ensure comfort during extended reading.
- **Labels:** Use SemiBold (600) and uppercase styling for navigation and system-level metadata to differentiate from user-generated content.

## Layout & Spacing

The design system employs a **Fluid Grid** model based on a 4px baseline shift. 

- **Mobile:** A 4-column grid with 16px side margins and 16px gutters.
- **Desktop:** A 12-column centered grid with a maximum width of 1280px.
- **Spacing Rhythm:** Vertical spacing between components should follow the `stack` tokens (8px, 16px, 32px) to maintain a logical visual pace. Use 16px for most container padding to ensure touch targets remain accessible in active environments.

## Elevation & Depth

Depth is achieved through **Low-Contrast Outlines** and subtle, ambient shadows. This keeps the interface feeling "flat" and light while still providing necessary affordances.

- **Level 0 (Base):** #FFFFFF background.
- **Level 1 (Cards/Inputs):** A 1px border using Ash Gray (#B0B0B0) at 30% opacity or a very soft shadow (0px 2px 4px rgba(0,0,0,0.05)).
- **Level 2 (Modals/Popovers):** A slightly more defined shadow (0px 10px 15px rgba(0,0,0,0.1)) to lift the element above the primary navigation.
- **Interaction:** On hover or press, elements do not "lift" higher; instead, they change fill color or border intensity to reinforce a tactile, grounded feel.

## Shapes

The shape language is "Rounded," utilizing an 8px (0.5rem) base corner radius. This softens the starkness of the black-and-white palette, making the app feel approachable and modern rather than cold or industrial. 

- **Standard Elements:** 8px radius (Buttons, Input fields, Cards).
- **Small Elements:** 4px radius (Tags, Checkboxes).
- **Container Elements:** 16px or 24px radius (Bottom sheets, large modal containers).

## Components

### Buttons
- **Primary:** Solid Black (#1A1A1A) with White text. Used for the main action in any view.
- **Secondary:** Ash Gray (#B0B0B0) 1px outline with Black text. Used for supporting actions.
- **Emergency:** Solid Deep Red (#C8102E) with White text. Reserved for "Safety" and "SOS" triggers.

### Inputs & Selection
- **Text Fields:** 1px Ash Gray border, 8px radius, White background. Labels sit above the field in `label-caps`.
- **Checkboxes/Radios:** Black stroke when active. Simple, high-contrast marks.

### Navigation
- **Bottom Nav:** A fixed 4-item bar (Chat, Feed, Map, Safety). Active states use Black icons/labels; inactive states use Ash Gray. The "Safety" icon may utilize a subtle Red indicator if an alert is active.

### Feedback & Cards
- **Message Bubbles:** White background with Ash Gray borders for incoming; Light Gray (#F5F5F5) for outgoing to maintain the minimal aesthetic.
- **Status Chips:** Small 4px rounded tags using Ash Gray backgrounds to indicate mesh signal strength or "Offline" status.