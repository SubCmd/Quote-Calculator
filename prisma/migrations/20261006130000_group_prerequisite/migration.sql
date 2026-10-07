-- AlterTable
ALTER TABLE "option_group" ADD COLUMN     "depends_on_group_id" TEXT;

-- AddForeignKey
ALTER TABLE "option_group" ADD CONSTRAINT "option_group_depends_on_group_id_fkey" FOREIGN KEY ("depends_on_group_id") REFERENCES "option_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

