-- Storefront landing hero image, managed from admin settings.
ALTER TABLE "BusinessSettings" ADD COLUMN IF NOT EXISTS "landingHeroImageUrl" TEXT;
