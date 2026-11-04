import { refurbishedRule } from "./a01-refurbished";
import { variantRule } from "./a02-variants";
import { tierRule } from "./a03-tier";
import { priceRule } from "./a04-price";
import { prebuiltRule } from "./a05-prebuilt";
import { identifierRule } from "./a06-identifiers";
import { titleRule } from "./a07-title";
import { notProductRule } from "./a08-not-product";
import { sellerRule } from "./a13-seller";
import { blocklistRule } from "./a14-blocklist";
import { attributesRule } from "./attributes";
import { connectivityRule } from "./b01-connectivity";
import { gpuLineRule } from "./b02-gpu-line";
import { modelSuffixRule } from "./b03-model-suffix";
import { packagingRule } from "./b04-packaging";
import { colourRule } from "./b05-colour";
import { capacityRule } from "./b06-capacity";
import { memoryRule } from "./b07-memory";
import { accessoryRule } from "./b08-accessory";
import { categoryRule } from "./b09-category";
import { multipackRule } from "./b10-multipack";
import { regionalRule } from "./b11-regional";
import { brandRule } from "./b14-brand";
import type { Rule } from "./context";

/**
 * Every scoring rule, in the order the breakdown shows them. A9–A12 and A15–B15 that aren't
 * listed are pipeline steps (link pre-filter, no price, revalidation, pinned URLs, stock,
 * price sanity, duplicates) handled in score.ts, learn.ts and extract/.
 */
export const RULES: Rule[] = [
  blocklistRule,
  notProductRule,
  identifierRule,
  titleRule,
  modelSuffixRule,
  variantRule,
  brandRule,
  refurbishedRule,
  prebuiltRule,
  tierRule,
  connectivityRule,
  gpuLineRule,
  packagingRule,
  colourRule,
  capacityRule,
  memoryRule,
  accessoryRule,
  categoryRule,
  multipackRule,
  regionalRule,
  attributesRule,
  sellerRule,
  priceRule,
];

export { buildContext, type Rule, type RuleContext } from "./context";
