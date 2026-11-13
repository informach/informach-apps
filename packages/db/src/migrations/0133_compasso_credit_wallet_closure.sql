-- All writers, including an older app during a rollout, share the same source lock.
-- Funding facts may still arrive; spending must never reopen a migrated source.
CREATE FUNCTION billing.guard_migrated_credit_ledger() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, billing AS $$
BEGIN
  IF NEW.owner_type::text = 'user' AND NEW.app IN ('cozya', 'agenda-da-turma') THEN
    PERFORM pg_advisory_xact_lock(hashtext('user:' || NEW.owner_id));
    IF NEW.entry_type::text = 'consumption' AND EXISTS (
      SELECT 1 FROM billing.credit_wallet_migrations
      WHERE source_user_id = NEW.owner_id AND source_app = NEW.app
    ) THEN
      RAISE EXCEPTION 'Legacy credit wallet is closed after migration'
        USING ERRCODE = '23514', CONSTRAINT = 'credit_wallet_closed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER credit_wallet_ledger_closure
BEFORE INSERT OR UPDATE OF owner_type, owner_id, app, entry_type, amount
ON billing.credit_ledger FOR EACH ROW EXECUTE FUNCTION billing.guard_migrated_credit_ledger();
--> statement-breakpoint
CREATE FUNCTION billing.guard_migrated_credit_reservation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, billing AS $$
BEGIN
  IF NEW.owner_type::text = 'user' AND NEW.app IN ('cozya', 'agenda-da-turma') AND NEW.status::text = 'active' THEN
    PERFORM pg_advisory_xact_lock(hashtext('user:' || NEW.owner_id));
    IF EXISTS (
      SELECT 1 FROM billing.credit_wallet_migrations
      WHERE source_user_id = NEW.owner_id AND source_app = NEW.app
    ) THEN
      RAISE EXCEPTION 'Legacy credit wallet is closed after migration'
        USING ERRCODE = '23514', CONSTRAINT = 'credit_wallet_closed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER credit_wallet_reservation_closure
BEFORE INSERT OR UPDATE OF owner_type, owner_id, app, status
ON billing.credit_reservations FOR EACH ROW EXECUTE FUNCTION billing.guard_migrated_credit_reservation();
--> statement-breakpoint
CREATE FUNCTION billing.guard_credit_wallet_migration() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, billing AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('user:' || NEW.source_user_id));
  IF EXISTS (
    SELECT 1 FROM billing.credit_reservations
    WHERE owner_type::text = 'user' AND owner_id = NEW.source_user_id
      AND app = NEW.source_app AND status::text = 'active'
  ) THEN
    RAISE EXCEPTION 'Resolve legacy reservations before migration'
      USING ERRCODE = '23514', CONSTRAINT = 'credit_wallet_unresolved_reservations';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER credit_wallet_migration_reservation_guard
BEFORE INSERT ON billing.credit_wallet_migrations
FOR EACH ROW EXECUTE FUNCTION billing.guard_credit_wallet_migration();
