ALTER TABLE "agenda"."calendar_feeds" ADD COLUMN "web_participation_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."devices" ADD COLUMN "web_participation_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "missao_saber"."study_devices" ADD COLUMN "web_participation_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agenda"."calendar_feeds" ADD CONSTRAINT "agenda_feed_web_revision" CHECK ("agenda"."calendar_feeds"."web_participation_revision" >= 0);--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."devices" ADD CONSTRAINT "estrela_device_web_revision" CHECK ("dia_de_estrela"."devices"."web_participation_revision" >= 0);--> statement-breakpoint
ALTER TABLE "missao_saber"."study_devices" ADD CONSTRAINT "missao_study_web_revision" CHECK ("missao_saber"."study_devices"."web_participation_revision" >= 0);