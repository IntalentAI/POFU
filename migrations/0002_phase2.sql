-- Phase 2: documentation tracking, hiring-manager welcomes, voice check-ins,
-- first-day details and knowledge categories.
-- Hand-written to only ADD columns/tables: the generated version rebuilt
-- "Organization" with DROP TABLE, which on D1 (foreign keys always on)
-- would cascade-delete every row that references it.

ALTER TABLE "Organization" ADD COLUMN "firstDayTime" TEXT NOT NULL DEFAULT '9:00 AM';
ALTER TABLE "Organization" ADD COLUMN "firstDayAddress" TEXT;
ALTER TABLE "Organization" ADD COLUMN "firstDayNotes" TEXT;
ALTER TABLE "KnowledgeItem" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'General';
ALTER TABLE "Candidate" ADD COLUMN "firstDayTime" TEXT;
ALTER TABLE "Candidate" ADD COLUMN "firstDayAddress" TEXT;
ALTER TABLE "Candidate" ADD COLUMN "firstDayNotes" TEXT;
ALTER TABLE "Candidate" ADD COLUMN "voiceConsentAt" DATETIME;
ALTER TABLE "Candidate" ADD COLUMN "onboardingReadyAt" DATETIME;

-- CreateTable
CREATE TABLE "ChecklistTemplateItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'other',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "allowUpload" BOOLEAN NOT NULL DEFAULT true,
    "dueDaysBeforeJoining" INTEGER NOT NULL DEFAULT 7,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ChecklistTemplateItem_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "candidateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'other',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "allowUpload" BOOLEAN NOT NULL DEFAULT true,
    "dueDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "submittedAt" DATETIME,
    "reviewedAt" DATETIME,
    "reviewedBy" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChecklistItem_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "candidateId" TEXT NOT NULL,
    "checklistItemId" TEXT,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedBy" TEXT NOT NULL DEFAULT 'candidate',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Document_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Document_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "ChecklistItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WelcomeMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "candidateId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorEmail" TEXT,
    "authorRole" TEXT NOT NULL DEFAULT 'Hiring manager',
    "kind" TEXT,
    "text" TEXT,
    "storageKey" TEXT,
    "contentType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "token" TEXT NOT NULL,
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remindedAt" DATETIME,
    "receivedAt" DATETIME,
    "deliveredAt" DATETIME,
    CONSTRAINT "WelcomeMessage_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VoiceCall" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "candidateId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'twilio',
    "providerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "turns" INTEGER NOT NULL DEFAULT 0,
    "transcript" TEXT NOT NULL DEFAULT '[]',
    "summary" TEXT,
    "outcome" TEXT,
    "requestedBy" TEXT NOT NULL DEFAULT 'system',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    CONSTRAINT "VoiceCall_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ChecklistItem_candidateId_idx" ON "ChecklistItem"("candidateId");
CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");
CREATE UNIQUE INDEX "WelcomeMessage_token_key" ON "WelcomeMessage"("token");
CREATE INDEX "WelcomeMessage_candidateId_idx" ON "WelcomeMessage"("candidateId");
CREATE INDEX "VoiceCall_candidateId_idx" ON "VoiceCall"("candidateId");

-- Existing journeys: the hiring-manager step now delivers a real recorded welcome
-- (and is skipped when there is none) instead of a generic message on the manager's behalf.
UPDATE "CampaignStep" SET "kind" = 'welcome', "name" = 'Hiring manager welcome',
  "offset" = CASE WHEN "anchor" = 'notice_percent' AND "offset" = 65 THEN 40 ELSE "offset" END,
  "subject" = 'A welcome message from {{hiringManager}}',
  "body" = 'Hi {{firstName}}, {{hiringManager}} recorded a welcome message for you ahead of your first day. You can watch or read it on your joining page: {{portalLink}}'
WHERE "key" = 'hm_message';

UPDATE "CampaignStep" SET "body" = 'Hi {{firstName}}, as your joining date gets closer, here''s what HR needs from you. You can see each item and upload securely on your joining page: {{portalLink}}. Please don''t send documents in this chat. Any trouble getting something together? Let me know.'
WHERE "key" = 'documentation' AND "body" LIKE '%secure links the HR team sends%';

-- New touchpoints for journeys that follow the standard template.
INSERT INTO "CampaignStep" ("id", "campaignId", "key", "name", "objective", "anchor", "offset", "kind", "optional", "subject", "body", "position")
SELECT 'p2v' || lower(hex(randomblob(10))), "id", 'voice_checkin', 'AI voice check-in', 'Hear how things are going', 'before_joining', 12, 'voice', 1,
  'Voice check-in', 'Voice check-in call (only for candidates who agreed to calls).', 20
FROM "Campaign" c WHERE EXISTS (SELECT 1 FROM "CampaignStep" s WHERE s."campaignId" = c."id" AND s."key" = 'documentation')
  AND NOT EXISTS (SELECT 1 FROM "CampaignStep" s WHERE s."campaignId" = c."id" AND s."key" = 'voice_checkin');

INSERT INTO "CampaignStep" ("id", "campaignId", "key", "name", "objective", "anchor", "offset", "kind", "optional", "subject", "body", "position")
SELECT 'p2d' || lower(hex(randomblob(10))), "id", 'docs_reminder', 'Documentation reminder', 'Close outstanding items', 'before_joining', 10, 'docs', 0,
  'A few items still to complete before {{joiningDate}}',
  'Hi {{firstName}}, a quick reminder: these items are still open before your first day. You can upload them securely on your joining page: {{portalLink}}', 21
FROM "Campaign" c WHERE EXISTS (SELECT 1 FROM "CampaignStep" s WHERE s."campaignId" = c."id" AND s."key" = 'documentation')
  AND NOT EXISTS (SELECT 1 FROM "CampaignStep" s WHERE s."campaignId" = c."id" AND s."key" = 'docs_reminder');


-- Workspaces created before Phase 2 get the standard documentation checklist
-- (one statement, so the NOT EXISTS check sees the table as it was before the insert).
INSERT INTO "ChecklistTemplateItem" ("id", "orgId", "title", "description", "category", "required", "allowUpload", "dueDaysBeforeJoining", "position")
SELECT 'p2c' || lower(hex(randomblob(10))), o."id", v.title, v.description, v.category, v.required, v.allowUpload, v.due, v.position
FROM "Organization" o
CROSS JOIN (
  SELECT column1 AS position, column2 AS title, column3 AS description, column4 AS category, column5 AS required, column6 AS allowUpload, column7 AS due
  FROM (VALUES
  (0, 'Identity verification', 'A government-issued photo ID (passport, driving licence or national ID).', 'identity', 1, 1, 14),
  (1, 'Education documents', 'Your highest degree or diploma certificate.', 'education', 1, 1, 10),
  (2, 'Employment verification', 'Relieving or experience letter from your current or most recent employer.', 'employment', 1, 1, 3),
  (3, 'Bank details', 'A cancelled cheque or bank letter showing your account details, for payroll.', 'bank', 1, 1, 7),
  (4, 'Tax documentation', 'Your tax ID document or the tax form HR sends you.', 'tax', 1, 1, 7),
  (5, 'Background verification', 'Completed by our verification partner. You''ll receive a separate consent request; nothing to upload here.', 'background', 1, 0, 3),
  (6, 'Joining forms', 'Signed joining forms (HR sends these with your offer pack).', 'forms', 1, 1, 3),
  (7, 'First-day instructions reviewed', 'Read your first-day details on this page and confirm.', 'other', 0, 0, 1))
) v
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistTemplateItem" t WHERE t."orgId" = o."id");
