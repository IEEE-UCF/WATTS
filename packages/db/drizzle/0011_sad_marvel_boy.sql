-- photo_urls was a plain `text` column mistakenly typed as string[] in the app layer
-- (see packages/db/src/schema.ts). Any existing value is a bare URL string written by
-- that mismatch, not array literal syntax, so a plain ::text[] cast would fail — wrap
-- each non-null value in a one-element array instead.
ALTER TABLE "projects" ALTER COLUMN "photo_urls" SET DATA TYPE text[] USING (
	CASE WHEN "photo_urls" IS NULL THEN NULL ELSE ARRAY["photo_urls"] END
);