CREATE SCHEMA "dia_de_estrela";
--> statement-breakpoint
CREATE TABLE "dia_de_estrela"."access_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"attempts" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dia_de_estrela"."children" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"access_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "estrela_children_name" CHECK (char_length("dia_de_estrela"."children"."name") between 1 and 24),
	CONSTRAINT "estrela_children_color" CHECK ("dia_de_estrela"."children"."color" ~ '^#[0-9A-F]{6}$')
);
--> statement-breakpoint
CREATE TABLE "dia_de_estrela"."completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"date" date NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"marked_by" text NOT NULL,
	"status" text NOT NULL,
	"stars" integer NOT NULL,
	"approved_at" timestamp with time zone,
	CONSTRAINT "estrela_completion_stars" CHECK ("dia_de_estrela"."completions"."stars" between 1 and 50)
);
--> statement-breakpoint
CREATE TABLE "dia_de_estrela"."device_children" (
	"device_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	CONSTRAINT "device_children_device_id_child_id_pk" PRIMARY KEY("device_id","child_id")
);
--> statement-breakpoint
CREATE TABLE "dia_de_estrela"."devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"label" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"connected_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "estrela_device_label" CHECK (char_length("dia_de_estrela"."devices"."label") between 2 and 60)
);
--> statement-breakpoint
CREATE TABLE "dia_de_estrela"."families" (
	"user_id" text PRIMARY KEY NOT NULL,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"pin_hash" text,
	"pin_updated_at" timestamp with time zone,
	"stars_per_real" integer DEFAULT 10 NOT NULL,
	"warn_before" integer DEFAULT 5 NOT NULL,
	"repeat_every" integer DEFAULT 5 NOT NULL,
	"alert_after" integer DEFAULT 2 NOT NULL,
	"sound" boolean DEFAULT true NOT NULL,
	"voice" boolean DEFAULT true NOT NULL,
	"calm" boolean DEFAULT false NOT NULL,
	"chest_bonus" integer DEFAULT 3 NOT NULL,
	"onboarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "estrela_families_rate" CHECK ("dia_de_estrela"."families"."stars_per_real" between 1 and 100),
	CONSTRAINT "estrela_families_warn" CHECK ("dia_de_estrela"."families"."warn_before" between 0 and 30),
	CONSTRAINT "estrela_families_repeat" CHECK ("dia_de_estrela"."families"."repeat_every" between 1 and 30),
	CONSTRAINT "estrela_families_alert" CHECK ("dia_de_estrela"."families"."alert_after" between 1 and 10),
	CONSTRAINT "estrela_families_chest" CHECK ("dia_de_estrela"."families"."chest_bonus" between 0 and 50)
);
--> statement-breakpoint
CREATE TABLE "dia_de_estrela"."goals" (
	"child_id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"stars" integer NOT NULL,
	"photo" "bytea",
	"photo_mime" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "estrela_goals_name" CHECK (char_length("dia_de_estrela"."goals"."name") between 1 and 40),
	CONSTRAINT "estrela_goals_stars" CHECK ("dia_de_estrela"."goals"."stars" between 1 and 1000000),
	CONSTRAINT "estrela_goals_photo" CHECK ("dia_de_estrela"."goals"."photo" is null or octet_length("dia_de_estrela"."goals"."photo") between 1 and 250000)
);
--> statement-breakpoint
CREATE TABLE "dia_de_estrela"."guardian_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dia_de_estrela"."guardians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "estrela_guardians_not_owner" CHECK ("dia_de_estrela"."guardians"."owner_user_id" <> "dia_de_estrela"."guardians"."user_id")
);
--> statement-breakpoint
CREATE TABLE "dia_de_estrela"."ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"stars" integer NOT NULL,
	"label" text NOT NULL,
	"source_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "estrela_ledger_stars" CHECK ("dia_de_estrela"."ledger"."stars" <> 0)
);
--> statement-breakpoint
CREATE TABLE "dia_de_estrela"."notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"message_key" text NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dia_de_estrela"."pairing_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dia_de_estrela"."parent_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"date" date NOT NULL,
	"device_online" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dia_de_estrela"."push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dia_de_estrela"."redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"reward_id" uuid,
	"label" text NOT NULL,
	"kind" text NOT NULL,
	"stars" integer NOT NULL,
	"money_cents" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "estrela_redemptions_stars" CHECK ("dia_de_estrela"."redemptions"."stars" > 0)
);
--> statement-breakpoint
CREATE TABLE "dia_de_estrela"."reminder_states" (
	"child_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"date" date NOT NULL,
	"warned_at" timestamp with time zone,
	"due_count" integer DEFAULT 0 NOT NULL,
	"last_due_at" timestamp with time zone,
	"snooze_until" timestamp with time zone,
	"nudge_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_states_child_id_task_id_date_pk" PRIMARY KEY("child_id","task_id","date"),
	CONSTRAINT "estrela_reminder_count" CHECK ("dia_de_estrela"."reminder_states"."due_count" between 0 and 50)
);
--> statement-breakpoint
CREATE TABLE "dia_de_estrela"."rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"icon" text NOT NULL,
	"price_stars" integer,
	"money_cents" integer,
	"active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "estrela_rewards_name" CHECK (char_length("dia_de_estrela"."rewards"."name") between 1 and 40),
	CONSTRAINT "estrela_rewards_price" CHECK (("dia_de_estrela"."rewards"."kind" = 'custom' and "dia_de_estrela"."rewards"."price_stars" between 1 and 100000 and "dia_de_estrela"."rewards"."money_cents" is null) or ("dia_de_estrela"."rewards"."kind" = 'money' and "dia_de_estrela"."rewards"."money_cents" between 100 and 100000 and "dia_de_estrela"."rewards"."price_stars" is null))
);
--> statement-breakpoint
CREATE TABLE "dia_de_estrela"."task_voices" (
	"task_id" uuid PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"data" "bytea" NOT NULL,
	"duration_ms" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "estrela_voice_size" CHECK (octet_length("dia_de_estrela"."task_voices"."data") between 1 and 300000),
	CONSTRAINT "estrela_voice_duration" CHECK ("dia_de_estrela"."task_voices"."duration_ms" between 1 and 15500)
);
--> statement-breakpoint
CREATE TABLE "dia_de_estrela"."tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"title" text NOT NULL,
	"icon" text NOT NULL,
	"time" text NOT NULL,
	"days" integer NOT NULL,
	"duration_min" integer,
	"stars" integer NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"needs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"then_text" text,
	"detail" text,
	"remind" boolean DEFAULT true NOT NULL,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "estrela_tasks_title" CHECK (char_length("dia_de_estrela"."tasks"."title") between 1 and 40),
	CONSTRAINT "estrela_tasks_time" CHECK ("dia_de_estrela"."tasks"."time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "estrela_tasks_days" CHECK ("dia_de_estrela"."tasks"."days" between 1 and 127),
	CONSTRAINT "estrela_tasks_stars" CHECK ("dia_de_estrela"."tasks"."stars" between 1 and 50),
	CONSTRAINT "estrela_tasks_duration" CHECK ("dia_de_estrela"."tasks"."duration_min" is null or "dia_de_estrela"."tasks"."duration_min" between 5 and 180)
);
--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."children" ADD CONSTRAINT "children_user_id_families_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "dia_de_estrela"."families"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."completions" ADD CONSTRAINT "completions_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "dia_de_estrela"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."completions" ADD CONSTRAINT "completions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "dia_de_estrela"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."device_children" ADD CONSTRAINT "device_children_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "dia_de_estrela"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."device_children" ADD CONSTRAINT "device_children_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "dia_de_estrela"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."devices" ADD CONSTRAINT "devices_user_id_families_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "dia_de_estrela"."families"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."families" ADD CONSTRAINT "families_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."goals" ADD CONSTRAINT "goals_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "dia_de_estrela"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."guardian_invitations" ADD CONSTRAINT "guardian_invitations_owner_user_id_families_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "dia_de_estrela"."families"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."guardians" ADD CONSTRAINT "guardians_owner_user_id_families_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "dia_de_estrela"."families"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."guardians" ADD CONSTRAINT "guardians_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."ledger" ADD CONSTRAINT "ledger_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "dia_de_estrela"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."notification_deliveries" ADD CONSTRAINT "notification_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."pairing_codes" ADD CONSTRAINT "pairing_codes_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "dia_de_estrela"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."parent_alerts" ADD CONSTRAINT "parent_alerts_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "dia_de_estrela"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."parent_alerts" ADD CONSTRAINT "parent_alerts_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "dia_de_estrela"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."redemptions" ADD CONSTRAINT "redemptions_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "dia_de_estrela"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."redemptions" ADD CONSTRAINT "redemptions_reward_id_rewards_id_fk" FOREIGN KEY ("reward_id") REFERENCES "dia_de_estrela"."rewards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."reminder_states" ADD CONSTRAINT "reminder_states_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "dia_de_estrela"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."reminder_states" ADD CONSTRAINT "reminder_states_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "dia_de_estrela"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."rewards" ADD CONSTRAINT "rewards_user_id_families_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "dia_de_estrela"."families"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."task_voices" ADD CONSTRAINT "task_voices_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "dia_de_estrela"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dia_de_estrela"."tasks" ADD CONSTRAINT "tasks_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "dia_de_estrela"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "estrela_children_owner" ON "dia_de_estrela"."children" USING btree ("user_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "estrela_completion_once" ON "dia_de_estrela"."completions" USING btree ("child_id","task_id","date");--> statement-breakpoint
CREATE INDEX "estrela_completion_day" ON "dia_de_estrela"."completions" USING btree ("child_id","date");--> statement-breakpoint
CREATE INDEX "estrela_device_child" ON "dia_de_estrela"."device_children" USING btree ("child_id");--> statement-breakpoint
CREATE UNIQUE INDEX "estrela_device_token" ON "dia_de_estrela"."devices" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "estrela_device_owner" ON "dia_de_estrela"."devices" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "estrela_invitation_token" ON "dia_de_estrela"."guardian_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "estrela_invitation_owner" ON "dia_de_estrela"."guardian_invitations" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "estrela_guardians_one_per_family" ON "dia_de_estrela"."guardians" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "estrela_guardians_one_family" ON "dia_de_estrela"."guardians" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "estrela_ledger_source" ON "dia_de_estrela"."ledger" USING btree ("source_key");--> statement-breakpoint
CREATE INDEX "estrela_ledger_child" ON "dia_de_estrela"."ledger" USING btree ("child_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "estrela_delivery_once" ON "dia_de_estrela"."notification_deliveries" USING btree ("user_id","message_key");--> statement-breakpoint
CREATE UNIQUE INDEX "estrela_pairing_code" ON "dia_de_estrela"."pairing_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "estrela_pairing_expiry" ON "dia_de_estrela"."pairing_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "estrela_alert_once" ON "dia_de_estrela"."parent_alerts" USING btree ("child_id","task_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "estrela_push_endpoint" ON "dia_de_estrela"."push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "estrela_push_user" ON "dia_de_estrela"."push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "estrela_redemptions_child" ON "dia_de_estrela"."redemptions" USING btree ("child_id","status");--> statement-breakpoint
CREATE INDEX "estrela_rewards_owner" ON "dia_de_estrela"."rewards" USING btree ("user_id","position");--> statement-breakpoint
CREATE INDEX "estrela_tasks_child" ON "dia_de_estrela"."tasks" USING btree ("child_id");