-- PCDiga's HTML is behind a Cloudflare challenge; its public Saleor storefront API is not.
-- Point the scraper at the API (see packages/core/src/extract/saleor.ts). Leaves an existing
-- `saleor` setting alone, so an admin's edit isn't overwritten.
UPDATE `merchants`
SET `adapter_config` = json_set(
  coalesce(`adapter_config`, '{}'),
  '$.saleor',
  json('{"endpoint":"https://pcdiga-prod.eu.saleor.cloud/graphql/","channel":"default-channel"}')
)
WHERE `base_url` LIKE '%pcdiga.com%'
  AND json_extract(coalesce(`adapter_config`, '{}'), '$.saleor') IS NULL;
