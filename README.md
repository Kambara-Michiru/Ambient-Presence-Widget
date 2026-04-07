# Ambient Presence Widget

> バディの「気配」をデスクトップに常駐させる — actbuddy のコアモジュール

---

## これは何？

デスクトップの隅に、小さな光る点（dot）を表示するアプリです。

その点は、一緒に作業する仲間（バディ）の「いま」を表しています。チャットも通知も出しません。ただ、そこにいる気配だけを届けます。

```
┌─────────────────────────────┐
│  デスクトップ               │
│                             │
│  ●  ← これだけ             │
│  （バディが作業中）         │
│                             │
└─────────────────────────────┘
```

点の色や動き方で、バディの状態がわかります。

| 点の状態 | 意味 |
|---|---|
| 薄いグレー、ほぼ見えない | オフライン（接続なし） |
| 小さく縮んだ青グレー | 離席中・スリープ |
| ゆっくり呼吸する青 | ログイン中・待機 |
| 呼吸するオレンジ、光る | セッション中・作業中 |
| 黄色くキラッと光る | タスク完了！ |

---

## なぜ作るのか

「一人で作業していると集中できない」「誰かがそこにいると頑張れる」という感覚、ありませんか？

これは **body doubling**（ボディダブリング）と呼ばれる効果で、ADHD の方を中心に研究されています。Focusmate のようなビデオ通話もその一例ですが、「常にカメラをオンにするのはしんどい」「通知が多すぎる」という声も多いです。

このウィジェットは、その中間を目指しています。

- **見ようと思えば見える**。でも引っ張らない
- カメラなし、通知なし、チャットなし
- ただ「誰かがそこにいる」ことを、周辺視野にそっと届ける

Weiser & Brown（1995）が提唱した **Calm Technology（穏やかなテクノロジー）** の考え方に基づいています。

---

## プライバシーについて

バディの「何をしているか」は一切わかりません。

開示される情報は、ユーザーが自分で設定できます。

| レベル | 名前 | 何が伝わるか |
|---|---|---|
| Lv.1 | Ghost | オンラインかどうかだけ（点があるかないか） |
| Lv.2 | Presence | Lv.1 ＋ 作業中か休憩中か（デフォルト） |
| Lv.3 | Energy | Lv.2 ＋ 集中度の高さ（点の活発さ） |
| Lv.4 | Focus | Lv.3 ＋ 作業カテゴリ（点の色） |

タスクの内容・作業時間・アプリ・URLは、設定に関わらず絶対に共有されません。

---

## 動かし方（開発者向け）

### 必要なもの

- [Node.js](https://nodejs.org/) v18以上
- [Rust](https://rustup.rs/)（`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`）
- [Go](https://go.dev/) v1.22以上（バックエンドを動かす場合）

### セットアップ

```bash
# リポジトリをクローン
git clone https://github.com/actbuddy/ambient-presence-widget
cd ambient-presence-widget

# フロントエンドの依存をインストール
npm install
```

### 開発モードで起動

**ウィジェット（フロントエンド + Tauri）**
```bash
npm run tauri dev
```

起動すると画面上に開発用ウィンドウが表示されます。ボタンを押して各状態を切り替えて確認できます。

**バックエンド（WebSocket サーバー）**
```bash
cd backend
go run .
# デフォルトは :8080 で起動。PORT=8081 などで変更可能
```

**イベントを手動で送る（動作確認用）**
```bash
curl -X POST http://localhost:8080/internal/v1/presence/event \
  -H 'Content-Type: application/json' \
  -d '{
    "event": "session_start",
    "buddy_id": "buddy-001",
    "privacy_level": 2,
    "intensity": 0.8,
    "category_hue": 220,
    "ts": "2026-04-07T10:00:00Z"
  }'
```

---

## 仕組みの概要

```
バディの actbuddy アプリ
        ↓ セッション開始・タスク完了などのイベント
  Go バックエンド（サーバー）
        ↓ WebSocket でリアルタイム配信（プライバシーフィルタ適用済み）
  Tauri（デスクトップアプリの土台）
        ↓ イベントをフロントエンドに橋渡し
  React（画面描画）
        ↓ 状態に応じてアニメーションを計算
  Canvas（点を描く）
        ↓
  あなたのデスクトップに点が表示される
```

ネットワークが切れても自動で再接続し、接続が戻るまでオフライン表示を維持します。

---

## 開発フェーズ

| フェーズ | 内容 | 状況 |
|---|---|---|
| Phase 1 | アニメーション（呼吸・ランダムウォーク・スパーク） | 完了 |
| Phase 2 | WebSocket 接続・再接続・プライバシーフィルタ | 完了 |
| Phase 3 | UX 調整・ユーザーテスト・Lottie アニメーション | 未着手 |
| Phase 4 | actbuddy 本体との統合・リリースビルド | 未着手 |

---

## 参考文献

- Weiser, M. & Brown, J. S. (1995). *Designing Calm Technology*. XEROX PARC.
- Morrison-Smith et al. (2021). AmbiTeam: Providing Team Awareness Through Ambient Displays. *Graphics Interface 2021*.
- Cho et al. (2023). "I Want to Reveal, but I Also Want to Hide". *PACM HCI (CSCW 2023)*.
- Eagle et al. (2024). Body Doubling as a Continuum of Space, Time, and Mutuality.
