import '@shopify/ui-extensions/preact';
import {render} from 'preact';

export default function () {
  render(<MembersLinkExtension />, document.body);
}

function MembersLinkExtension() {
  return (
    <s-banner heading="AGARUKE Membersポイント">
      <s-stack gap="base">
        <s-text>
          LINEのAGARUKE Membersカードと連携すると、支払済みのShopify注文ごとに基礎100ptが付与されます。
        </s-text>
        <s-text>
          連携処理は、Shopifyの署名付きセッショントークンを検証する専用バックエンドの公開後に有効になります。
        </s-text>
        <s-link href="https://members.agaruke.com">
          AGARUKE Membersを開く
        </s-link>
      </s-stack>
    </s-banner>
  );
}
