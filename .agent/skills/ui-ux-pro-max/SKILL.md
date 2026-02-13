---
name: UI/UX Pro Max
description: Advanced design intelligence for creating premium, high-conversion web interfaces. Use when Codex is asked to redesign a page, improve UI/UX polish, create or restyle frontend components, fix visual hierarchy, or add interaction polish and layout systems.
---

# UI/UX Pro Max

Create "WOW" moments through intentional, premium design.

## Core Design Principles
1. **Premium Aesthetics**: Avoid generic Bootstrap looks. Use custom shadows, glassmorphism, gradients, and layered depth.
   - *Glassmorphism*: `backdrop-filter: blur(12px); background: rgba(255, 255, 255, 0.7);`
   - *Modern Shadows*: `box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.1);`
2. **Typography**: Use a fluid type scale. Pair a geometric sans-serif with a characterful display font. Avoid system defaults and overused stacks (Inter/Roboto/Arial).
3. **Whitespace**: Double the whitespace you think you need. Give content room to breathe.

## Implementation Guidelines
- **CSS Variables**: Use semantic CSS variables for colors (e.g., `--color-primary-surface`, `--color-text-muted`) to support theming.
- **Micro-Interactions**: Give every clickable element a `:hover` and `:active` state. Default to `transition: all 0.2s ease`.
- **Motion**: Prefer a few meaningful animations (page-load, staggered reveals) over generic micro-motions.
- **Mobile First**: Design for the smallest screen first, then scale up.

## Color Palette Strategy
- **60-30-10 Rule**: Use 60% neutral, 30% secondary, 10% accent.
- **Contrast**: Keep contrast ratios > 4.5:1. Use off-black (`#121212`) instead of pure black.
