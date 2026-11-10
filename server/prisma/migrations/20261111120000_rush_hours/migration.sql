-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "peakHours" JSONB NOT NULL DEFAULT '[{"name":"Lunch rush","from":"11:00","to":"13:00","days":[0,1,2,3,4,5,6]},{"name":"Dinner rush","from":"17:00","to":"20:00","days":[0,1,2,3,4,5,6]}]';

