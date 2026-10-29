import { catalog } from "@/lib/catalog";
import { houseRules } from "@/lib/rules";
import { shop } from "@/lib/shop";
import { Shopfront } from "./shopfront";

// The buyer's page: chat with the shopkeeper, see the catalog, pay the order through PayPal.
export default function Home() {
  return <Shopfront shop={shop} catalog={catalog} rules={houseRules} />;
}
