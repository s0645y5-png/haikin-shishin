# 配筋指針 計算機（アプリ本体・公開リポジトリ）

設計中・配筋検査中にスマホで使う配筋支援アプリ。GitHub Pages で配布：https://s0645y5-png.github.io/haikin-shishin/
姉妹アプリ：配筋検査アプリ（s0645y5-png/haikin-kensa）。見た目と作りを合わせている。

## 絶対に守ること
- **このリポジトリは公開（Public）。配筋指針の内容を入れない**：指針の表の数値・本文・図・PDF・データファイル（.json）は置かない。
  指針は日本建築学会の著作物で、社内・個人利用に限る。データは非公開リポジトリ `s0645y5-png/haikin-shishin-data` で扱う。
- `app.js` に表の数値を書かない。数値はすべてデータファイル（`format: "haikin-shishin"`）から読む。
- データファイルの形式を変えるときは、`haikin-shishin-data` の CLAUDE.md の形式説明も合わせて直す。

## 構成
- `index.html` … 画面の骨組みとスタイル（CSP もここ）
- `app.js` … プログラム本体。**画面を直すときは主にここを編集する**
  - `VIEWS`：タブごとの画面（anchor 定着 / lap 継手 / bend 加工 / cover かぶり / space あき）
  - `loadData()`：`data/shishin.json` を取りに行き、なければ端末に保存したデータ、それもなければ `showLoader()` でファイルを選ばせる
  - `UI`：選んだ条件。localStorage（`shishin:ui`）に保存。データは `shishin:data`
- `sw.js` … オフライン用キャッシュ（ネット優先）。CORE を変えたら VERSION を上げる
- `manifest.webmanifest`, `icon.svg` … ホーム画面追加用

## セキュリティ（変更時に崩さない）
- CSP でスクリプトは自サイトのみ、インラインスクリプト不可。プログラムは必ず app.js に書く（`onclick=` 属性や `<script>` の直書きは不可）
- 読み込んだデータファイルは `sanitizeData()` を通す。画面に出す値は `esc()` する

## 動作確認
- `python -m http.server 8777` で開き、スマホ幅（375px）で確認する。
  確認用のデータは `haikin-shishin-data` の `shishin.json` を `data/shishin.json` にコピーして使う（`data/` は .gitignore 済み。コミットしない）
- **app.js の `APP_VERSION` を変更のたびに上げる**（画面の一番下に表示される）
- main に送ると数分で GitHub Pages に出る

## コミット
- 日本語で簡潔に。末尾に `Co-Authored-By:` の共同作成者の行を付ける
