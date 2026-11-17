CREATE TABLE "billing"."legacy_payment_evidence_reviews" (
	"subscription_id" uuid PRIMARY KEY NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "legacy_payment_evidence_review_order" CHECK ("billing"."legacy_payment_evidence_reviews"."resolved_at" is null or "billing"."legacy_payment_evidence_reviews"."resolved_at" >= "billing"."legacy_payment_evidence_reviews"."detected_at")
);
--> statement-breakpoint
ALTER TABLE "billing"."legacy_payment_evidence_reviews" ADD CONSTRAINT "legacy_payment_evidence_reviews_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "billing"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;