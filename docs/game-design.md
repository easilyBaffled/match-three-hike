# Gridiron Gems — Game Design Document (v2.0, as built)

A single-player football match-three RPG for mobile/portrait play. You call the offense; the
personnel on the field become the gems on the board, and how you match them decides whether
the play works. Once your drive ends, the defense takes the field and plays a full possession of
its own before the ball comes back to you.

This document describes the game as it currently exists: mechanics, rules, numbers, and visual
design only. It supersedes the v1.0 prototype spec — defense, save/resume, and a new visual
identity have been added, and several numbers/colors changed in the rebuild.

---

## 1. Core gameplay loop

A **drive** is a series of plays until you score or turn the ball over. A **play** is one full cycle:

1. **Call a play.** Pick 1 of 6 plays. The play defines which 5 of the 7 positions take the field
   and how prominent each one is. All 5 are eligible to get the ball — there's no upfront pick.
2. **Match gems (6 moves).** Swap adjacent gems to make rows/columns of 3+. Cleared gems fill
   their position's meter. Chained cascades fill it faster. Whichever position you match the
   most pulls ahead.
3. **Hike (or snap early).** When moves run out, the play resolves automatically; the player may
   also choose to snap before moves run out. Whoever has the fullest meter at that moment gets
   the ball, and their meter level sets the odds.
4. **Resolve & advance.** The outcome (loss / ordinary gain / explosive gain) plays out, yardage
   animates onto the field, down & distance update.
5. **Drive ends → the defense plays.** On a touchdown or a turnover on downs, possession flips:
   the opponent runs a simulated drive of its own (see §9) before control returns to the player.

## 2. Screen flow

Five screens, all sharing one continuous game state:

- **Title** — start a new game, or continue a saved one.
- **Play Call** — choose a play; the personnel it puts on the field are shown for reference.
- **Board** — the match-three puzzle.
- **Result** — outcome reveal for the play just run.
- **Defense** — the opponent's possession plays out as an automated log.

```
Title      → tap "Start"/"Continue" →            Play Call
Play Call  → pick a play, hike →                  Board
Board      → moves exhausted, or early snap →     Result
Result     → ordinary gain / first down →         Play Call (same drive, next down)
Result     → touchdown →                          Defense (opponent kicks off from their own 25)
Result     → turnover on downs →                   Defense (opponent takes over at the same spot)
Defense    → opponent scores, punts, or turns
             the ball over on downs →               Play Call (your possession resumes)
```

## 3. Positions

Seven positions exist; any given play uses 5 of them. Each has a fixed gem identity and a skill
rating (1–5) that raises both how often its gem appears and its ceiling on outcomes.

| Position | Full name      | Role/feel        | Skill |
|----------|----------------|-------------------|:----:|
| QB       | Quarterback    | Violet            | 4    |
| RB       | Running Back   | Green             | 5    |
| WR       | Wide Receiver  | Cyan              | 5    |
| SL       | Slot Back      | Pink              | 3    |
| TE       | Tight End      | Orange            | 3    |
| OL       | O-Line         | Gold              | 4    |
| FB       | Fullback       | Red               | 2    |

## 4. Playbook

Six plays. Each declares its 5 personnel, a **prominence** weight per position (drives how often
that position's gem shows up), a **base** yard range (the floor→ceiling for an ordinary gain), a
**big** yard range (explosive gain), and an **explosiveness** rating (how readily a full meter
converts into a big play).

| Play          | Type | Personnel & prominence                                   | Base   | Big    | Explosive |
|---------------|------|------------------------------------------------------------|:------:|:------:|:---------:|
| Power Iso     | Run  | RB 3 · OL 2.4 · FB 1.6 · TE 1.2 · QB 0.7                  | 2–7    | 12–22  | .18       |
| Quick Slant   | Pass | WR 3 · QB 2 · SL 1.6 · TE 1 · OL 1.2                      | 4–9    | 14–30  | .28       |
| Deep Bomb     | Pass | WR 3.2 · QB 2.2 · OL 1.4 · SL 1.4 · TE 0.7                | 0–11   | 26–55  | .44       |
| RB Screen     | Pass | RB 3 · OL 2.2 · QB 1.4 · WR 1 · TE 1                      | 3–10   | 16–34  | .30       |
| Outside Sweep | Run  | RB 3 · OL 2 · WR 1.4 · TE 1.2 · QB 0.7                    | 1–9    | 14–28  | .24       |
| Play Action   | Pass | QB 2.6 · TE 2.4 · WR 1.8 · RB 1 · OL 1.2                  | 3–11   | 18–40  | .34       |

In the play-call screen, a position's prominence is surfaced as a tag: weight ≥ 2.5 reads
**PRIMARY**, ≥ 1.4 reads **SUPPORT**, anything lower reads **DECOY**.

## 5. Match-three board

A 7×7 grid where every gem represents one of the current play's 5 personnel.

- **Setup.** The opening board is filled with weighted-random gems and is guaranteed to contain
  no pre-made matches.
- **Selecting & swapping.** Tap a gem to select it; tap an orthogonal neighbor to attempt a swap;
  tap a non-adjacent gem to move the selection instead; tap the selected gem again to deselect.
- **Failed swaps revert.** A swap that produces no match animates back to its original position
  and does **not** cost a move.
- **Successful swaps cost a move** and trigger resolution.
- **Matching.** Any run of 3 or more of the same position, in a row or column, clears. A gem can
  belong to both a row-match and a column-match at once.
- **Filling meters.** Every cleared gem adds points to its position's meter (capped at 100),
  multiplied by the current combo.
- **Gravity & cascades.** Gems above a cleared cell fall to fill the gap; new gems spawn at the
  top using the same weighting as the original deal. If the fall creates new matches, they
  resolve automatically and the combo multiplier increases, up to a cap, before settling.
- **Move budget.** Each play allows 6 moves. Once they're spent, the play resolves automatically
  after a short beat; the player may also snap early at any time.
- **Input lock.** While gems are swapping, clearing, or falling, taps are ignored so animations
  can't be interrupted or double-triggered.

## 6. The odds — how a play resolves

Two separate weighting systems run the whole game: which gems show up, and what a snap produces.

**Gem frequency.** For each of the 5 personnel on the field, the relative chance its gem appears
on the board is:

> `weight = prominence × (0.7 + skill ÷ 10)`

A gem color is then drawn by weighted random choice across the active personnel. There's no
upfront boost for any one position — the board's mix is set entirely by the play you called, and
every position is equally available to chase from the first move.

**Who gets the ball.** At the moment of the snap, whichever *skill* position has the fullest meter
carries the play — there is no pre-snap pick. The O-line is excluded from this race; it blocks, it
never carries, no matter how full its meter gets. If two or more eligible positions are tied, the
more prominent one (per the play's weighting) wins the tie; if that's also tied, the play's
personnel order breaks it. In practice this means you're reading the board as you match, not
committing to a plan before you see a single gem: a play called for its run-blocking can still end
up in an unexpected pair of hands if that's where the matches fell.

**Outcome resolution (on snap).** Let *F* be the ball-carrier's meter (0–100) — the position that
won the snap above — and *OL* be the O-line's meter. The outcome is rolled in three tiers,
checked in order:

1. **Negative play** — chance = `clamp(4%, 32%, 30% − F÷360 − OL÷100×12%)`. On a pass, 30% of
   these are sacks (a loss of 3–8 yards) and the rest are incompletions (0 yards). On a run,
   it's a stuff for a small loss or no gain.
2. **Explosive play** — chance = `(F÷100) × the play's explosiveness + 2%`. Yardage is drawn from
   the play's big-gain range.
3. **Ordinary gain** (the default if neither above triggers) — yardage scales linearly from the
   bottom to the top of the play's base range as *F* rises from 0 to 100, with a small amount of
   random noise.

A full meter therefore does three things at once: it nearly eliminates negative plays, pushes an
ordinary gain toward the top of its range, and maximizes the chance of an explosive play. The
O-line's meter independently suppresses negative plays no matter who ends up carrying the play —
protection matters even when the spotlight lands on someone else.

*Worked example — Power Iso:* before a single move, the RB is already the most prominent target
(weight ≈ 3.2 vs. the OL's ≈ 2.6 and FB/TE/QB trailing), so matching evenly tends to leave the RB
in the lead by default — but a player who deliberately chases OL or FB gems instead can hand the
play to them. Whoever ends up with the fullest meter at the snap gets the same payoff curve: near
its floor on negative plays, roughly 1-in-5 odds of an explosive at a maxed meter, and an ordinary
gain at the top of the play's base range.

## 7. Momentum (drive-level meter)

A second meter exists above the per-position meters: **momentum**, a single 0–100 gauge that
belongs to the drive, not to any one position or play.

- **Charges on excellence, not volume.** Momentum does not move when you simply clear gems. It
  charges only on two events: **+25 when a play resolves as an explosive gain**, and **+15 when a
  play earns a first down**. Both can land on the same play (an explosive that also converts).
  Momentum caps at 100 and does not charge on a touchdown — the drive is about to reset anyway.
- **Persists across plays** within the same drive, exactly like field position and the down/distance
  count. **Resets to 0** whenever possession flips (touchdown or turnover on downs) — the same
  lifecycle boundary the drive itself uses.
- **Player-spent.** When momentum reaches 100, a **CASH IN MOMENTUM** button appears on the
  play-call screen. Cashing it spends the full meter and arms the *next* play: that play's outcome
  roll skips the negative- and ordinary-gain tiers entirely and resolves as an explosive gain,
  regardless of how full the ball-carrier's meter ends up being. It is never spent automatically —
  you choose the play to spend it on.
- **HUD.** A distinct fire-accented panel (separate from the per-position meter row) appears below
  the field bar on both the play-call and board screens, showing the current percentage, the
  CASH IN button once full, and a "EXPLOSIVE LOCKED IN" badge once armed and waiting on the next
  snap.
- **Save/resume.** Momentum and its armed state are ordinary fields on the saved game state, so
  they persist through the same autosave as score and field position.

## 8. Drive, downs, and scoring

Field position runs on a 0–100 scale; a drive starts on your own 25. After yards from a play are
applied:

- **Reaching the far end of the field** scores a touchdown (+7 points); a new drive begins, with
  the defense kicking off from their own 25.
- **Gaining at least the distance needed** earns a first down (reset to 1st & 10, or 1st & goal if
  inside the 10).
- **Otherwise**, the down advances. Failing to convert by 4th down is a turnover on downs — the
  defense takes over at the current spot.
- Yardage reveals by ticking up or down one yard at a time, with the field's ball marker and
  first-down line easing into their new positions.

## 9. The defense

When your drive ends (by touchdown or turnover on downs), the opponent plays a possession of its
own, shown as an automated, play-by-play log rather than a puzzle — there's no board to fill in on
defense.

- The opponent uses the **same outcome model** described in §6, but instead of building meters
  through matching, each of its plays rolls a randomized "execution" level (a stand-in for the
  ball-carrier's meter) and a randomized protection level (standing in for the O-line meter), so its
  performance varies play to play rather than being earned.
- **4th-down decision.** If the opponent faces 4th down with more than 2 yards to go *and* is
  still in their own half (more than 50 yards from scoring), they will punt — a kick of roughly
  35–45 yards that flips the ball back to you, re-spotted within a safe range of the field rather
  than at the exact net distance. In any other 4th-down situation (short yardage, or once in
  scoring range) they go for it.
- The drive ends the same way the player's does: touchdown (+7 to the opponent's score), turnover
  on downs, or a punt — after which the ball, down, and distance reset and play passes back to you.
- A short pause separates each simulated play and each drive-ending event, so the log reads like a
  real series of snaps rather than an instant result.

## 10. Save & resume

The game state is saved automatically any time you're not on the title screen, so leaving and
returning puts you back exactly where you left off — same drive, same score, same board if you
were mid-play. The title screen shows a **Continue** option whenever a save exists, alongside the
option to start fresh (which discards the save). If you resume in the middle of a board animation
or in the middle of an opponent's possession, the game instead resumes you at the nearest stable
decision point — the play-call screen, with the ball where it was — rather than restoring a
half-finished animation.

## 11. Tuning constants

| Constant | Value | Effect |
|---|---|---|
| Board size | 7 × 7 | — |
| Moves per play | 6 | Lower = harder to fill meters before the snap. |
| Fill per cleared gem | 5 (× combo) | — |
| Combo multiplier | 1 → 3, +0.5 per chain | Caps cascades from scaling forever. |
| Skill-to-frequency term | 0.7 + skill ÷ 10 | How much skill rating affects gem frequency. |
| Negative-play base chance | 30% | At an empty meter. |
| Negative-play chance range | 4%–32% | Floor and ceiling regardless of meters. |
| Touchdown value | 7 points | No field goals or extra points. |
| Opponent execution roll | random per play | Stands in for a meter the AI doesn't build. |
| Opponent protection roll | random per play | Stands in for the AI's O-line meter. |
| Opponent punt distance | ~35–45 yards | Only thrown on long 4th downs in their own half. |
| Momentum charge — explosive play | +25 | Caps at 100; doesn't charge from ordinary clears. |
| Momentum charge — first down | +15 | Stacks with the explosive charge on the same play. |
| Momentum spend effect | forced explosive | Cashing in skips straight to the explosive tier on the next play. |

## 12. Visual design

A backlit handheld-console presentation: the whole game lives inside a single rounded device
frame ("cartridge") centered on a dark gradient backdrop, bordered in near-black with a glowing
inset rim, a soft drop shadow beneath it, and a faint scanline + vignette overlay across the
screen for a powered-on LCD feel.

**Palette**
- Backdrop: near-black navy fading from a deep blue glow.
- Device body: dark navy gradient, near-black ink border.
- Field/board: dark forest green turf with a faint grid overlay.
- HUD panels: near-black navy, slightly lighter than the backdrop.
- Primary accent (CTAs, key numbers, highlights): warm gold/amber.
- Status colors: green for positive/touchdown moments, red for danger/turnovers/low move counts,
  amber as the neutral/default highlight.
- Position gem colors are saturated and distinct — violet, green, cyan, pink, orange, gold, and
  red — each gem rendered as a beveled chunk with a dark outline and an inset highlight/shadow for
  a tactile, chunky look, never a flat swatch.

**Type**
- A blocky pixel-art display face is used for headings, HUD labels, buttons, and short emphatic
  numbers (scores, percentages, yardage).
- A rounded mono/terminal face is used for descriptive text, play descriptions, and the defense's
  play-by-play log — anything meant to be read at length.

**Layout & feel**
- The entire game fits on one screen without page-level scrolling; the only places that scroll
  internally are the play-call list (plays + personnel reference) and the defense's play-by-play log.
- The match-three grid always sizes itself to fit the available space exactly, so it never
  overflows or forces a scroll, across a wide range of phone screen heights.
- The title screen shows four gems gently bobbing above the game's title treatment, with a
  blinking "press start" prompt (or a Continue/New Game choice if a save exists).
- The field is rendered as a yardage bar with subtle yard-line ticks, a highlighted end zone, a
  glowing first-down marker, and a ball-position marker that eases smoothly to its new spot after
  each play.
- Selected gems lift slightly and glow; matched gems pop and shrink away; gems that fall into an
  empty slot drop in from above with a small bounce-settle; all of these motions play at a
  deliberately unhurried pace (noticeably slower than a snappy arcade game) so the player can
  always read what just happened on the board.
- The result of a play appears as a centered card over a dimmed board, color-coded by outcome
  (green for a touchdown, red for a turnover, amber otherwise), with the yardage gained counting
  up or down digit by digit before the player continues.
- Meters are shown as glowing color-matched progress bars: a large one for whoever currently holds
  the lead (the live ball-carrier), and a row of smaller vertical bars for the rest of the personnel
  on the field, so the player can see at a glance how full every position's meter is, not just the
  one currently in the lead.

## 13. Out of scope / not yet built

- Player-side 4th-down decisions (punting or attempting a field goal) — on offense, failing to
  convert by 4th down is always a turnover on downs.
- Field goals and extra points; touchdowns are the only scoring play for either side.
- A clock, quarters, or any end-of-game condition — drives alternate indefinitely.
- Audio and haptics.
- Roster progression, unlockable plays, or any persistent meta-progression across games.
