---
layout: page
title: "Feetball — Game Stats & Roles"
subtitle: "Complete reference for all gameplay stats, player abilities, character roles, and AI behaviors"
permalink: /game-stats/
---

## Player Stats

### Movement

| Stat | Value | Notes |
|------|-------|-------|
| Base speed | 3.0 m/s | `MovementComponent.SPEED` |
| Sprint multiplier | 1.7x | Effective sprint speed: 5.1 m/s |
| Rotation speed | 5.0 | How fast the player turns to face movement direction |
| Jump velocity | 2.25 | Standard jump |
| Acceleration | 35.0 | `FootballCharacter.acceleration` |
| Deceleration | 3.0 | `FootballCharacter.deceleration` |
| Max speed | 1.5 | `FootballCharacter.max_speed` (momentum cap) |
| Momentum damping | 0.97 | Per-frame velocity decay |

### Stamina (Short-Term Resource)

| Stat | Value | Notes |
|------|-------|-------|
| Drain rate (sprinting) | 0.45/sec | Scaled by `player_data.stamina / 50.0` |
| Regen rate (idle) | 0.18/sec | Recovers when not sprinting |
| Carrier move cost | 0.2 per use | Dash, jump, or spin each cost this |
| Cooldown after depletion | 5.0 sec | Can't sprint again until cooldown expires |
| Stat scaling | 50 = normal | 100 = half drain, 25 = double drain |

### Fatigue (Long-Term Tiredness)

Fatigue accumulates across an entire play. Unlike stamina, it doesn't recover quickly.

| Stat | Value | Notes |
|------|-------|-------|
| Sprint accumulation | 0.07/sec | Builds while sprinting |
| Running accumulation | 0.025/sec | Builds while moving normally |
| Carrier move cost | 0.05 per use | Added on each dash/jump/spin |
| Recovery (idle) | 0.04/sec | Only recovers while standing still |
| Max speed penalty | 35% at full fatigue | `speed *= (1.0 - fatigue * 0.35)` |
| Vignette threshold | 60% fatigue | Blue screen tint appears above this |

**Example:** At 0.5 fatigue, player runs at 82.5% speed. At 1.0 fatigue, 65% speed.

---

## Carrier Moves (Ball Carrier Abilities)

These abilities are available to any ball carrier (non-QB by default; QB uses face buttons for throws). Each costs **0.2 stamina** and **0.05 fatigue**.

### Dash (Left/Right)

| Property | Value |
|----------|-------|
| Speed | 7.0 m/s (vs 5.1 sprint) |
| Duration | 0.18 sec |
| Cooldown | 0.7 sec |
| Input | Q (left) / E (right) |
| Effect | Quick lateral burst perpendicular to facing direction |

### Spin (360 Rotation)

| Property | Value |
|----------|-------|
| Duration | 0.35 sec |
| Cooldown | None (duration-based) |
| Input | R |
| Effect | Full 360 rotation, makes you harder to tackle during spin |

### Jump

| Property | Value |
|----------|-------|
| Boost | +3.0 m/s upward velocity |
| Approx height | ~0.46m |
| Input | F |
| Effect | Leap over defenders. Can still be tackled mid-air |

---

## Throwing & Catching

### Throw Stats

| Stat | Value | Source |
|------|-------|--------|
| Throw speed | 20.0 m/s | `BallCarrierComponent.throw_speed` |
| Throw arc | 0.15 | Y-axis bias on throw direction |
| Throw start height | 3.0m | Above player origin |
| Pressure inaccuracy | +8% per defender within 5m | Shows "PRESSURE!" on HUD |

### Aim Assist

| Stat | Value |
|------|-------|
| Target update rate | Every 0.1 sec |
| Max target distance | 50.0m |
| Targeting cone | 30 degrees from facing direction |
| Priority weighting | 70% angle alignment, 30% distance |
| Lead throw prediction | 1.5 sec ahead of receiver position |

### Catch Rates

| Scenario | Success Rate |
|----------|-------------|
| Open catch (receiver) | 80% |
| Contested catch (defender within 3.5m) | 60% |
| Interception (defender catches) | 55% |
| Failed catch | Ball deflects with 5-10 m/s bounce |

---

## Tackle Mechanics

| Stat | Value |
|------|-------|
| Tackle distance | 1.5m |
| Missed tackle chance | 15% |
| Missed tackle cooldown | 1.5 sec before next attempt |
| Tackle impulse | 4.0 - 12.0 m/s (scales with defender speed) |
| Knockdown pop | +3.0 m/s upward (arcade style) |
| Camera shake | 0.35 intensity, 0.5 sec |

### Defender Fatigue (During Chasing)

| Stat | Value |
|------|-------|
| Chase fatigue rate | 0.04/sec |
| Idle recovery rate | 0.06/sec |
| Max speed penalty | 30% at full fatigue |

### Speed Burst (Defender Closing)

| Stat | Value |
|------|-------|
| Activation range | Within 8.0m of ball carrier |
| Duration | 2.0 sec |
| Speed boost | 1.3x |
| Limit | One burst per possession |

---

## Scoring & Downs

| Rule | Value |
|------|-------|
| Touchdown value | 7 points |
| Max touchdowns to win | 7 |
| Max turnovers to lose | 3 |
| Downs per drive | 5 (no first-down resets) |
| Play clock | 60.0 sec |
| Yards conversion | 1 meter = 1.09361 yards |

### Play End Conditions

1. **Tackle** - Defender touches ball carrier within tackle distance
2. **Incomplete pass** - Ball hits ground with no carrier (turnover +1)
3. **Interception** - Defender catches ball in flight (turnover +1)
4. **Touchdown** - Ball carrier reaches end zone (+7 points)

---

## Character Roles

### Offensive Roles

#### QB (Quarterback) - Player-Controlled

The human-controlled character. Throws the ball, moves with WASD, and triggers play start on first movement.

- Controller face buttons = throw to numbered receivers (1-4)
- Keyboard 1-4 = throw to specific receiver, Space = direct throw
- Sprint with X / Left Stick Click
- Cannot run routes or block (is_qb = true)

#### WR (Wide Receiver)

Primary pass catchers. Run routes downfield to get open for throws.

- **Can run routes**: Yes (GO, OUT, SLANT, POST, CURL, COMEBACK)
- **Can block**: Yes (secondary role after catch)
- **Receiver numbered**: 1-4 (shown as Label3D above head)
- **Pre-snap**: Lines up in formation, faces QB
- **During play**: Runs assigned route, evades defenders, chases thrown ball
- **After catch by teammate**: Lead-blocks for the ball carrier

#### TE (Tight End)

Versatile player that can catch or block.

- **Can run routes**: Yes
- **Can block**: Yes
- **Behavior**: Same AI as WR but typically assigned shorter routes

#### RB (Running Back)

Backfield player, can catch or block.

- **Can run routes**: Yes
- **Can block**: Yes
- **Behavior**: Typically runs shorter routes or stays in for protection

#### FB (Fullback)

Primary blocker role.

- **Can run routes**: Yes (rarely assigned routes in practice)
- **Can block**: Yes (primary duty)
- **Behavior**: Blocks for QB pre-throw, lead-blocks for carrier post-catch

#### OL (Offensive Lineman)

Pure blocker, protects the QB.

- **Can run routes**: No
- **Can block**: Yes
- **Behavior**: Finds nearest unblocked defender within 15m, chases and slows them (75% speed reduction on contact)

### Defensive Roles

All defenders use LimboAI behavior trees. Their role determines which BT branch takes priority.

#### Blitzer

Rushes the QB directly. Assigned to first 2 defenders + possibly the 5th (50% chance).

- **Speed**: 1.01x max speed during rush
- **Target**: Always the QB while ball is in hands
- **Falls back to**: Chase carrier if QB throws

#### Man Coverage

Shadows an assigned receiver to contest catches. Assigned to indices 1-2 and 5-6 in a 10-man defense.

- **Shadow distance**: Stays within 2.5m of assigned receiver
- **Pre-throw**: Follows receiver through route
- **Post-throw**: Continues shadowing until catch or LOS crossed
- **Falls back to**: Chase carrier/ball when appropriate

#### Zone Coverage

Holds a field position and reads the QB. Assigned to indices 7-9 (safeties/DBs).

- **Behavior**: Holds zone position, faces QB
- **React trigger**: Ball predicted to land within 8m of zone
- **Falls back to**: Chase ball/carrier when triggered

---

## Route Types

Routes define the path receivers run after the snap.

| Route | Direction | Target Offset | Description |
|-------|-----------|---------------|-------------|
| **GO** | Straight downfield | (0, 0, -20) | Sprint straight ahead |
| **OUT** | Sideline | (20, 0, -10) | Run downfield then break to sideline |
| **SLANT** | Quick diagonal | (10, 0, -6) | Short diagonal across the field |
| **POST** | Toward goal posts | (-6, 0, -20) | Deep route angling toward center |
| **CURL** | Out and curl back | (14, 0, -16) | Run out, then curl back toward QB |
| **COMEBACK** | Two-waypoint | 70% down, 30% back | Run deep, then come back toward QB |

Route is complete when the receiver is within 2.0 units of the target position.

---

## AI Behavior Detail

### Receiver AI (BTSelector Priority)

```
1. Play ended?      -> Stop and idle
2. Moving to formation? -> Move to pre-snap position
3. Ball in air?     -> Chase ball, attempt catch
4. Running route?   -> Execute assigned route
5. Route complete?  -> Evade nearby defenders (stay open)
6. Teammate has ball? -> Lead-block for ball carrier
7. QB has ball?     -> Block nearest defender (protect QB)
8. Fallback         -> Idle
```

**Evasion behavior** (post-route):
- Defender < 4m: Full-speed evasion away from defender
- Defender 4-8m: Gentle drift to maintain separation
- No defenders nearby: Hold position facing QB
- Always biases toward end zone to stay useful

**Blocking behavior**:
- Finds closest unblocked defender within 15m
- Chase at full speed if > 2.5m away
- Slow pursuit (0.3x) within 2.5m
- Applies 75% speed reduction to blocked defender
- Releases block if defender escapes > 4m

### Defender AI (BTSelector Priority)

```
1. Celebrating?     -> Idle (post-play celebration)
2. Play ended?      -> Stop and idle
3. Has the ball?    -> Stop and idle (interception)
4. Moving to position? -> Move to formation spot
5. Blitzing?        -> Rush QB at 1.01x speed
6. Man coverage?    -> Shadow assigned receiver (<2.5m)
7. Zone coverage?   -> Hold zone, read QB, react to ball
8. Ball in air?     -> Chase ball (interception attempt)
9. Ball carrier exists? -> Chase carrier (lead prediction)
10. Fallback        -> Idle
```

**Carrier chase** uses lead prediction:
- Lead time = distance / defender max speed (clamped 0-0.7s)
- Predicted position = carrier pos + carrier velocity * lead time
- Per-defender angle offset prevents stacking on same spot

### Defense Assignment Distribution (10-Player Defense)

```
Indices 0, 3     -> BLITZ (rush QB)
Indices 1, 2     -> MAN (shadow receivers)
Index 4          -> BLITZ
Indices 5, 6     -> MAN
Indices 7, 8, 9  -> ZONE (hold field position)
```

For smaller defenses (3-9 players): first 1/3 BLITZ, middle 1/3 MAN, last 1/3 ZONE.

---

## Default Offensive Lineup

From SpawnManager spawn order:

| Slot | Position |
|------|----------|
| 0 | WR |
| 1 | WR |
| 2 | TE |
| 3 | RB |
| 4 | OL |

---

## Tunable Stats (@export Variables)

These can be adjusted in the Godot Inspector:

| Variable | Default | File |
|----------|---------|------|
| `SPEED` | 3.0 | MovementComponent |
| `JUMP_VELOCITY` | 2.25 | MovementComponent |
| `base_speed` | 3.0 | MovementComponent |
| `sprint_multiplier` | 1.2 | MovementComponent |
| `rotation_speed` | 5.0 | MovementComponent |
| `throw_speed` | 20.0 | BallCarrierComponent |
| `throw_arc` | 0.15 | BallCarrierComponent |
| `throw_start_height` | 3.0 | BallCarrierComponent |
| `tackle_distance` | 1.5 | Defender |
| `max_touchdowns` | 7 | PlayStateManager |
| `max_turnovers` | 3 | PlayStateManager |
| `play_clock_seconds` | 60.0 | PlayStateManager |
| `acceleration` | 35.0 | FootballCharacter |
| `deceleration` | 3.0 | FootballCharacter |
| `max_speed` | 1.5 | FootballCharacter |
| `turning_speed` | 6.0 | FootballCharacter |
| `momentum_damping` | 0.97 | FootballCharacter |
