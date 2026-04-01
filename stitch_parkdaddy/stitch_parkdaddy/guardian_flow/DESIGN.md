# Design System Document: The Authoritative Assistant

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Architectural Concierge."** 

We are moving away from the cluttered, "utility-first" look of typical parking apps. Instead, we treat the mobile viewport as a high-end physical space—think of a luxury hotel lobby or a precision-engineered dashboard. The system breaks the "template" look through **Intentional Asymmetry** and **Tonal Depth**. By using expansive whitespace and overlapping "glass" layers, we convey a sense of calm authority. In a high-stakes environment where a mistake costs $250, our design must look too professional to fail.

---

## 2. Colors: Tonal Architecture
We utilize a sophisticated Material Design-inspired palette, but our execution is strictly editorial.

### The Palette
- **Primary (Trust):** `primary` (#000666) and `primary_container` (#1a237e). These deep indigos represent the "Assist"—the reliable foundation of the app.
- **Secondary (Urgency):** `secondary` (#b6171e). Used sparingly but boldly for error states and "Active Boot Risk" warnings.
- **Tertiary (Success):** `tertiary_fixed` (#8df5e4). A modern, emerald-adjacent teal for active registration confirmation.
- **Neutrals:** `surface` (#f9f9fb) through `surface_container_highest` (#e2e2e4).

### Key Execution Rules
*   **The "No-Line" Rule:** 1px solid borders are strictly prohibited for sectioning. Boundaries must be defined solely through background color shifts (e.g., a `surface_container_low` section sitting on a `surface` background). 
*   **Surface Hierarchy & Nesting:** Treat the UI as stacked sheets of fine paper. An input field (the most interactive element) should live on `surface_container_lowest` (Pure White) to "pop" against a `surface_container` background.
*   **The "Glass & Gradient" Rule:** Main CTAs should use a subtle linear gradient from `primary` to `primary_container` (150° angle). Floating elements, like the countdown timer, should use **Glassmorphism**: `surface_container_lowest` at 80% opacity with a `20px` backdrop-blur.

---

## 3. Typography: Editorial Glanceability
We use **Inter** for its neutral, high-legibility "utility" feel, but we scale it aggressively to create a clear hierarchy.

*   **Display Scale (`display-lg` to `display-sm`):** Reserved exclusively for the countdown timer and license plate confirmation. These must be bold and unmistakable.
*   **Headline Scale (`headline-lg` to `headline-sm`):** Used for "Alarm-style" headers. When a session is expiring, `headline-lg` in `secondary` color demands immediate action.
*   **Title & Body Scale:** `title-lg` is for card headers; `body-md` is the workhorse for instructions.
*   **The "High-Contrast" Rule:** Pair `display-lg` numbers with `label-sm` (all caps, 0.05em tracking) to create a premium, "instrument-cluster" aesthetic.

---

## 4. Elevation & Depth: Tonal Layering
Traditional drop shadows are too "software-heavy." We use light to create safety.

*   **The Layering Principle:** Instead of shadows, stack containers. 
    *   *Level 0:* `surface` (Background)
    *   *Level 1:* `surface_container_low` (Section grouping)
    *   *Level 2:* `surface_container_lowest` (Individual interactive cards)
*   **Ambient Shadows:** When an element must float (e.g., a "Pay Now" button), use a diffused shadow: `y: 12px, blur: 24px, color: on_surface (8% opacity)`.
*   **The "Ghost Border" Fallback:** If accessibility requires a stroke, use `outline_variant` at **15% opacity**. It should be felt, not seen.

---

## 5. Components: Precision Primitives

### Active Session Card (The Hero)
*   **Visuals:** Forbid divider lines. Use a `surface_container_highest` background. 
*   **Layout:** Use asymmetrical padding (e.g., `spacing-8` on top, `spacing-6` on sides) to create a custom, high-end feel.
*   **Glass Element:** The countdown timer should be a "glass" pill floating over the indigo primary background of the card header.

### Preset Duration Buttons
*   **Style:** Large, tactile blocks using `spacing-10` height. 
*   **State:** Unselected use `surface_container_high`; Selected use `primary` with `on_primary` text. Use `rounded-lg` (0.5rem) for a modern, slightly softened "mechanical" feel.

### License Plate Inputs
*   **Style:** `surface_container_lowest` background, no border. 
*   **Focus:** Transition to a `2px` "Ghost Border" using `surface_tint`.
*   **Typography:** Use `headline-sm` for the input text to ensure the user can verify their plate at arm's length.

### Status Alarm Headers
*   **Urgency State:** Full-width `secondary` (#b6171e) background with `on_secondary` text. 
*   **Interaction:** These headers should "push" the rest of the content down, rather than overlaying, to signal a structural change in the app's state (from "Assisting" to "Warning").

---

## 6. Do’s and Don'ts

### Do
*   **Do** use `spacing-4` (1rem) as your minimum gutter for all text-to-edge relationships.
*   **Do** use `tertiary_fixed` (#8df5e4) for all "Success" states—it feels more sophisticated and modern than a standard "Old Green."
*   **Do** use negative space to separate groups of information. If you feel the urge to draw a line, add `spacing-6` of whitespace instead.

### Don't
*   **Don't** use pure black (#000000). Use `on_surface` (#1a1c1d) for text to maintain a premium, ink-on-paper feel.
*   **Don't** use standard "Material Blue." Only use the specified deep indigo `primary` to ensure the app feels "Professional" and not "Generic Utility."
*   **Don't** use `rounded-full` (pills) for everything. Reserve the full-round for small status chips; use `rounded-lg` for primary containers to maintain architectural structure.