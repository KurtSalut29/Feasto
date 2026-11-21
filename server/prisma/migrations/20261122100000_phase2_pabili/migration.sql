-- Phase 2: the new Pabili. Shops listed by kind, clear items (amount, unit, estimate, what to do
-- if it's out), and the things that can't be bought or need a prescription or an adult.

CREATE TYPE "ShopCategory" AS ENUM ('GROCERY', 'SARI_SARI', 'MARKET', 'RICE', 'BAKERY', 'PHARMACY', 'HARDWARE', 'SCHOOL_SUPPLIES', 'WATER', 'LPG', 'AGRI_PET', 'PERSONAL_CARE', 'GADGETS', 'FRUITS', 'OTHER');
CREATE TYPE "RestrictRule" AS ENUM ('BANNED', 'PRESCRIPTION', 'ALCOHOL', 'TOBACCO', 'CHEMICAL', 'LPG', 'BULKY');
CREATE TYPE "SuggestionStatus" AS ENUM ('OPEN', 'ADDED', 'DISMISSED');

CREATE TABLE "PabiliShop" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ShopCategory" NOT NULL,
    "barangay" TEXT,
    "landmark" TEXT NOT NULL,
    "hours" TEXT,
    "vendorId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PabiliShop_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PabiliShop_category_isActive_idx" ON "PabiliShop"("category", "isActive");
ALTER TABLE "PabiliShop" ADD CONSTRAINT "PabiliShop_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PabiliShopSuggestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "category" "ShopCategory" NOT NULL,
    "location" TEXT NOT NULL,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PabiliShopSuggestion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PabiliShopSuggestion_status_createdAt_idx" ON "PabiliShopSuggestion"("status", "createdAt");
ALTER TABLE "PabiliShopSuggestion" ADD CONSTRAINT "PabiliShopSuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "RestrictedTerm" (
    "id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "rule" "RestrictRule" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RestrictedTerm_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RestrictedTerm_term_key" ON "RestrictedTerm"("term");

ALTER TABLE "Errand"
    ADD COLUMN "shopId" TEXT,
    ADD COLUMN "shopCategory" "ShopCategory",
    ADD COLUMN "prescriptionFile" TEXT,
    ADD COLUMN "adultCheck" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "handling" TEXT[] DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "estimateTotal" DECIMAL(10,2),
    ADD COLUMN "itemsPhotoUrl" TEXT,
    ADD COLUMN "priceFlag" TEXT,
    ADD COLUMN "idCheckedAt" TIMESTAMP(3),
    ADD COLUMN "confirmedAt" TIMESTAMP(3);
ALTER TABLE "Errand" ADD CONSTRAINT "Errand_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "PabiliShop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The resident's birth date as on their ID: alcohol and cigarettes are for 18 and older
ALTER TABLE "User" ADD COLUMN "birthDate" DATE;

-- A liquor ban (elections, a typhoon, a local order): no alcohol through Pabili while it's on
ALTER TABLE "PlatformSettings" ADD COLUMN "liquorBan" BOOLEAN NOT NULL DEFAULT false;

-- The starting list of words, in Filipino and English. The admin edits it in Admin › Pabili.
INSERT INTO "RestrictedTerm" ("id", "term", "rule") SELECT 'rt_' || md5(t.term), t.term, t.rule::"RestrictRule" FROM (VALUES
    -- Dangerous drugs (RA 9165) and drugs of abuse
    ('shabu', 'BANNED'), ('marijuana', 'BANNED'), ('weed', 'BANNED'), ('tramadol', 'BANNED'), ('diazepam', 'BANNED'), ('valium', 'BANNED'),
    ('alprazolam', 'BANNED'), ('xanax', 'BANNED'), ('clonazepam', 'BANNED'), ('nalbuphine', 'BANNED'), ('nubain', 'BANNED'), ('ketamine', 'BANNED'),
    -- Firecrackers, guns, blades
    ('paputok', 'BANNED'), ('firecracker', 'BANNED'), ('fireworks', 'BANNED'), ('kwitis', 'BANNED'), ('baril', 'BANNED'), ('gun', 'BANNED'),
    ('bala', 'BANNED'), ('bullet', 'BANNED'), ('ammo', 'BANNED'), ('balisong', 'BANNED'), ('patalim', 'BANNED'),
    -- Fuel in bottles or gallons
    ('gasolina', 'BANNED'), ('gasoline', 'BANNED'), ('diesel', 'BANNED'), ('gaas', 'BANNED'), ('kerosene', 'BANNED'),
    -- Money, load, betting, bills
    ('load', 'BANNED'), ('e-load', 'BANNED'), ('eload', 'BANNED'), ('cash in', 'BANNED'), ('cash-in', 'BANNED'),
    ('lotto', 'BANNED'), ('stl', 'BANNED'), ('bills payment', 'BANNED'), ('bayad bills', 'BANNED'), ('pera', 'BANNED'),
    -- Live animals
    ('buhay na manok', 'BANNED'), ('live chicken', 'BANNED'), ('tuta', 'BANNED'), ('puppy', 'BANNED'), ('kuting', 'BANNED'), ('kitten', 'BANNED'), ('biik', 'BANNED'), ('sisiw', 'BANNED'),
    -- Prescription medicine (the pharmacist still decides)
    ('amoxicillin', 'PRESCRIPTION'), ('amoxil', 'PRESCRIPTION'), ('co-amoxiclav', 'PRESCRIPTION'), ('cefalexin', 'PRESCRIPTION'), ('cephalexin', 'PRESCRIPTION'),
    ('azithromycin', 'PRESCRIPTION'), ('ciprofloxacin', 'PRESCRIPTION'), ('clindamycin', 'PRESCRIPTION'), ('doxycycline', 'PRESCRIPTION'), ('metronidazole', 'PRESCRIPTION'),
    ('antibiotic', 'PRESCRIPTION'), ('antibiotiko', 'PRESCRIPTION'), ('metformin', 'PRESCRIPTION'), ('losartan', 'PRESCRIPTION'), ('amlodipine', 'PRESCRIPTION'),
    ('insulin', 'PRESCRIPTION'), ('prednisone', 'PRESCRIPTION'), ('codeine', 'PRESCRIPTION'), ('reseta', 'PRESCRIPTION'),
    -- Alcohol (18 and older, none during a liquor ban)
    ('alak', 'ALCOHOL'), ('beer', 'ALCOHOL'), ('serbesa', 'ALCOHOL'), ('gin', 'ALCOHOL'), ('ginebra', 'ALCOHOL'), ('tanduay', 'ALCOHOL'), ('red horse', 'ALCOHOL'),
    ('pale pilsen', 'ALCOHOL'), ('emperador', 'ALCOHOL'), ('alfonso', 'ALCOHOL'), ('wine', 'ALCOHOL'), ('vodka', 'ALCOHOL'),
    ('whisky', 'ALCOHOL'), ('whiskey', 'ALCOHOL'), ('rum', 'ALCOHOL'), ('brandy', 'ALCOHOL'), ('empi', 'ALCOHOL'), ('lambanog', 'ALCOHOL'), ('tuba', 'ALCOHOL'),
    -- Cigarettes and vapes (RA 11900: 18 and older)
    ('yosi', 'TOBACCO'), ('sigarilyo', 'TOBACCO'), ('cigarette', 'TOBACCO'), ('cigarettes', 'TOBACCO'), ('marlboro', 'TOBACCO'),
    ('vape', 'TOBACCO'), ('e-cig', 'TOBACCO'), ('pod', 'TOBACCO'), ('pods', 'TOBACCO'), ('tabako', 'TOBACCO'),
    -- Chemicals: sealed only, and the rider is told
    ('muriatic', 'CHEMICAL'), ('asido', 'CHEMICAL'), ('thinner', 'CHEMICAL'), ('lacquer', 'CHEMICAL'), ('pesticide', 'CHEMICAL'),
    ('herbicide', 'CHEMICAL'), ('lason', 'CHEMICAL'), ('chlorine', 'CHEMICAL'), ('vulcaseal', 'CHEMICAL'),
    -- Cooking gas tanks
    ('lpg', 'LPG'), ('gasul', 'LPG'), ('solane', 'LPG'), ('tangke ng gas', 'LPG'),
    -- Heavy or long things
    ('semento', 'BULKY'), ('cement', 'BULKY'), ('hollow block', 'BULKY'), ('hollow blocks', 'BULKY'), ('yero', 'BULKY'), ('plywood', 'BULKY'),
    ('tubo', 'BULKY'), ('pvc pipe', 'BULKY'), ('rebar', 'BULKY')
) AS t(term, rule);
