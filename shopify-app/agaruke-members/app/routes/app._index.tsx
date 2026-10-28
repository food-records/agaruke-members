import {authenticate} from "../shopify.server";
import type {LoaderFunctionArgs} from "react-router";
export async function loader({request}: LoaderFunctionArgs) { await authenticate.admin(request); return null; }
export default function Index() { return <s-page heading="AGARUKE Members"><s-section heading="ポイントカード連携"><s-paragraph>お客様アカウントにポイントカードページを追加し、商品・カート画面へ連携案内を配置してください。設定・検証手順は運用資料で管理します。</s-paragraph></s-section></s-page>; }
