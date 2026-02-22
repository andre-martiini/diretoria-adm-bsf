# Standardization Plan: Tool Design

This document outlines the plan to standardize the design of all tools in the application, following the premium aesthetic established in the PCA module and the `ifes-green` design logic.

## Design Principles (The "PCA Standard")
Based on `AnnualHiringPlan.tsx` and `services/pcaService.ts`:

1.  **Primary Color**: `ifes-green` (#166534/Forest Green) for primary actions and branding.
2.  **Typography**:
    *   Headings: `font-black`, `letter-spacing: -0.02em`.
    *   Legends: `text-[10px] font-black uppercase tracking-widest text-slate-400`.
3.  **Layout**:
    *   Standardized Header: Logo (left), Title (uppercase green), Subtitle (small slate).
    *   KPI Cards: `bg-white p-6 rounded-2xl border border-slate-200 shadow-sm`.
    *   Glassmorphism: Use `.glass` and `.shadow-premium` for elevated elements.
4.  **Interaction**:
    *   `motion` for smooth enters and interactions.
    *   Consistent hover states (e.g., `group-hover:translate-x-1`).

## Tasks

- [x] **Login Screen**: Enhance `Login.tsx` with premium glassmorphism and animations.
- [x] **Dashboard**: Standardize `Dashboard.tsx` cards and navigation.
- [x] **Tools Menu**: Update `Tools.tsx` to match the grid style and icon standards.
- [x] **SIPAC Importer**: Transition `SIPACImporter.tsx` from blue-centric to `ifes-green` premium theme.
- [x] **DFD Tool**: Standardize `DfdTool.tsx` with the new design tokens and layouts.
- [x] **Budget Management**: Finalize UI consistency in `BudgetManagement.tsx`.
- [x] **Annual Hiring Plan**: Ensure all sub-modals and tables follow the strict design logic.

## Standardized Components to Reuse
- `Toast.tsx`
- `Header.tsx` (if applicable, or localized header patterns)
- `.shadow-premium` class
- `.glass` class
