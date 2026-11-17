ALTER TABLE "recreio"."group_invites" ADD COLUMN "sender_label" text;--> statement-breakpoint
ALTER TABLE "recreio"."group_invites" ADD CONSTRAINT "recreio_group_invite_sender_label" CHECK ("recreio"."group_invites"."sender_label" is null or
      ("recreio"."group_invites"."state"='pending' and char_length("recreio"."group_invites"."sender_label") between 2 and 20));