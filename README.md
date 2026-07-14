# 編み図メーカー v2（Knit Chart Maker）

タブレット・スマホでの利用を第一優先にした編み図作成ツールです。
ビルド不要の素の HTML/CSS/JS で、ブラウザで `index.html` を開くだけで動作します。

## GitHub Pages での公開手順

1. このフォルダの中身（`index.html` / `css/` / `js/` / `.nojekyll`）を
   GitHub リポジトリの **公開したい階層にそのまま配置** します。
   - リポジトリのルート直下に置く（一番シンプル）
   - もしくは `docs/` フォルダの中に置く
   - もしくは `gh-pages` 用のブランチに置く

   どの方法でも `index.html` が「公開のルート」に来ていれば動きます。相対パスのみで
   組んであるので、`https://ユーザー名.github.io/リポジトリ名/` のようなサブパス配信でも
   パスの調整は不要です。

2. GitHub の対象リポジトリで **Settings → Pages** を開き、`Source` を以下のいずれかに設定します。
   - `Deploy from a branch` → ブランチ: `main`（または任意）、フォルダ: `/ (root)` か `/docs`
   - GitHub Actions を使う場合はデフォルトの静的サイト用ワークフローでも可

3. 数分待つと `https://ユーザー名.github.io/リポジトリ名/` で公開されます。

### `.nojekyll` について
GitHub Pages はデフォルトで Jekyll によるビルドを通しますが、このアプリは
Jekyll の処理を必要としません。念のため `.nojekyll` を同梱し、Jekyll処理をスキップして
ファイルをそのまま配信するようにしています。

### 外部CDNについて
Google Fonts（Shippori Mincho / Zen Maru Gothic）と Tabler Icons の Webフォントを
CDN から読み込んでいます。GitHub Pages 側での追加設定は不要です（利用者のブラウザが
直接CDNへアクセスします）。オフライン環境での利用が多い場合は、これらをローカルに
同梱する形に変更することも可能です。

## ローカルでの確認
インターネット経由のCDN以外は完全にオフラインで動作するので、`index.html` を
ダブルクリックしてブラウザで開くだけで動作確認できます（サーバー不要）。
