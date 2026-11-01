// ============================================================
// 設定
// ============================================================
// Script Properties に以下を設定してください:
//   FIREBASE_PROJECT_ID : FirebaseのプロジェクトID
//   SERVICE_ACCOUNT_JSON: サービスアカウントのJSONキー（全文）
//   LIFF_ID             : LINE LIFF アプリの ID（例: 1234567890-abcdefgh）

var PROJECT_ID = PropertiesService.getScriptProperties().getProperty('FIREBASE_PROJECT_ID');
var LIFF_ID    = PropertiesService.getScriptProperties().getProperty('LIFF_ID');
var FIRESTORE_BASE = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID + '/databases/(default)/documents';
var FIRESTORE_DOC_PATH = 'projects/' + PROJECT_ID + '/databases/(default)/documents';
var ORGANIZATION_UUID = PropertiesService.getScriptProperties().getProperty('ORGANIZATION_UUID');
var SERIALS_PATH = (ORGANIZATION_UUID ? '/organizations/' + ORGANIZATION_UUID : '') + '/serials/';

// QRコード中央に表示するアイコン画像URL（不要な場合は空文字に）
var QR_CENTER_IMAGE_URL = 'https://members.agaruke.com/images/agaruke_icon.png';

// ============================================================
// エントリポイント: スプレッドシートのアクティブシートを読んで生成
// ============================================================
// シート形式（1行目はヘッダー）:
//   A列: count（生成枚数）
//   B列: point（付与ポイント）
//   C列: type（"once" または "recurring"、省略時は "once"）
//   D列: accumulate（TRUE/FALSE、省略時は TRUE）
//         TRUE  = total_earned_point に加算（来店・通常用途）
//         FALSE = point のみ加算（アンケート・クチコミなど累積対象外）
//   E列: campaign_id（任意。同じ配布を1会員1回に制限）
//   F列: expires_at（任意。RFC3339形式の受取期限）
//
// 例:
//   count | point | type      | accumulate
//   50    | 100   | once      | TRUE
//   1     | 100   | recurring | TRUE
//   1     | 100   | once      | FALSE   ← アンケート用

function generateSerials() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert('データがありません。2行目以降に count と point を入力してください。');
    return;
  }

  var token = getAccessToken();
  var totalGenerated = 0;
  var results = [];

  for (var i = 2; i <= lastRow; i++) {
    var count = parseInt(sheet.getRange(i, 1).getValue());
    var point = parseInt(sheet.getRange(i, 2).getValue());
    var type_ = sheet.getRange(i, 3).getValue().toString().trim().toLowerCase();
    if (type_ !== 'recurring') type_ = 'once';
    var accumVal = sheet.getRange(i, 4).getValue();
    var accumulate = (accumVal === '' || accumVal === null || accumVal === true || String(accumVal).toUpperCase() === 'TRUE');
    var campaignId = sheet.getRange(i, 5).getValue().toString().trim();
    var expiresAt = sheet.getRange(i, 6).getValue().toString().trim();

    if (isNaN(count) || count <= 0) continue;
    if (count > 400) throw new Error('行' + i + ': 一度の発行は400枚以下にしてください');
    if (isNaN(point) || point <= 0 || point > 100000) throw new Error('行' + i + ': point は1〜100000で指定してください');
    if (campaignId && !/^[a-z0-9][a-z0-9-]{2,80}$/.test(campaignId)) throw new Error('行' + i + ': campaign_id の形式が不正です');
    if (expiresAt && (isNaN(Date.parse(expiresAt)) || !/^\d{4}-\d{2}-\d{2}T/.test(expiresAt))) throw new Error('行' + i + ': expires_at はRFC3339形式で指定してください');

    var codes = generateUniqueCodes(count);
    batchWrite(codes, point, type_, accumulate, campaignId, expiresAt, token);
    writeResultsToSheet(codes, point, type_, accumulate);

    results.push('行' + i + ': ' + count + '枚 (' + point + 'pt, ' + type_ + ', accumulate=' + accumulate + ') 生成完了');
    totalGenerated += count;
  }

  var message = results.join('\n') + '\n\n合計 ' + totalGenerated + ' 枚生成しました。';
  SpreadsheetApp.getUi().alert(message);
  Logger.log(message);
}

// ============================================================
// コード生成
// ============================================================

function generateUniqueCodes(count) {
  var codes = {};
  while (Object.keys(codes).length < count) {
    codes[generateCode()] = true;
  }
  return Object.keys(codes);
}

function generateCode() {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  var code = 'FR';
  // UUID全体をハッシュし、従来のFR+8文字形式に写像する。
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + ':' + Utilities.getUuid());
  for (var i = 0; i < 8; i++) {
    code += chars.charAt((digest[i] + 256) % chars.length);
  }
  return code;
}

// ============================================================
// 生成結果をシートに書き出し
// ============================================================
// 出力先: "生成結果" シート
//   A列: シリアルナンバー
//   B列: ポイント
//   C列: 生成日時
//   D列: QRコード（IMAGE数式）

function writeResultsToSheet(codes, point, type_, accumulate) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var resultSheet = ss.getSheetByName('生成結果') || ss.insertSheet('生成結果');

  if (resultSheet.getLastRow() === 0) {
    var header = resultSheet.getRange(1, 1, 1, 6);
    header.setValues([['シリアルナンバー', 'ポイント', 'タイプ', '累積対象', '生成日時', 'QRコード']]);
    header.setFontWeight('bold');
    resultSheet.setFrozenRows(1);
    resultSheet.setColumnWidth(1, 160);
    resultSheet.setColumnWidth(2, 80);
    resultSheet.setColumnWidth(3, 100);
    resultSheet.setColumnWidth(4, 90);
    resultSheet.setColumnWidth(5, 160);
    resultSheet.setColumnWidth(6, 130);
  }

  var startRow = resultSheet.getLastRow() + 1;
  var now = new Date();

  var data = codes.map(function(code) { return [code, point, type_, accumulate, now, '']; });
  resultSheet.getRange(startRow, 1, data.length, 6).setValues(data);

  var formulas = codes.map(function(code) {
    var liffUrl = 'https://liff.line.me/' + LIFF_ID + '/?code=' + code;
    var qrUrl = 'https://quickchart.io/qr?size=256&text=' + encodeURIComponent(liffUrl)
      + '&dotStyle=dot&finderStyle=rounded';
    if (QR_CENTER_IMAGE_URL) {
      qrUrl += '&centerImageUrl=' + encodeURIComponent(QR_CENTER_IMAGE_URL) + '&centerImageHeight=184';
    }
    return ['=IMAGE("' + qrUrl + '")'];
  });
  resultSheet.getRange(startRow, 6, formulas.length, 1).setFormulas(formulas);

  for (var i = 0; i < codes.length; i++) {
    resultSheet.setRowHeight(startRow + i, 128);
  }
}

// ============================================================
// Firestore バッチ書き込み（最大500件/リクエスト）
// ============================================================

function batchWrite(codes, point, type_, accumulate, campaignId, expiresAt, token) {
  var chunkSize = 400;
  for (var i = 0; i < codes.length; i += chunkSize) {
    var chunk = codes.slice(i, i + chunkSize);
    var writes = chunk.map(function(code) {
      var fields = {
        point:      { integerValue: point },
        type:       { stringValue: type_ },
        accumulate: { booleanValue: accumulate }
      };
      if (type_ === 'once') {
        fields.used    = { booleanValue: false };
        fields.used_id = { stringValue: '' };
        if (campaignId) fields.campaign_id = { stringValue: campaignId };
        if (expiresAt) fields.expires_at = { timestampValue: new Date(expiresAt).toISOString() };
      }
      return {
        update: {
          name: FIRESTORE_DOC_PATH + SERIALS_PATH + code,
          fields: fields
        },
        currentDocument: { exists: false }
      };
    });

    var response = UrlFetchApp.fetch(FIRESTORE_BASE + ':commit', {
      method: 'POST',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ writes: writes }),
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
      throw new Error('Firestore commit 失敗。コード重複や権限を確認してください: ' + response.getContentText());
    }
  }
}

// ============================================================
// サービスアカウントでアクセストークン取得
// ============================================================

function getAccessToken() {
  var sa = JSON.parse(PropertiesService.getScriptProperties().getProperty('SERVICE_ACCOUNT_JSON'));

  var now = Math.floor(Date.now() / 1000);
  var header  = Utilities.base64EncodeWebSafe(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  var payload = Utilities.base64EncodeWebSafe(JSON.stringify({
    iss  : sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud  : 'https://oauth2.googleapis.com/token',
    iat  : now,
    exp  : now + 3600
  }));

  var signInput = header + '.' + payload;
  var signature = Utilities.base64EncodeWebSafe(
    Utilities.computeRsaSha256Signature(signInput, sa.private_key)
  );
  var jwt = signInput + '.' + signature;

  var response = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    contentType: 'application/x-www-form-urlencoded',
    payload: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt,
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 200) {
    throw new Error('アクセストークン取得失敗: ' + response.getContentText());
  }

  return JSON.parse(response.getContentText()).access_token;
}

// onOpen は coupon_sync.gs で一元管理
