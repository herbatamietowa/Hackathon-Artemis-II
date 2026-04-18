# Open Questions

## hackathon-artemis-ii - 2026-04-18

- [ ] **Agent 2 model choice: `o3` vs `o4-mini`?** — Spec lists both. `o4-mini` is cheaper and faster for a 24h demo with repeated runs; `o3` reasons better. Decide by hour 2 so the SDK call is pinned. Default proposal: `o4-mini`, fallback to `o3` on parse failure.
- [ ] **Bottleneck threshold — 0.9 or 0.95?** — Plan assumes 0.9. Needs confirmation that 0.9 produces at least one bottleneck month for NW01 across all three scenarios (otherwise the reallocation story never fires on the demo click path).
- [ ] **Demo factory scope — NW01 only, or NW01 + NW03, or all 15?** — Spec primary is NW01, optional others. Plan narrows to NW01 + NW03 (needed for reallocation story). Confirm before hour 8.
- [ ] **`high_prob_only` cutoff — 75% or 90%?** — Spec says "≥ 75%". If divergence is weak, cutoff may need to rise to 90%. Treat as a tuning knob in `scenarios.py`, decided at hour 14 based on the divergence plot.
- [ ] **Probability weighting mechanic — filter or multiplier?** — For `probability_weighted`, spec implies `demand × probability`. Confirm this is a multiplicative weight (not a binary filter) so the middle curve sits cleanly between the other two.
- [ ] **Per-work-center detail in `/api/analyze` response** — Plan adds a `per_work_center` list to `AnalyzeResponse` because Agent 1's JSON schema (as specified) does not include WC-level breakdown but the chart needs it. Confirm this extension is acceptable, or move the breakdown into `Agent1Result`.
- [ ] **Fallback verdict when Agent 2 fails** — Plan proposes a deterministic `APPROVED/CORRECTED` fallback marked with `fallback: true`. Confirm this is honest enough for the demo, or prefer a hard error.
- [ ] **Weekly sheet 2_1 aggregation — working-day weighted vs equal-week?** — Plan uses working-day weighting from sheet 2_4. Confirm sheet 2_4 actually carries per-week working-day counts (not just a week-to-month map).
