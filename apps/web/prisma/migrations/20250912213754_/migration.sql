-- CreateEnum
CREATE TYPE "EventDraftStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DECLINED', 'DELETED');

-- AlterTable
ALTER TABLE "EventDraft" ADD COLUMN     "status" "EventDraftStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "MessageIngest" ADD COLUMN     "bodyHtml" TEXT,
ADD COLUMN     "bodyPlain" TEXT,
ADD COLUMN     "focusReason" TEXT,
ADD COLUMN     "focusedScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "fromDomain" TEXT,
ADD COLUMN     "fromEmail" TEXT,
ADD COLUMN     "headers" JSONB,
ADD COLUMN     "isFocused" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "snippet" TEXT,
ADD COLUMN     "subject" TEXT;
