-- Email is a shared credential. Close all web roots (children cascade) and
-- outstanding old-address proofs in the same transaction as the identity update.
-- Edi/Bastidores sessions, factors, contracts and licenses are separate domains.
CREATE FUNCTION core.invalidate_web_email_access() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM core.sessions WHERE user_id = OLD.id AND origin_app = 'conta';
  -- An outstanding family invitation must not follow a released address to a
  -- different person who later registers it. Existing memberships keep their ID.
  UPDATE family.invitations SET revoked_at = now()
  WHERE email = lower(OLD.email) AND accepted_at IS NULL AND revoked_at IS NULL;
  DELETE FROM core.verifications
  WHERE identifier IN (
    'email-verification-otp-' || lower(OLD.email),
    'forget-password-otp-' || lower(OLD.email),
    'sign-in-otp-' || lower(OLD.email)
  )
  OR left(identifier, length('change-email-otp-' || lower(OLD.email) || '-')) =
     'change-email-otp-' || lower(OLD.email) || '-'
  OR (value = OLD.id AND (
    left(identifier, 4) = '2fa-'
    OR left(identifier, 13) = 'trust-device-'
    OR left(identifier, 15) = 'reset-password:'
  ));
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER users_web_email_change
AFTER UPDATE OF email ON core.users
FOR EACH ROW WHEN (lower(OLD.email) IS DISTINCT FROM lower(NEW.email))
EXECUTE FUNCTION core.invalidate_web_email_access();
