# Ambient Presence Widget — Product Specification v1.0

> バディの「気配」をデスクトップに常駐させる — actbuddy コアモジュール

| Field | Value |
|---|---|
| Version | v1.0 (Draft) |
| Date | 2026-04-06 |
| Status | Internal Review |
| Author | Kambara-Michiru |
| Research basis | AmbiTeam (GI 2021) · Cho et al. CSCW 2023 · Eagle et al. 2024 · Weiser & Brown 1995 |

---

## Table of Contents

1. [Purpose & Scope](#1-purpose--scope)
2. [Layered Architecture Overview](#2-layered-architecture-overview)
3. [Layer 0 — OS Shell (Tauri)](#3-layer-0--os-shell-tauri)
4. [Layer 1 — Transport (WebSocket)](#4-layer-1--transport-websocket)
5. [Layer 2 — State Machine (Presence)](#5-layer-2--state-machine-presence)
6. [Layer 3 — Animation Engine](#6-layer-3--animation-engine)
7. [Layer 4 — Renderer (Canvas / Lottie)](#7-layer-4--renderer-canvas--lottie)
8. [Layer 5 — Privacy Filter](#8-layer-5--privacy-filter)
9. [Layer 6 — Backend (Go Presence API)](#9-layer-6--backend-go-presence-api)
10. [Cross-Layer Data Types](#10-cross-layer-data-types)
11. [Implementation Phases](#11-implementation-phases)
12. [Open Questions](#12-open-questions)
13. [References](#13-references)

---

## 1. Purpose & Scope

### 1.1 Problem

Focusmate や従来のバーチャル勉強部屋はビデオ通話を前提とし、「セッション中だけ存在感を共有する」設計になっている。

Cho et al. (CSCW 2023) が示すように、ユーザーは **ambient presence for study motivation** を求める一方、必要以上に見せたくないという葛藤を持つ。Morrison-Smith et al. (GI 2021) は、リモートワークにおける **motivational presence of others** の欠如がモチベーション低下の主因であると実証している。

本ウィジェットはこの課題を「通知ではなく気配」として解決する。ビデオ・通知ではなく、周辺視野に漂う生き物的アニメーション（dot / 猫スキン）によって、セッション外でも継続的に他者の存在を ambient に届ける。

### 1.2 Design Principles

```
Principle 1 — Calm Technology (Weiser & Brown, 1995)
  情報は周辺から中心へ移動できるが、引っ張らない。
  通知は出さない。アニメーションの変化だけで状態を伝える。
  Calm Tech Certified 6軸 (attention / periphery / durability /
  light / sound / materials) に準拠。

Principle 2 — Privacy by Design
  バディの「何をしているか」は伝えない。
  「いるかどうか」「元気かどうか」の二値＋強度のみ。
  情報粒度はユーザーが Lv1〜Lv4 で設定可能。

Principle 3 — Anti-attention-economy
  常時表示でありながらアテンションを奪わない。
  dot サイズ最大 48×48 px。
  フラッシュ・バウンス・赤バッジは一切使用しない。

Principle 4 — Ambient not Interruption
  Eagle et al. (2024) の「space / time / mutuality の連続体」に基づき、
  同室・オンライン・メディア越しの3モードを統一的に扱う。
  非同期でも存在感を届けられる設計。
```

### 1.3 Out of Scope (v1.0)

- ビデオ通話・音声通話
- チャット・メッセージング
- タスク管理コア機能（actbuddy 本体が担う）
- モバイル対応

---

## 2. Layered Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 6  Backend — Go Presence API                         │
│           POST /v1/presence/event  (internal)               │
│           GET  /v1/presence/stream (WebSocket, public)      │
└──────────────────────────┬──────────────────────────────────┘
                           │ WebSocket over TLS
┌──────────────────────────▼──────────────────────────────────┐
│  Layer 5  Privacy Filter                                    │
│           Payload を受信バディの privacy_level でフィルタ   │
└──────────────────────────┬──────────────────────────────────┘
                           │ PresenceEvent (filtered)
┌──────────────────────────▼──────────────────────────────────┐
│  Layer 1  Transport — WebSocket Client (Rust / Tauri)       │
│           接続管理・再接続・IPC bridge                       │
└──────────────────────────┬──────────────────────────────────┘
                           │ tauri::emit('presence_event', payload)
┌──────────────────────────▼──────────────────────────────────┐
│  Layer 2  State Machine — PresenceStore (Zustand / JS)      │
│           OFFLINE / SLEEPING / IDLE / ACTIVE / CELEBRATING  │
└──────────────────────────┬──────────────────────────────────┘
                           │ PresenceState
┌──────────────────────────▼──────────────────────────────────┐
│  Layer 3  Animation Engine — AnimationController            │
│           呼吸 / ランダムウォーク / スパーク / Lottie        │
└──────────────────────────┬──────────────────────────────────┘
                           │ DrawCommand[]
┌──────────────────────────▼──────────────────────────────────┐
│  Layer 4  Renderer — Canvas API / Lottie Web                │
│           dot 描画 / Celebrating エフェクト                  │
└──────────────────────────┬──────────────────────────────────┘
                           │ OS window compositing
┌──────────────────────────▼──────────────────────────────────┐
│  Layer 0  OS Shell — Tauri v2                               │
│           Always-on-top / transparent window / drag         │
└─────────────────────────────────────────────────────────────┘
```

**Dependency rule:** 各レイヤーは隣接する下位レイヤーにのみ依存する。Layer 3 は Layer 1 や Layer 6 を直接参照しない。

---

## 3. Layer 0 — OS Shell (Tauri)

### 3.1 責務

- デスクトップ常駐ウィンドウの生成・管理
- Always-on-top の維持
- ユーザーによるドラッグ移動の処理
- アプリケーションライフサイクル管理（起動・スリープ復帰・終了）

### 3.2 ウィンドウ設定

```toml
# tauri.conf.json (抜粋)
[window]
width            = 64
height           = 64
decorations      = false
transparent      = true
always_on_top    = true
resizable        = false
skip_taskbar     = true
visible_on_all_workspaces = true   # macOS: 全デスクトップに表示
```

### 3.3 OS 別実装差異

| OS | Always-on-top 実装 | フルスクリーン除外 |
|---|---|---|
| macOS | `NSPanel` + `.floating` level | `NSWindow.collectionBehavior = .canJoinAllSpaces` |
| Windows | `WS_EX_TOPMOST` | `SetWindowDisplayAffinity(DWMWA_CLOAKED)` |
| Linux | `_NET_WM_STATE_ABOVE` (X11) | 未サポート (v1.0) |

### 3.4 ウィンドウ座標の永続化

```typescript
// 起動時に復元
const savedPos = localStorage.getItem('widget_position');
if (savedPos) {
  const { x, y } = JSON.parse(savedPos);
  await appWindow.setPosition(new PhysicalPosition(x, y));
}

// ドラッグ終了時に保存
appWindow.onMoved(({ payload }) => {
  localStorage.setItem('widget_position', JSON.stringify(payload));
});
```

### 3.5 スリープ復帰ハンドリング

```rust
// src-tauri/src/main.rs
app.on_system_event(|event| {
    if let SystemEvent::WillResume = event {
        // Layer 1 の Transport に再接続シグナルを送る
        app_handle.emit_all("system_resume", {}).ok();
    }
});
```

---

## 4. Layer 1 — Transport (WebSocket)

### 4.1 責務

- actbuddy backend との WebSocket 接続の確立・維持
- 認証トークンの付与
- 切断時の再接続（exponential backoff）
- 受信メッセージを Layer 2 へ IPC で転送

### 4.2 エンドポイント

```
wss://api.actbuddy.app/v1/presence/stream
Authorization: Bearer <JWT>
```

### 4.3 再接続ロジック

```rust
const BACKOFF_BASE_MS: u64 = 1_000;
const BACKOFF_MAX_MS:  u64 = 60_000;

async fn connect_with_backoff(token: &str) {
    let mut attempt = 0u32;
    loop {
        match ws_connect(token).await {
            Ok(stream) => { handle_stream(stream).await; attempt = 0; }
            Err(_) => {
                let wait = (BACKOFF_BASE_MS * 2u64.pow(attempt))
                    .min(BACKOFF_MAX_MS);
                tokio::time::sleep(Duration::from_millis(wait)).await;
                attempt = attempt.saturating_add(1);
            }
        }
    }
}
```

### 4.4 IPC Bridge (Rust → JS)

```rust
// 受信イベントを JS フロントエンドに転送
fn on_message(app: &AppHandle, raw: &str) {
    match serde_json::from_str::<PresenceEvent>(raw) {
        Ok(event) => { app.emit_all("presence_event", &event).ok(); }
        Err(e)    => { log::warn!("Invalid presence payload: {e}"); }
        // 不正ペイロードは無視。状態変更なし。
    }
}
```

### 4.5 エラーハンドリング

| ケース | 対処 |
|---|---|
| ネットワーク切断 | exponential backoff。OFFLINE 状態を維持。 |
| 401 Unauthorized | トークン更新を試みる。失敗時は OFFLINE 表示＋ログイン促すトースト（1回のみ）。 |
| 不正 JSON | イベントを無視。warn ログ。状態変更なし。 |
| スリープ復帰 | `system_resume` イベントで即座に再接続を試みる。 |
| サーバー ping timeout (30s) | 接続断とみなし、再接続フローへ。 |

---

## 5. Layer 2 — State Machine (Presence)

### 5.1 責務

- `PresenceEvent` を受け取り `PresenceState` を更新
- 状態遷移ルールの enforcement
- タイムアウト管理（30分無応答 → SLEEPING）
- Layer 3 へ状態変化を通知

### 5.2 State 定義

```typescript
type Status =
  | 'OFFLINE'      // 接続断 / 未ログイン
  | 'SLEEPING'     // 30分以上操作なし / away
  | 'IDLE'         // ログイン済み・セッション外
  | 'ACTIVE'       // セッション中
  | 'CELEBRATING'; // タスク完了直後（2.5秒）

type PresenceState = {
  status:       Status;
  buddyId:      string | null;
  privacyLevel: 1 | 2 | 3 | 4;
  intensity:    number;    // 0.0–1.0 (Lv3以上のみ有効)
  categoryHue:  number;    // 0–360  (Lv4のみ有効)
  lastEventTs:  Date | null;
};
```

### 5.3 状態遷移表

```
From          Event / Condition              To
──────────────────────────────────────────────────────────────
any           WebSocket 切断 (10s経過)       OFFLINE
any           presence.event == 'logout'     OFFLINE
OFFLINE       WS 接続成功                    IDLE
IDLE          presence.event == 'session_start'  ACTIVE
ACTIVE        presence.event == 'task_complete'  CELEBRATING
CELEBRATING   Lottie onComplete (+2500ms)    IDLE
ACTIVE        presence.event == 'away'       SLEEPING
ACTIVE        30分間 next-event なし         SLEEPING
SLEEPING      presence.event == 'session_start'  ACTIVE
SLEEPING      presence.event == 'back'       IDLE
```

### 5.4 Zustand Store 実装

```typescript
// stores/presenceStore.ts
import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';

type PresenceStore = PresenceState & {
  dispatch: (event: PresenceEvent) => void;
};

export const usePresenceStore = create<PresenceStore>((set, get) => ({
  status:       'OFFLINE',
  buddyId:      null,
  privacyLevel: 2,
  intensity:    0,
  categoryHue:  220,
  lastEventTs:  null,

  dispatch(event: PresenceEvent) {
    const { status } = get();
    set(transition(status, event));
  },
}));

// Tauri IPC リスナー（App.tsx で一度だけ呼ぶ）
export function initPresenceListener() {
  listen<PresenceEvent>('presence_event', ({ payload }) => {
    usePresenceStore.getState().dispatch(payload);
  });
}
```

### 5.5 CELEBRATING タイムアウト管理

```typescript
// AnimationController 側で管理（Layer 3 の責務）
// PresenceStore は CELEBRATING に遷移するだけ。
// 2500ms 後の IDLE 遷移は AnimationController の Lottie.onComplete が担う。
// → タイムアウトの責務を Store に持たせない（副作用の局所化）
```

---

## 6. Layer 3 — Animation Engine

### 6.1 責務

- `PresenceState` を購読し、対応するアニメーションパラメータを計算
- 呼吸・ランダムウォーク・スパークの物理パラメータ管理
- Layer 4 へ `DrawCommand` を毎フレーム渡す
- CELEBRATING 終了時に Layer 2 へ遷移シグナルを返す

### 6.2 DrawCommand 型

```typescript
type DrawCommand = {
  // dot geometry
  x:          number;   // canvas 内 x 座標 (px)
  y:          number;   // canvas 内 y 座標 (px)
  radius:     number;   // 描画半径 (px)
  scale:      number;   // 呼吸・スパークによるスケール係数

  // dot appearance
  hsl:        [number, number, number];  // hue, saturation%, lightness%
  opacity:    number;   // 0.0–1.0
  glowBlur:   number;   // shadowBlur (0 = no glow)
  glowColor:  string;   // CSS color string

  // control
  showLottie: boolean;  // CELEBRATING 時に Lottie レイヤーを表示
};
```

### 6.3 アニメーションパラメータ (State 別)

```typescript
const ANIM_PARAMS: Record<Status, AnimParams> = {
  OFFLINE: {
    hsl:         [220, 10, 70],
    opacity:     0.20,
    scaleMid:    0.60,   // 呼吸の中心スケール
    scaleAmp:    0,      // 呼吸の振幅
    periodRange: [0, 0], // 呼吸周期 [min, max] ms
    walkForce:   0,      // ランダムウォーク力
    glowBlur:    0,
  },
  SLEEPING: {
    hsl:         [220, 15, 70],
    opacity:     0.45,
    scaleMid:    0.50,
    scaleAmp:    0.04,
    periodRange: [8000, 8000],
    walkForce:   0,
    glowBlur:    0,
  },
  IDLE: {
    hsl:         [220, 20, 75],
    opacity:     0.75,
    scaleMid:    1.00,
    scaleAmp:    0.08,
    periodRange: [4000, 6000],
    walkForce:   0.08,
    glowBlur:    0,
  },
  ACTIVE: {
    hsl:         [25, 80, 55],
    opacity:     1.00,
    scaleMid:    1.00,
    scaleAmp:    0.08,
    periodRange: [2000, 3000],
    walkForce:   0.03,  // ACTIVE は中心付近を漂う（force 小）
    glowBlur:    4,
  },
  CELEBRATING: {
    hsl:         [45, 90, 55],
    opacity:     1.00,
    scaleMid:    1.20,
    scaleAmp:    0,
    periodRange: [0, 0],
    walkForce:   0,
    glowBlur:    8,
  },
};
```

### 6.4 呼吸の数式

```typescript
// elapsed: フレームの経過時間 (ms)
// breathPeriod: 状態変化時に [min, max] から一様サンプリング
function breathScale(elapsed: number, period: number, amp: number, mid: number): number {
  return mid + amp * Math.sin((2 * Math.PI * elapsed) / period);
}

// 状態変化時に period を再サンプリング（連続的な変化に見せる）
function samplePeriod([min, max]: [number, number]): number {
  return min + Math.random() * (max - min);
}
```

### 6.5 ランダムウォーク (Perlin ノイズ)

```typescript
import { createNoise2D } from 'simplex-noise'; // simplex-noise@4

const noise2D = createNoise2D();
const MAX_VEL = 1.2; // px/frame @ 60fps
const WALL_MARGIN = 4; // px

function stepWalk(pos: Vec2, vel: Vec2, t: number, force: number, bounds: Rect): [Vec2, Vec2] {
  const nx = noise2D(t * 0.0008, 0);
  const ny = noise2D(0, t * 0.0008);

  let vx = clamp(vel.x + nx * force, -MAX_VEL, MAX_VEL);
  let vy = clamp(vel.y + ny * force, -MAX_VEL, MAX_VEL);

  let x = pos.x + vx;
  let y = pos.y + vy;

  // 壁反射
  if (x < WALL_MARGIN || x > bounds.w - WALL_MARGIN) vx *= -1;
  if (y < WALL_MARGIN || y > bounds.h - WALL_MARGIN) vy *= -1;

  return [
    { x: clamp(x, WALL_MARGIN, bounds.w - WALL_MARGIN),
      y: clamp(y, WALL_MARGIN, bounds.h - WALL_MARGIN) },
    { x: vx, y: vy },
  ];
}
```

### 6.6 スパーク（ACTIVE 時）

```typescript
// 8〜15秒ごとにランダムで 100ms のピクッとした動き
const SPARK_INTERVAL_RANGE = [8_000, 15_000];
const SPARK_DURATION_MS = 100;
const SPARK_PEAK_SCALE = 1.15;

function sparkScale(elapsed: number, sparkStart: number | null): number {
  if (sparkStart === null) return 1.0;
  const t = (elapsed - sparkStart) / SPARK_DURATION_MS;
  if (t < 0 || t > 1) return 1.0;
  // ease-in-out で 1.0 → 1.15 → 1.0
  return 1.0 + (SPARK_PEAK_SCALE - 1.0) * Math.sin(t * Math.PI);
}
```

### 6.7 パフォーマンス要件

| 状態 | rAF レート | CPU 目安 |
|---|---|---|
| OFFLINE | 停止 | ~0% |
| SLEEPING | 10 fps (間引き) | < 0.1% |
| IDLE / ACTIVE | 60 fps | < 0.5% |
| CELEBRATING | 60 fps | < 1.0% |

```typescript
// SLEEPING 時のフレーム間引き
const TARGET_FPS = status === 'SLEEPING' ? 10 : 60;
const FRAME_MS   = 1000 / TARGET_FPS;
let lastFrameTs  = 0;

function loop(ts: number) {
  if (ts - lastFrameTs >= FRAME_MS) {
    lastFrameTs = ts;
    tick(ts);
  }
  requestAnimationFrame(loop);
}

// バックグラウンド時は完全停止
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cancelAnimationFrame(rafId);
  else rafId = requestAnimationFrame(loop);
});
```

---

## 7. Layer 4 — Renderer (Canvas / Lottie)

### 7.1 責務

- `DrawCommand` を受け取り Canvas に dot を描画
- CELEBRATING 時に Lottie アニメーションを再生
- HiDPI / Retina 対応（devicePixelRatio）

### 7.2 DotCanvas コンポーネント

```typescript
// components/DotCanvas.tsx
import { useEffect, useRef } from 'react';
import type { DrawCommand } from '../types/animation';

export function DotCanvas({ cmd }: { cmd: DrawCommand }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const dpr    = window.devicePixelRatio ?? 1;
    const size   = 32; // CSS px

    canvas.width  = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width  = `${size}px`;
    canvas.style.height = `${size}px`;

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx    = canvas.getContext('2d')!;
    const dpr    = window.devicePixelRatio ?? 1;
    const cssSize = canvas.width / dpr;
    const cx = cssSize / 2;
    const cy = cssSize / 2;

    ctx.clearRect(0, 0, cssSize, cssSize);
    ctx.save();

    // 呼吸・スパークスケール適用
    ctx.translate(cx, cy);
    ctx.scale(cmd.scale, cmd.scale);
    ctx.translate(-cx, -cy);

    // glow
    if (cmd.glowBlur > 0) {
      ctx.shadowBlur  = cmd.glowBlur;
      ctx.shadowColor = cmd.glowColor;
    }

    // dot 描画
    const [h, s, l] = cmd.hsl;
    ctx.fillStyle   = `hsla(${h}, ${s}%, ${l}%, ${cmd.opacity})`;
    ctx.beginPath();
    ctx.arc(cmd.x, cmd.y, cmd.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }, [cmd]);

  return <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0 }} />;
}
```

### 7.3 Lottie オーバーレイ（CELEBRATING）

```typescript
// components/LottieOverlay.tsx
import lottie from 'lottie-web';
import celebrateJson from '../assets/celebrate.json';

export function LottieOverlay({ onComplete }: { onComplete: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const anim = lottie.loadAnimation({
      container:  containerRef.current!,
      renderer:   'canvas',
      loop:       false,
      autoplay:   true,
      animationData: celebrateJson,
    });
    anim.addEventListener('complete', onComplete);
    return () => anim.destroy();
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', top: 0, left: 0, width: 64, height: 64, pointerEvents: 'none' }}
    />
  );
}
```

### 7.4 Lottie アセット要件

```
assets/celebrate.json
  - duration:    2500 ms
  - size:        64 × 64 px viewport
  - content:     星が弾けるエフェクト（粒子 8〜12 個）
  - loop:        false
  - background:  transparent
  - filesize:    < 30 KB
```

---

## 8. Layer 5 — Privacy Filter

### 8.1 責務

- バックエンドが presence イベントを broadcast する前に適用
- 受信バディの `privacy_level` 設定に基づきペイロードをマスク
- クライアント側はフィルタ後のデータのみ受け取る（クライアント側では信頼しない）

### 8.2 情報開示レベル

| Level | Name | 開示される情報 |
|---|---|---|
| 1 | Ghost | オンライン / オフラインのみ（dot の有無） |
| 2 | Presence | Lv1 + 作業中 / 休憩中 (IDLE ↔ ACTIVE の区別) |
| 3 | Energy | Lv2 + `intensity`（アニメの活発さ） |
| 4 | Focus | Lv3 + `category_hue`（タスクカテゴリを色で表現） |

デフォルト: **Lv2**

### 8.3 フィルタリング実装（Go）

```go
// pkg/presence/filter.go
func FilterPayload(event PresenceEvent, buddyPrivacyLevel int) PresenceEvent {
    filtered := PresenceEvent{
        Event:    event.Event,
        BuddyID:  event.BuddyID,
        Ts:       event.Ts,
    }

    if buddyPrivacyLevel >= 2 {
        filtered.PrivacyLevel = event.PrivacyLevel
        // IDLE / ACTIVE の区別を伝える（event.Event そのまま）
    }

    if buddyPrivacyLevel >= 3 {
        filtered.Intensity = event.Intensity
    }

    if buddyPrivacyLevel >= 4 {
        filtered.CategoryHue = event.CategoryHue
    }

    return filtered
}
```

### 8.4 絶対に開示しない情報

- タスクの具体的な内容・タイトル
- 作業時間の正確な数値
- アプリケーション名・URL
- カメラ・マイクの映像・音声

これらは actbuddy backend が保持していても、presence イベントのペイロードには含めない（スキーマレベルで除外）。

---

## 9. Layer 6 — Backend (Go Presence API)

### 9.1 責務

- presence イベントの受け付けと保持（in-memory）
- 認可済みバディへのリアルタイム broadcast
- プライバシーフィルタリングの適用
- ハートビート監視による自動 away 検出

### 9.2 エンドポイント

```
# Public (JWT required)
GET  wss://api.actbuddy.app/v1/presence/stream
GET  https://api.actbuddy.app/v1/presence/status/:buddy_id  (polling fallback)

# Internal (service-to-service only)
POST https://api.actbuddy.app/internal/v1/presence/event
```

### 9.3 イベントペイロード (JSON)

```json
{
  "event":        "session_start | task_complete | away | back | logout",
  "buddy_id":     "<uuid>",
  "privacy_level": 1,
  "intensity":    0.0,
  "category_hue": 220,
  "ts":           "2026-04-06T12:00:00Z"
}
```

### 9.4 イベントソース

| イベント | 生成元 |
|---|---|
| `session_start` | actbuddy セッション管理サービス |
| `session_end` | actbuddy セッション管理サービス → `away` に変換 |
| `task_complete` | actbuddy タスク完了 Webhook |
| `away` | ハートビート監視（30分無応答） or セッション管理 |
| `back` | 次のアクティビティ検出 |
| `logout` | 認証サービス |

### 9.5 スケーリング要件 (v1.0)

| 指標 | 目標値 |
|---|---|
| 同時接続数 | 最大 1,000 WebSocket 接続 |
| イベント遅延 | P99 < 500 ms |
| インフラ | 単一 Go サーバー on Fly.io（コスト最小化） |
| HA | v2.0 以降で検討 |

### 9.6 ハートビート

```go
// サーバー → クライアントへ 20秒ごとに ping 送信
// クライアントが 30秒以内に pong を返さない場合 → 切断とみなし OFFLINE に遷移
const (
    PingInterval = 20 * time.Second
    PongTimeout  = 30 * time.Second
)
```

---

## 10. Cross-Layer Data Types

### 10.1 PresenceEvent (Layer 1 → Layer 2)

```typescript
type PresenceEventType =
  | 'session_start'
  | 'task_complete'
  | 'away'
  | 'back'
  | 'logout';

type PresenceEvent = {
  event:        PresenceEventType;
  buddyId:      string;
  privacyLevel: 1 | 2 | 3 | 4;
  intensity:    number;     // 0.0–1.0 (Lv3以上のみ、それ以外は 0)
  categoryHue:  number;     // 0–360   (Lv4のみ、それ以外は 0)
  ts:           string;     // ISO8601
};
```

### 10.2 PresenceState (Layer 2 → Layer 3)

```typescript
type PresenceState = {
  status:       'OFFLINE' | 'SLEEPING' | 'IDLE' | 'ACTIVE' | 'CELEBRATING';
  buddyId:      string | null;
  privacyLevel: 1 | 2 | 3 | 4;
  intensity:    number;
  categoryHue:  number;
  lastEventTs:  Date | null;
};
```

### 10.3 DrawCommand (Layer 3 → Layer 4)

```typescript
type DrawCommand = {
  x:          number;
  y:          number;
  radius:     number;
  scale:      number;
  hsl:        [number, number, number];
  opacity:    number;
  glowBlur:   number;
  glowColor:  string;
  showLottie: boolean;
};
```

### 10.4 AnimParams (Layer 3 internal)

```typescript
type AnimParams = {
  hsl:         [number, number, number];
  opacity:     number;
  scaleMid:    number;
  scaleAmp:    number;
  periodRange: [number, number];
  walkForce:   number;
  glowBlur:    number;
};
```

---

## 11. Implementation Phases

### Phase 1 — Animation POC (〜2 weeks)

**Goal:** Tauri + Canvas で dot のアニメーションが動くことを確認する。

```
DoD:
  - 呼吸・ランダムウォーク・スパーク・CELEBRATING が動作
  - 状態ステートマシンをモックデータでシミュレーション
  - idle 時 CPU < 0.5% を実測確認（M1 Mac / Core i5 基準）
  - macOS + Windows でビルド成功

Deliverable:
  - /src 以下のフロントエンド実装
  - src-tauri/src/main.rs の最小構成
  - デモ動画
```

### Phase 2 — Transport Layer (〜1 month)

**Goal:** actbuddy backend と WebSocket で繋がること。

```
DoD:
  - Go presence API の /v1/presence/stream が動作
  - Tauri IPC でイベントが JS に届く
  - 接続断・再接続（exponential backoff）が正常動作
  - Privacy Filter Lv1〜Lv4 の動作確認

Deliverable:
  - pkg/presence/ (Go)
  - src-tauri/src/transport.rs
  - E2E テスト（接続断シナリオ）
```

### Phase 3 — UX Refinement (〜2 months)

**Goal:** 「気が散らない」体験の検証と精度向上。

```
DoD:
  - Lottie Celebrating アニメーション実装・調整
  - プライバシーレベル設定 UI 完成
  - ユーザーテスト n≥5
      評価軸: Eagle et al. (2024) の3軸
        1. Companionship（仲間感）
        2. Reduced overwhelm（圧迫感のなさ）
        3. Subtle peer pressure（良い意味の緊張感）
  - 「気が散る/散らない」境界値の定量測定

Deliverable:
  - usability test report
  - animation parameter tuning log
  - settings UI
```

### Phase 4 — actbuddy Integration (〜3 months)

**Goal:** actbuddy v1.0 と統合してリリース。

```
DoD:
  - actbuddy セッション開始/終了と dot 状態が同期
  - macOS + Windows 署名済みインストーラー
  - Calm Tech 設計原則チェックリスト全項目パス
  - CHANGELOG.md, README.md 整備

Deliverable:
  - リリースビルド
  - Calm Tech checklist (self-assessment)
  - 未踏進捗報告書への反映
```

---

## 12. Open Questions

### Technical

| Issue | Priority | Current Stance |
|---|---|---|
| macOS フルスクリーンアプリ上での always-on-top 挙動 (Xcode, Final Cut 等) | High | `set_visible_on_all_workspaces` で対応可能か Phase 1 で検証 |
| HiDPI / Retina での Canvas 描画ズレ | Medium | `devicePixelRatio` 対応を DotCanvas.tsx に組み込む（仕様済み） |
| 複数バディの dot 表示（重なり防止） | Medium | v1.0 は 1 バディのみ。v2.0 以降で複数 dot レイアウトを設計 |
| ゲームフルスクリーン時の dot の映り込み | Low | `WS_EX_TOOLWINDOW` + `SetWindowDisplayAffinity` で除外予定 |

### Design

**dot か猫か**
- dot: 抽象的・プライバシー中立・軽量・actbuddy のムジ的世界観と整合
- 猫: 感情移入しやすいが「タマゴッチ化」のリスク
- 推奨: dot をデフォルト、猫は Lv3 設定から選択できるスキンとして提供

**常時表示はアテンション・エコノミー批判と矛盾しないか**
- Weiser & Brown (1995) の calm technology 定義が根拠: 「通知で引っ張る」≠「そこにいる」
- dot は中心注意を要求しない → 質的に異なる
- ただし Phase 3 のユーザーテストでこの仮説を定量的に検証する必要がある

**バディが 0 人の時の dot はどうなるか**
- v1.0 はウィジェット全体を hide する
- 「誰もいない」を示す dot はモチベーション低下につながる可能性があるため

---

## 13. References

1. Weiser, M. & Brown, J. S. (1995). *Designing Calm Technology*. XEROX PARC.
2. Gutwin, C. & Greenberg, S. (2002). A Descriptive Framework of Workspace Awareness for Real-Time Groupware. *CSCW Journal*.
3. Morrison-Smith, S., Chilton, L. & Ruiz, J. (2021). AmbiTeam: Providing Team Awareness Through Ambient Displays. *Graphics Interface 2021*, pp. 20–27.
4. Cho, S., Lee, J. & Suh, B. (2023). "I Want to Reveal, but I Also Want to Hide". *PACM HCI (CSCW 2023)*, 7(CSCW2). DOI: 10.1145/3610091
5. Eagle, D. et al. (2024). Body Doubling as a Continuum of Space, Time, and Mutuality. [Survey n=220]
6. You Are Not Alone: Designing Body Doubling for ADHD in Virtual Reality. (2025). arXiv:2509.12153
7. Claypoole, V. L. & Szalma, J. L. (2018). Independent Coactors May Improve Performance and Lower Workload. *Human Factors*, 60(6), 822–832.
8. Calm Tech Institute (2024). Calm Tech Certified™ Criteria. calmtech.institute

---
